"""UEP metadata/query + delivery API.

Two service classes from the guide:
  * metadata/query API  -> search, object identity, provenance, manifest
  * chunk-stream API     -> HEALPix delivery tiles for the client

Run:
    uvicorn backend.api.server:app --reload --port 8000
or:
    python backend/api/server.py
"""
from __future__ import annotations

import sys
import json
import asyncio
import threading
import time
from contextlib import asynccontextmanager
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from functools import lru_cache, partial
from typing import Annotated

# Make the `uep` package importable whether run as `backend.api.server` or directly.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd
from fastapi import FastAPI, HTTPException, Path as ApiPath, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.gzip import GZipMiddleware

from uep.security import (
    RateLimiter,
    SECURITY_HEADERS,
    declared_rights,
    public_rights_mask,
    rights_ok,
)

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
DELIVERY = DATA / "delivery"
WEB = ROOT / "web"
REQUIRED_DELIVERY_FILES = (
    "manifest.json",
    "scene.json",
    "solar_system.json",
    "exoplanets.json",
    "cosmic_web.json",
    "black_holes.json",
    "nebulae.json",
    "resolved_galaxies.json",
    "cmb.json",
)


def _log_paths():
    scene = DELIVERY / "scene.json"
    print(f"[uep-api] serving web from : {WEB}")
    print(f"[uep-api] serving data from: {DELIVERY}")
    print(f"[uep-api] scene.json found : {scene.exists()} ({scene})")
    if not scene.exists():
        print("[uep-api] WARNING: scene.json missing — run backend/pipeline.py first.")


@asynccontextmanager
async def _lifespan(_: FastAPI):
    _log_paths()
    yield


app = FastAPI(
    title="Universe Experience Platform API",
    version="0.1.0",
    lifespan=_lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["Accept", "Content-Type"],
    max_age=3600,
)
app.add_middleware(GZipMiddleware, minimum_size=512, compresslevel=5)


_limiter = RateLimiter(rate=25.0, burst=60)
_resolver_limiter = RateLimiter(rate=1.0, burst=4)
RESOLVER_WORKERS = 4
RESOLVER_ARCHIVE_TIMEOUT_SECONDS = 8
RESOLVER_RESPONSE_TIMEOUT_SECONDS = 10.0
RESOLVER_QUEUE_TIMEOUT_SECONDS = 0.05
RESOLVER_CACHE_TTL_SECONDS = 300.0
RESOLVER_CACHE_MAX = 256
_resolver_executor = ThreadPoolExecutor(max_workers=RESOLVER_WORKERS, thread_name_prefix="uep-resolver")
_resolver_slots = asyncio.Semaphore(RESOLVER_WORKERS)
_resolver_cache: OrderedDict[tuple[str, str | None], tuple[float, object]] = OrderedDict()
_resolver_cache_lock = threading.Lock()


def _cache_control_for(path: str) -> str:
    """Return a cache policy matched to mutability and sensitivity."""
    if path == "/api/health" or path.startswith(("/api/search", "/api/resolve", "/api/object")):
        return "no-store, max-age=0"
    if path.startswith(("/api/", "/data/delivery/")):
        return "public, max-age=300, stale-while-revalidate=3600"
    # The entry document and ES modules form one deploy unit. Revalidate them
    # so a cached child module cannot be mixed with a newly versioned app shell.
    if path == "/" or path.endswith((".html", ".js")):
        return "no-cache, must-revalidate"
    return "public, max-age=3600"


@app.middleware("http")
async def _harden(request: Request, call_next):
    """Rate-limit API calls and apply security and path-specific cache headers."""
    # OWASP API4 — resource-consumption limit (only the /api surface).
    if request.url.path.startswith("/api/"):
        client = request.client.host if request.client else "anon"
        if not _limiter.allow(client):
            return JSONResponse({"detail": "Rate limit exceeded. Slow down."}, status_code=429,
                                headers={"Retry-After": "1", "Cache-Control": "no-store, max-age=0",
                                         **SECURITY_HEADERS})
        if request.url.path == "/api/resolve" and not _resolver_limiter.allow(client):
            return JSONResponse(
                {"detail": "Resolver rate limit exceeded. Try again shortly."},
                status_code=429,
                headers={"Retry-After": "1", "Cache-Control": "no-store, max-age=0", **SECURITY_HEADERS},
            )
    resp = await call_next(request)
    for k, v in SECURITY_HEADERS.items():
        resp.headers[k] = v
    resp.headers["Cache-Control"] = _cache_control_for(request.url.path)
    return resp


@lru_cache(maxsize=1)
def _curated() -> pd.DataFrame:
    p = DATA / "curated" / "stars.parquet"
    if not p.exists():
        raise HTTPException(503, "Curated data not built. Run backend/pipeline.py first.")
    return pd.read_parquet(p)


@lru_cache(maxsize=1)
def _manifest() -> dict:
    p = DELIVERY / "manifest.json"
    if not p.exists():
        raise HTTPException(503, "Delivery manifest missing. Run backend/pipeline.py first.")
    return json.loads(p.read_text())


@app.get("/api/health")
def health():
    missing = [name for name in REQUIRED_DELIVERY_FILES if not _payload_ready(DELIVERY / name)]
    issues = _readiness_issues() if not missing else ["delivery payload set is incomplete"]
    payload = {
        "status": "ok" if not missing and not issues else "not_ready",
        "ready": not missing and not issues,
        "service": "uep-api",
        "version": app.version,
        "missing": missing,
        "issues": issues,
    }
    return JSONResponse(payload, status_code=200 if payload["ready"] else 503)


def _payload_ready(path: Path) -> bool:
    try:
        return path.is_file() and path.stat().st_size > 0
    except OSError:
        return False


def _json_payload(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError("root must be an object")
    return value


def _readiness_issues() -> list[str]:
    """Validate the runtime data contract, not merely file existence."""
    issues: list[str] = []
    loaded: dict[str, dict] = {}
    for name in REQUIRED_DELIVERY_FILES:
        try:
            loaded[name] = _json_payload(DELIVERY / name)
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            issues.append(f"{name}: invalid JSON ({type(exc).__name__})")

    manifest = loaded.get("manifest.json", {})
    required_manifest = {
        "platform", "layer", "source_mode", "dataset_release",
        "delivery_release", "data_rights", "license", "credit",
        "total_sources", "cells",
    }
    if (
        not required_manifest.issubset(manifest)
        or not all(manifest.get(field) for field in required_manifest - {"cells", "total_sources"})
    ):
        issues.append("manifest.json: required provenance or index fields missing")
    elif (
        manifest.get("layer") != "stellar_neighbourhood"
        or not isinstance(manifest.get("cells"), list)
        or not manifest["cells"]
        or not isinstance(manifest.get("total_sources"), int)
        or manifest["total_sources"] <= 0
    ):
        issues.append("manifest.json: empty or inconsistent stellar index")

    scene = loaded.get("scene.json", {})
    scene_count = scene.get("count")
    if not isinstance(scene_count, int) or scene_count <= 0:
        issues.append("scene.json: positive count required")
    else:
        for field, width in (("positions", 3), ("colors", 3), ("mag", 1), ("source_id", 1)):
            value = scene.get(field)
            if not isinstance(value, list) or len(value) != scene_count * width:
                issues.append(f"scene.json: {field} length does not match count")
        if manifest.get("total_sources") != scene_count:
            issues.append("scene.json: count does not match manifest")

    layer_contracts = {
        "solar_system.json": ("solar_system", "planets"),
        "exoplanets.json": ("exoplanets", "systems"),
        "black_holes.json": ("black_holes", "objects"),
        "nebulae.json": ("nebulae", "objects"),
        "resolved_galaxies.json": ("galaxies", "objects"),
    }
    for name, (layer, collection) in layer_contracts.items():
        payload = loaded.get(name, {})
        if payload.get("layer") != layer or not isinstance(payload.get(collection), list) or not payload[collection]:
            issues.append(f"{name}: expected non-empty {layer} {collection}")

    provenance_files = (*layer_contracts, "cosmic_web.json", "cmb.json")
    required_provenance = {
        "source_type", "confidence", "dataset_release", "delivery_release",
        "data_rights", "license", "credit",
    }
    for name in provenance_files:
        provenance = loaded.get(name, {}).get("provenance")
        if (
            not isinstance(provenance, dict)
            or not required_provenance.issubset(provenance)
            or not all(provenance.get(field) for field in required_provenance - {"data_rights"})
            or not rights_ok(provenance)
        ):
            issues.append(f"{name}: public provenance contract missing or restricted")

    if manifest and not rights_ok(manifest):
        issues.append("manifest.json: data rights do not permit public delivery")

    cosmic = loaded.get("cosmic_web.json", {})
    if (
        cosmic.get("layer") != "cosmic_web"
        or not isinstance(cosmic.get("count"), int)
        or cosmic.get("count", 0) <= 0
        or len(cosmic.get("positions", [])) != cosmic.get("count", 0) * 3
    ):
        issues.append("cosmic_web.json: count/position contract invalid")

    cmb = loaded.get("cmb.json", {})
    if cmb.get("layer") != "cmb" or not cmb.get("facts", {}).get("temperature"):
        issues.append("cmb.json: temperature facts missing")

    curated_path = DATA / "curated" / "stars.parquet"
    try:
        curated = pd.read_parquet(
            curated_path,
            columns=["source_id", "source_type", "dataset_release", "delivery_release", "data_rights"],
        )
        if curated.empty:
            issues.append("curated/stars.parquet: no rows")
    except Exception as exc:
        issues.append(f"curated/stars.parquet: unreadable or schema mismatch ({type(exc).__name__})")

    cells = manifest.get("cells") if isinstance(manifest.get("cells"), list) else []
    expected_tiles = {
        f"tile_{cell.get('healpix')}.json"
        for cell in cells
        if isinstance(cell, dict) and isinstance(cell.get("healpix"), int)
    }
    tile_dir = DELIVERY / "tiles"
    actual_tiles = {path.name for path in tile_dir.glob("tile_*.json")} if tile_dir.is_dir() else set()
    if not expected_tiles or actual_tiles != expected_tiles:
        issues.append("tiles: files do not exactly match the current manifest")
    elif expected_tiles:
        sample_name = min(expected_tiles)
        try:
            tile_payload = _json_payload(tile_dir / sample_name)
            count = tile_payload.get("count")
            if (
                not isinstance(count, int)
                or count <= 0
                or len(tile_payload.get("positions", [])) != count * 3
                or len(tile_payload.get("source_id", [])) != count
            ):
                issues.append(f"tiles/{sample_name}: count/array contract invalid")
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            issues.append(f"tiles/{sample_name}: invalid JSON ({type(exc).__name__})")
    return issues


@app.get("/api/manifest")
def manifest():
    """Layer manifest: frame, cosmology, release, tile index, provenance summary."""
    return JSONResponse(_manifest())


@app.get("/api/solar_system")
def solar_system():
    """Solar System layer payload (Keplerian elements, bodies, moons, rings)."""
    p = DELIVERY / "solar_system.json"
    if not p.exists():
        raise HTTPException(503, "Solar System data missing. Run backend/pipeline.py first.")
    return FileResponse(p, media_type="application/json")


@app.get("/api/exoplanets")
def exoplanets():
    p = DELIVERY / "exoplanets.json"
    if not p.exists():
        raise HTTPException(503, "Exoplanet data missing. Run backend/pipeline.py first.")
    return FileResponse(p, media_type="application/json")


@app.get("/api/cosmic_web")
def cosmic_web():
    p = DELIVERY / "cosmic_web.json"
    if not p.exists():
        raise HTTPException(503, "Cosmic-web data missing. Run backend/pipeline.py first.")
    return FileResponse(p, media_type="application/json")


@app.get("/api/black_holes")
def black_holes():
    p = DELIVERY / "black_holes.json"
    if not p.exists():
        raise HTTPException(503, "Black-hole data missing. Run backend/pipeline.py first.")
    return FileResponse(p, media_type="application/json")


@app.get("/api/nebulae")
def nebulae():
    p = DELIVERY / "nebulae.json"
    if not p.exists():
        raise HTTPException(503, "Nebula data missing. Run backend/pipeline.py first.")
    return FileResponse(p, media_type="application/json")


@app.get("/api/galaxies")
def galaxies():
    p = DELIVERY / "resolved_galaxies.json"
    if not p.exists():
        raise HTTPException(503, "Galaxy data missing. Run backend/pipeline.py first.")
    return FileResponse(p, media_type="application/json")


@app.get("/api/cmb")
def cmb():
    p = DELIVERY / "cmb.json"
    if not p.exists():
        raise HTTPException(503, "CMB data missing. Run backend/pipeline.py first.")
    return FileResponse(p, media_type="application/json")


@app.get("/api/tile/{healpix}")
def tile(healpix: Annotated[int, ApiPath(ge=0, le=767)]):
    """Stream one HEALPix delivery tile (positions, colours, mags, provenance)."""
    p = DELIVERY / "tiles" / f"tile_{healpix}.json"
    if not p.exists():
        raise HTTPException(404, f"No tile for HEALPix cell {healpix}")
    return FileResponse(p, media_type="application/json")


@app.get("/api/archives")
def archives_list():
    """List the federated archive adapters and their availability/credits."""
    from uep import archives
    return {"adapters": archives.list_adapters()}


def _resolve_cached(name: str, prefer: str | None):
    from uep import archives

    key = (name.casefold(), prefer)
    now = time.monotonic()
    with _resolver_cache_lock:
        cached = _resolver_cache.get(key)
        if cached and cached[0] > now:
            _resolver_cache.move_to_end(key)
            return cached[1]
        if cached:
            _resolver_cache.pop(key, None)

    result = archives.resolve(name, prefer=prefer, timeout=RESOLVER_ARCHIVE_TIMEOUT_SECONDS)
    if result is not None:
        with _resolver_cache_lock:
            expires_at = time.monotonic() + RESOLVER_CACHE_TTL_SECONDS
            _resolver_cache[key] = (expires_at, result)
            _resolver_cache.move_to_end(key)
            while len(_resolver_cache) > RESOLVER_CACHE_MAX:
                _resolver_cache.popitem(last=False)
    return result


@app.get("/api/resolve")
async def resolve(
    name: Annotated[str, Query(min_length=1, max_length=128)],
    prefer: Annotated[str | None, Query(pattern="^(simbad|ned)$")] = None,
):
    """Resolve any object name against the federated archives (SIMBAD → NED)."""
    name = name.strip()
    if not name:
        raise HTTPException(422, "Object name must contain a non-whitespace character.")
    try:
        await asyncio.wait_for(_resolver_slots.acquire(), timeout=RESOLVER_QUEUE_TIMEOUT_SECONDS)
    except asyncio.TimeoutError as exc:
        raise HTTPException(503, "Name resolver is busy. Try again shortly.") from exc

    loop = asyncio.get_running_loop()
    slots = _resolver_slots
    raw_future = _resolver_executor.submit(partial(_resolve_cached, name, prefer))

    def release_slot(_):
        # During process/test shutdown the request loop may already be closed;
        # that semaphore is then unreachable and needs no further release.
        if loop.is_closed():
            return
        try:
            loop.call_soon_threadsafe(slots.release)
        except RuntimeError:
            pass

    raw_future.add_done_callback(release_slot)
    wrapped_future = asyncio.wrap_future(raw_future)
    try:
        r = await asyncio.wait_for(
            asyncio.shield(wrapped_future),
            timeout=RESOLVER_RESPONSE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        # The worker retains its semaphore slot until the archive call really
        # exits, preventing timed-out work from growing an unbounded queue. The
        # asyncio bridge is no longer needed and is cancelled so a late worker
        # result cannot target a request loop that has already closed.
        wrapped_future.cancel()
        raise HTTPException(504, "Name resolver timed out.") from exc
    if r is None:
        raise HTTPException(404, f"Could not resolve {name!r} against any archive.")
    return r.to_dict()


@app.get("/api/search")
def search(
    q: Annotated[str, Query(min_length=1, max_length=128)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    """Resolve an object by name / source_id (SIMBAD-style name resolver stub)."""
    df = _curated()
    ql = q.strip().lower()
    if not ql:
        raise HTTPException(422, "Search query must contain a non-whitespace character.")
    mask = (df["name"].fillna("").str.lower().str.contains(ql, regex=False, na=False) |
            df["source_id"].astype(str).str.lower().str.contains(ql, regex=False, na=False))
    mask &= public_rights_mask(df)
    hits = df[mask].head(limit)
    return {"query": q, "count": int(len(hits)),
            "results": [_object_record(r) for _, r in hits.iterrows()]}


@app.get("/api/object/{source_id}")
def object_detail(
    source_id: Annotated[str, ApiPath(min_length=1, max_length=128)],
):
    """Full object record including the provenance payload."""
    df = _curated()
    row = df[df["source_id"].astype(str) == source_id]
    if row.empty:
        raise HTTPException(404, f"Object {source_id} not found")
    # OWASP API1/API3 — object-level authorisation against data-rights metadata.
    source = row.iloc[0]
    if not rights_ok(source):
        raise HTTPException(403, "This object's data rights do not permit public access.")
    rec = _object_record(source, full=True)
    credit = rec.get("provenance", {}).get("credit", "")
    return JSONResponse(rec, headers={"X-Data-Credit": credit} if credit else {})


def _object_record(r, full: bool = False) -> dict:
    rights_values = declared_rights(r)
    rights = rights_values[0] if rights_values else None
    rec = {
        "source_id": str(r["source_id"]),
        "name": (r.get("name") or "") if isinstance(r.get("name"), str) else "",
        "ra": float(r["ra"]), "dec": float(r["dec"]),
        "distance_pc": float(r["distance_pc"]),
        "phot_g_mean_mag": float(r["phot_g_mean_mag"]),
        "provenance": {
            "source_type": r["source_type"],
            "confidence": r["confidence"],
            "visualisation_mode": r["visualisation_mode"],
            "distance_method": r["distance_method"],
            "measurement_epoch": (None if pd.isna(r.get("measurement_epoch"))
                                  else float(r["measurement_epoch"])),
            "dataset_release": r["dataset_release"],
            "delivery_release": r.get("delivery_release"),
            "credit": r["credit"],
            "license": r["license"],
            "data_rights": rights,
        },
    }
    if full:
        rec["galactic_xyz_pc"] = [float(r["gx_pc"]), float(r["gy_pc"]), float(r["gz_pc"])]
        du = r.get("distance_unc_pc")
        rec["distance_unc_pc"] = None if pd.isna(du) else float(du)
        rec["healpix"] = int(r["healpix"])
    return rec


# Serve the web client and public delivery payloads for the one-command demo.
if WEB.exists():
    app.mount("/data/delivery", StaticFiles(directory=str(DELIVERY)), name="delivery")
    app.mount("/", StaticFiles(directory=str(WEB), html=True), name="web")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
