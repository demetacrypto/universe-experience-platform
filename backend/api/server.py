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
from pathlib import Path
from functools import lru_cache

# Make the `uep` package importable whether run as `backend.api.server` or directly.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles

from uep.security import RateLimiter, SECURITY_HEADERS, rights_ok

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
DELIVERY = DATA / "delivery"
WEB = ROOT / "web"

app = FastAPI(title="Universe Experience Platform API", version="0.1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


_limiter = RateLimiter(rate=25.0, burst=60)


@app.middleware("http")
async def _harden(request: Request, call_next):
    """Rate-limit API calls, add security headers, and keep the dev no-cache policy."""
    # OWASP API4 — resource-consumption limit (only the /api surface).
    if request.url.path.startswith("/api/"):
        client = request.client.host if request.client else "anon"
        if not _limiter.allow(client):
            return JSONResponse({"detail": "Rate limit exceeded. Slow down."}, status_code=429,
                                headers={"Retry-After": "1", **SECURITY_HEADERS})
    resp = await call_next(request)
    for k, v in SECURITY_HEADERS.items():
        resp.headers[k] = v
    resp.headers["Cache-Control"] = "no-store, max-age=0"
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
    return {"status": "ok", "service": "uep-api", "version": app.version}


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
def tile(healpix: int):
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


@app.get("/api/resolve")
def resolve(name: str = Query(..., min_length=1), prefer: str | None = None):
    """Resolve any object name against the federated archives (SIMBAD → NED)."""
    from uep import archives
    r = archives.resolve(name, prefer=prefer)
    if r is None:
        raise HTTPException(404, f"Could not resolve {name!r} against any archive.")
    return r.to_dict()


@app.get("/api/search")
def search(q: str = Query(..., min_length=1), limit: int = 20):
    """Resolve an object by name / source_id (SIMBAD-style name resolver stub)."""
    df = _curated()
    ql = q.lower()
    mask = (df["name"].fillna("").str.lower().str.contains(ql) |
            df["source_id"].astype(str).str.lower().str.contains(ql))
    hits = df[mask].head(limit)
    return {"query": q, "count": int(len(hits)),
            "results": [_object_record(r) for _, r in hits.iterrows()]}


@app.get("/api/object/{source_id}")
def object_detail(source_id: str):
    """Full object record including the provenance payload."""
    df = _curated()
    row = df[df["source_id"].astype(str) == source_id]
    if row.empty:
        raise HTTPException(404, f"Object {source_id} not found")
    rec = _object_record(row.iloc[0], full=True)
    # OWASP API1/API3 — object-level authorisation against data-rights metadata.
    if not rights_ok({"data_rights": row.iloc[0].get("data_rights")}):
        raise HTTPException(403, "This object's data rights do not permit public access.")
    credit = rec.get("provenance", {}).get("credit", "")
    return JSONResponse(rec, headers={"X-Data-Credit": credit} if credit else {})


def _object_record(r, full: bool = False) -> dict:
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
            "credit": r["credit"],
            "license": r["license"],
        },
    }
    if full:
        rec["galactic_xyz_pc"] = [float(r["gx_pc"]), float(r["gy_pc"]), float(r["gz_pc"])]
        du = r.get("distance_unc_pc")
        rec["distance_unc_pc"] = None if pd.isna(du) else float(du)
        rec["healpix"] = int(r["healpix"])
    return rec


# Serve the web client and raw delivery data as static files for one-command demo.
@app.on_event("startup")
def _log_paths():
    scene = DELIVERY / "scene.json"
    print(f"[uep-api] serving web from : {WEB}")
    print(f"[uep-api] serving data from: {DATA}")
    print(f"[uep-api] scene.json found : {scene.exists()} ({scene})")
    if not scene.exists():
        print("[uep-api] WARNING: scene.json missing — run backend/pipeline.py first.")


if WEB.exists():
    app.mount("/data", StaticFiles(directory=str(DATA)), name="data")
    app.mount("/", StaticFiles(directory=str(WEB), html=True), name="web")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
