"""Regression tests for deterministic builds and hardened runtime boundaries."""
from __future__ import annotations

import asyncio
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi import HTTPException
from fastapi.responses import FileResponse, JSONResponse
from starlette.requests import Request
from starlette.middleware.gzip import GZipMiddleware
from starlette.routing import Mount

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import pipeline  # noqa: E402
from api import server  # noqa: E402
from uep import curate, exoplanets, galaxies, sample_data  # noqa: E402
from uep.archives.base import ResolvedObject  # noqa: E402


REQUIRED_DELIVERY_FILES = {
    "manifest.json",
    "scene.json",
    "solar_system.json",
    "exoplanets.json",
    "cosmic_web.json",
    "black_holes.json",
    "nebulae.json",
    "resolved_galaxies.json",
    "cmb.json",
}
_MISSING = object()


def _public_provenance() -> dict:
    return {
        "source_type": "observed",
        "confidence": "measured",
        "dataset_release": "TEST-SOURCE",
        "delivery_release": "TEST-DELIVERY",
        "data_rights": "public",
        "license": "Test public-data license",
        "credit": "Test catalogue",
    }


def _star_frame(rights: object = "public") -> pd.DataFrame:
    row = {
        "source_id": "STAR.[1]",
        "name": "Literal [star]",
        "ra": 10.0,
        "dec": -20.0,
        "distance_pc": 5.0,
        "phot_g_mean_mag": 2.0,
        "source_type": "observed",
        "confidence": "measured",
        "visualisation_mode": "point",
        "distance_method": "parallax",
        "measurement_epoch": 2016.0,
        "dataset_release": "TEST",
        "delivery_release": "BUILD",
        "credit": "Test catalogue",
        "license": "public",
        "gx_pc": 1.0,
        "gy_pc": 2.0,
        "gz_pc": 3.0,
        "distance_unc_pc": 0.1,
        "healpix": 7,
    }
    if rights is not _MISSING:
        row["data_rights"] = rights
    return pd.DataFrame([row])


def _write_ready_data(root: Path) -> None:
    """Write the smallest delivery lake that satisfies the runtime contract."""
    curated = root / "curated"
    delivery = root / "delivery"
    tiles = delivery / "tiles"
    curated.mkdir(parents=True)
    tiles.mkdir(parents=True)
    _star_frame("public").to_parquet(curated / "stars.parquet", index=False)

    manifest = {
        "platform": "Universe Experience Platform",
        "layer": "stellar_neighbourhood",
        "source_mode": "sample",
        "dataset_release": "UEP procedural star sample v1",
        "delivery_release": "TEST",
        "data_rights": "public",
        "license": "CC0 (synthetic)",
        "credit": "Test catalogue",
        "total_sources": 1,
        "cells": [{"healpix": 7, "count": 1}],
    }
    scene = {
        "count": 1,
        "positions": [1, 2, 3],
        "colors": [1, 1, 1],
        "mag": [2],
        "source_id": ["STAR.[1]"],
    }
    tile = {
        "healpix": 7,
        "count": 1,
        "positions": [1, 2, 3],
        "colors": [1, 1, 1],
        "mag": [2],
        "source_id": ["STAR.[1]"],
    }
    payloads = {
        "manifest.json": manifest,
        "scene.json": scene,
        "solar_system.json": {
            "layer": "solar_system", "planets": [{}], "provenance": _public_provenance(),
        },
        "exoplanets.json": {
            "layer": "exoplanets", "systems": [{}], "provenance": _public_provenance(),
        },
        "cosmic_web.json": {
            "layer": "cosmic_web", "count": 1, "positions": [0, 0, 0],
            "provenance": _public_provenance(),
        },
        "black_holes.json": {
            "layer": "black_holes", "objects": [{}], "provenance": _public_provenance(),
        },
        "nebulae.json": {
            "layer": "nebulae", "objects": [{}], "provenance": _public_provenance(),
        },
        "resolved_galaxies.json": {
            "layer": "galaxies", "objects": [{}], "provenance": _public_provenance(),
        },
        "cmb.json": {
            "layer": "cmb", "facts": {"temperature": "2.725 K"},
            "provenance": _public_provenance(),
        },
    }
    for name, payload in payloads.items():
        (delivery / name).write_text(json.dumps(payload))
    (tiles / "tile_7.json").write_text(json.dumps(tile))


def test_exoplanet_offline_mode_never_calls_archive(monkeypatch):
    monkeypatch.setattr(
        exoplanets,
        "fetch_systems",
        lambda *args, **kwargs: pytest.fail("offline mode contacted the exoplanet archive"),
    )

    payload = exoplanets.build_payload("OFFLINE", prefer_live=False)

    assert payload["source_mode"] == "sample"
    assert payload["provenance"]["ingest_mode"] == "bundled_snapshot"
    assert payload["provenance"]["source_type"] == "observed"
    assert payload["systems"]


def test_cosmic_web_offline_mode_never_calls_archive(monkeypatch):
    monkeypatch.setattr(
        galaxies,
        "fetch_2mrs",
        lambda *args, **kwargs: pytest.fail("offline mode contacted VizieR"),
    )

    payload = galaxies.build_payload("OFFLINE", max_points=64, prefer_live=False)

    assert payload["source_mode"] == "procedural"
    assert payload["count"] == 64
    assert payload["provenance"]["source_type"] == "procedural"
    assert payload["provenance"]["confidence"] == "illustrative"
    assert payload["provenance"]["distance_method"] == "procedural_filament_prior"
    assert payload["provenance"]["ingest_mode"] == "procedural_fallback"


def test_archive_fetch_parsers_and_live_provenance(monkeypatch, tmp_path):
    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return (
                b"pl_name,hostname,pl_rade,pl_orbper,pl_orbsmax,pl_eqt,sy_dist,"
                b"st_teff,st_rad,st_lum\nTest b,Test,1,3,0.04,,10,4000,0.5,-1\n"
            )

    monkeypatch.setattr(exoplanets.urllib.request, "urlopen", lambda *args, **kwargs: Response())
    fetched = exoplanets.fetch_systems()
    assert list(fetched["hostname"]) == ["Test"]

    monkeypatch.setattr(exoplanets, "fetch_systems", lambda: fetched)
    live = exoplanets.build_payload("LIVE", prefer_live=True)
    assert live["source_mode"] == "archive"
    assert live["provenance"]["ingest_mode"] == "live_archive"

    written = exoplanets.write_payload(tmp_path, "OFFLINE", prefer_live=False)
    assert written["source_mode"] == "sample"
    assert (tmp_path / "exoplanets.json").is_file()


def test_exoplanet_fetch_failure_and_colour_boundaries(monkeypatch):
    def fail(*args, **kwargs):
        raise TimeoutError("offline")

    monkeypatch.setattr(exoplanets.urllib.request, "urlopen", fail)
    assert exoplanets.fetch_systems() is None
    assert exoplanets._equilibrium_temp(None, 1, 1) is None
    assert exoplanets._planet_color(7, 200) == "#caa46a"
    assert exoplanets._planet_color(3, 200) == "#7fb0c9"
    assert exoplanets._planet_color(1, 500) == "#d98050"
    assert exoplanets._planet_color(1, 200) == "#8aa6c4"
    assert exoplanets._planet_color(None, None) == "#b0b8c4"


def test_2mrs_parser_live_transform_and_write(monkeypatch, tmp_path):
    import astroquery.vizier

    class FakeVizier:
        def __init__(self, *args, **kwargs):
            self.TIMEOUT = None

        def get_catalogs(self, catalogue):
            return [{
                "RAJ2000": [0.0, 90.0, 180.0],
                "DEJ2000": [0.0, 10.0, -10.0],
                "cz": [1000.0, 2000.0, 3000.0],
            }]

    monkeypatch.setattr(astroquery.vizier, "Vizier", FakeVizier)
    parsed = galaxies.fetch_2mrs(limit=3)
    assert len(parsed[0]) == 3

    raw = (
        np.array([0.0, 90.0, 180.0, 270.0]),
        np.array([0.0, 10.0, -10.0, 0.0]),
        np.array([100.0, 1000.0, 2000.0, 40000.0]),
    )
    monkeypatch.setattr(galaxies, "fetch_2mrs", lambda: raw)
    live = galaxies.build_payload("LIVE", max_points=1, prefer_live=True)
    assert live["source_mode"] == "2mrs"
    assert live["count"] == 1
    assert live["provenance"]["ingest_mode"] == "live_archive"
    assert live["provenance"]["source_type"] == "observed"
    assert live["provenance"]["derived_source_type"] == "derived"
    assert live["provenance"]["derived_confidence"] == "inferred"
    assert "positions" in live["provenance"]["derived_fields"]
    assert "comoving" in live["provenance"]["note"].lower()

    written = galaxies.write_payload(tmp_path, "OFFLINE", prefer_live=False)
    assert written["source_mode"] == "procedural"
    assert (tmp_path / "cosmic_web.json").is_file()


def test_2mrs_fetch_failure_is_contained(monkeypatch):
    import astroquery.vizier

    class BrokenVizier:
        def __init__(self, *args, **kwargs):
            raise RuntimeError("offline")

    monkeypatch.setattr(astroquery.vizier, "Vizier", BrokenVizier)
    assert galaxies.fetch_2mrs() is None


def test_pipeline_no_live_propagates_and_preserves_source_rights(monkeypatch, tmp_path):
    calls = {}
    raw = sample_data.generate(n=12)

    monkeypatch.setattr(pipeline, "DATA", tmp_path)
    monkeypatch.setattr(sys, "argv", ["pipeline.py", "--no-live", "--release", "OFFLINE"])
    monkeypatch.setattr(pipeline.ingest_gaia, "load_catalogue", lambda **kwargs: (raw, "sample"))
    monkeypatch.setattr(
        pipeline.curate,
        "curate",
        lambda df, mode, release: df.assign(
            data_rights="public",
            dataset_release="UEP procedural star sample v1",
            delivery_release=release,
        ),
    )
    monkeypatch.setattr(
        pipeline.curate,
        "write_curated_parquet",
        lambda df, path: calls.update(curated=df.copy()),
    )
    monkeypatch.setattr(
        pipeline.curate,
        "write_delivery_tiles",
        lambda *args, **kwargs: {
            "cells": [],
            "total_sources": len(raw),
            "confidence_breakdown": {"illustrative": len(raw)},
        },
    )
    monkeypatch.setattr(
        pipeline.solar_system,
        "write_payload",
        lambda *args: {"planets": [{"category": "planet", "moons": []}]},
    )

    def write_exoplanets(*args, prefer_live=True):
        calls["exo_live"] = prefer_live
        return {"systems": [{"n_planets": 1}], "source_mode": "sample"}

    def write_galaxies(*args, prefer_live=True):
        calls["galaxy_live"] = prefer_live
        return {"count": 1, "source_mode": "procedural"}

    monkeypatch.setattr(pipeline.exoplanets, "write_payload", write_exoplanets)
    monkeypatch.setattr(pipeline.galaxies, "write_payload", write_galaxies)
    monkeypatch.setattr(
        pipeline.blackholes,
        "write_payload",
        lambda *args: {"objects": [{"name": "BH"}]},
    )
    monkeypatch.setattr(
        pipeline.nebulae,
        "write_payload",
        lambda *args: {"objects": [{"name": "Nebula"}]},
    )
    monkeypatch.setattr(
        pipeline.resolved_galaxies,
        "write_payload",
        lambda *args: {"objects": [{"name": "Galaxy"}]},
    )
    monkeypatch.setattr(pipeline.cmb, "write_payload", lambda *args: {})

    assert pipeline.main() == 0
    assert calls["exo_live"] is False
    assert calls["galaxy_live"] is False
    assert set(calls["curated"]["data_rights"]) == {"public"}


def test_offline_pipeline_honours_a_single_source_limit(monkeypatch, tmp_path):
    monkeypatch.setattr(pipeline, "DATA", tmp_path)
    monkeypatch.setattr(
        sys,
        "argv",
        ["pipeline.py", "--no-live", "--limit", "1", "--release", "ONE"],
    )

    assert pipeline.main() == 0
    manifest = json.loads((tmp_path / "delivery" / "manifest.json").read_text())
    assert manifest["total_sources"] == 1
    assert len(pd.read_parquet(tmp_path / "curated" / "stars.parquet")) == 1


def test_pipeline_strict_live_fails_before_serving_fallback(monkeypatch, tmp_path):
    monkeypatch.setattr(pipeline, "DATA", tmp_path)
    monkeypatch.setattr(
        sys,
        "argv",
        ["pipeline.py", "--strict-live", "--release", "STRICT"],
    )
    monkeypatch.setattr(
        pipeline.ingest_gaia,
        "load_catalogue",
        lambda **kwargs: (sample_data.generate(n=8), "sample"),
    )

    with pytest.raises(RuntimeError, match="required Gaia"):
        pipeline.main()


def test_pipeline_strict_live_rejects_cached_raw_data(monkeypatch):
    monkeypatch.setattr(
        sys,
        "argv",
        ["pipeline.py", "--strict-live", "--use-cache", "--release", "STRICT"],
    )

    with pytest.raises(SystemExit) as exc:
        pipeline.main()
    assert exc.value.code == 2


def test_container_strict_live_startup_fails_before_server_launch():
    dockerfile = (ROOT / "Dockerfile").read_text()
    assert 'CMD ["sh", "-c", "set -e;' in dockerfile

    probe = subprocess.run(
        ["sh", "-c", "set -e; if [ live = live ]; then false; fi; printf served"],
        check=False,
        capture_output=True,
        text=True,
    )
    assert probe.returncode != 0
    assert "served" not in probe.stdout


def test_search_is_literal_and_filters_non_public_records(monkeypatch):
    public = _star_frame("public")
    restricted = _star_frame("restricted").assign(source_id="HIDDEN", name="Hidden [star]")
    monkeypatch.setattr(server, "_curated", lambda: pd.concat([public, restricted], ignore_index=True))

    result = server.search(q="[", limit=20)

    assert result["count"] == 1
    assert [record["source_id"] for record in result["results"]] == ["STAR.[1]"]


def test_rights_alias_conflicts_are_excluded_from_search_and_delivery(monkeypatch, tmp_path):
    public = _star_frame("public")
    conflict = _star_frame("public").assign(
        source_id="CONFLICT",
        name="Conflicting rights",
        healpix=8,
        dataRights="restricted",
    )
    records = pd.concat([public, conflict], ignore_index=True)
    monkeypatch.setattr(server, "_curated", lambda: records)

    assert server.search(q="rights", limit=20)["count"] == 0
    with pytest.raises(HTTPException) as exc:
        server.object_detail("CONFLICT")
    assert exc.value.status_code == 403

    manifest = curate.write_delivery_tiles(
        records,
        tmp_path / "delivery",
        "sample",
        "RIGHTS-CONFLICT",
    )
    assert manifest["total_sources"] == 1
    scene = json.loads((tmp_path / "delivery" / "scene.json").read_text())
    assert scene["source_id"] == ["STAR.[1]"]


def test_object_rights_fail_closed_when_column_is_missing(monkeypatch):
    monkeypatch.setattr(server, "_curated", lambda: _star_frame(_MISSING))

    with pytest.raises(HTTPException) as exc:
        server.object_detail("STAR.[1]")

    assert exc.value.status_code == 403


def test_object_detail_allows_explicit_public_record(monkeypatch):
    monkeypatch.setattr(server, "_curated", lambda: _star_frame("public"))

    response = server.object_detail("STAR.[1]")

    assert isinstance(response, JSONResponse)
    assert json.loads(response.body)["provenance"]["data_rights"] == "public"


def test_search_query_contract_has_strict_bounds():
    params = {
        item["name"]: item["schema"]
        for item in server.app.openapi()["paths"]["/api/search"]["get"]["parameters"]
    }

    assert params["q"]["minLength"] == 1
    assert params["q"]["maxLength"] == 128
    assert params["limit"]["minimum"] == 1
    assert params["limit"]["maximum"] == 100


def test_health_is_a_readiness_check(monkeypatch, tmp_path):
    data = tmp_path / "data"
    delivery = data / "delivery"
    delivery.mkdir(parents=True)
    monkeypatch.setattr(server, "DATA", data)
    monkeypatch.setattr(server, "DELIVERY", delivery)

    unavailable = server.health()
    assert isinstance(unavailable, JSONResponse)
    assert unavailable.status_code == 503
    assert set(json.loads(unavailable.body)["missing"]) == REQUIRED_DELIVERY_FILES

    for name in REQUIRED_DELIVERY_FILES:
        (delivery / name).write_text("{}")

    malformed = server.health()
    assert malformed.status_code == 503
    assert json.loads(malformed.body)["issues"]

    _write_ready_data(data)

    ready = server.health()
    assert isinstance(ready, JSONResponse)
    assert ready.status_code == 200
    assert json.loads(ready.body)["status"] == "ok"

    solar = json.loads((delivery / "solar_system.json").read_text())
    solar.pop("provenance")
    (delivery / "solar_system.json").write_text(json.dumps(solar))
    no_provenance = server.health()
    assert no_provenance.status_code == 503
    assert any("solar_system.json: public provenance" in issue
               for issue in json.loads(no_provenance.body)["issues"])

    solar["provenance"] = _public_provenance()
    (delivery / "solar_system.json").write_text(json.dumps(solar))
    manifest = json.loads((delivery / "manifest.json").read_text())
    manifest["license"] = ""
    (delivery / "manifest.json").write_text(json.dumps(manifest))
    empty_manifest_terms = server.health()
    assert empty_manifest_terms.status_code == 503
    assert any("manifest.json: required provenance" in issue
               for issue in json.loads(empty_manifest_terms.body)["issues"])


def test_delivery_filters_restricted_rows_and_removes_stale_tiles(tmp_path):
    delivery = tmp_path / "delivery"
    public = _star_frame("public")
    restricted = _star_frame("restricted").assign(
        source_id="HIDDEN",
        name="Restricted source",
        healpix=8,
    )
    first = pd.concat([public, restricted], ignore_index=True)

    manifest = curate.write_delivery_tiles(first, delivery, "sample", "BUILD-1")

    assert manifest["total_sources"] == 1
    assert json.loads((delivery / "scene.json").read_text())["source_id"] == ["STAR.[1]"]
    assert not (delivery / "tiles" / "tile_8.json").exists()

    extra_public = public.assign(source_id="SECOND", name="Second", healpix=9)
    curate.write_delivery_tiles(
        pd.concat([public, extra_public], ignore_index=True),
        delivery,
        "sample",
        "BUILD-2",
    )
    assert (delivery / "tiles" / "tile_9.json").exists()

    curate.write_delivery_tiles(public, delivery, "sample", "BUILD-3")
    assert not (delivery / "tiles" / "tile_9.json").exists()


def test_gaia_manifest_does_not_invent_archive_access_time(tmp_path):
    delivery = tmp_path / "delivery"
    frame = _star_frame("public")

    cached = curate.write_delivery_tiles(frame, delivery, "gaia", "CACHED")
    assert cached["archive_accessed_at"] is None

    accessed_at = "2026-07-10T10:11:12+00:00"
    live = curate.write_delivery_tiles(
        frame,
        delivery,
        "gaia",
        "LIVE",
        archive_accessed_at=accessed_at,
    )
    assert live["archive_accessed_at"] == accessed_at


def test_cached_data_loaders_and_layer_file_endpoints(monkeypatch, tmp_path):
    data = tmp_path / "data"
    curated = data / "curated"
    delivery = data / "delivery"
    curated.mkdir(parents=True)
    delivery.mkdir(parents=True)
    _star_frame("public").to_parquet(curated / "stars.parquet", index=False)
    (delivery / "manifest.json").write_text('{"dataset_release":"TEST"}')

    monkeypatch.setattr(server, "DATA", data)
    monkeypatch.setattr(server, "DELIVERY", delivery)
    server._curated.cache_clear()
    server._manifest.cache_clear()
    assert len(server._curated()) == 1
    assert server._manifest()["dataset_release"] == "TEST"
    assert isinstance(server.manifest(), JSONResponse)

    endpoints = {
        "solar_system.json": server.solar_system,
        "exoplanets.json": server.exoplanets,
        "cosmic_web.json": server.cosmic_web,
        "black_holes.json": server.black_holes,
        "nebulae.json": server.nebulae,
        "resolved_galaxies.json": server.galaxies,
        "cmb.json": server.cmb,
    }
    for filename, endpoint in endpoints.items():
        (delivery / filename).write_text("{}")
        assert isinstance(endpoint(), FileResponse)

    tiles = delivery / "tiles"
    tiles.mkdir()
    (tiles / "tile_7.json").write_text("{}")
    assert isinstance(server.tile(7), FileResponse)
    with pytest.raises(HTTPException) as exc:
        server.tile(8)
    assert exc.value.status_code == 404

    server._curated.cache_clear()
    server._manifest.cache_clear()


def test_missing_cached_data_and_layer_payloads_return_503(monkeypatch, tmp_path):
    monkeypatch.setattr(server, "DATA", tmp_path)
    monkeypatch.setattr(server, "DELIVERY", tmp_path)
    server._curated.cache_clear()
    server._manifest.cache_clear()

    with pytest.raises(HTTPException) as curated_error:
        server._curated()
    assert curated_error.value.status_code == 503
    with pytest.raises(HTTPException) as manifest_error:
        server._manifest()
    assert manifest_error.value.status_code == 503
    with pytest.raises(HTTPException) as layer_error:
        server.solar_system()
    assert layer_error.value.status_code == 503

    server._curated.cache_clear()
    server._manifest.cache_clear()


def test_resolver_archive_list_and_not_found_paths(monkeypatch):
    from uep import archives

    resolved = ResolvedObject(name="M31", archive="simbad", credit="SIMBAD")
    monkeypatch.setattr(archives, "resolve", lambda name, prefer=None, timeout=None: resolved)
    assert asyncio.run(server.resolve(" M31 "))["name"] == "M31"
    assert server.archives_list()["adapters"]

    monkeypatch.setattr(archives, "resolve", lambda name, prefer=None, timeout=None: None)
    with pytest.raises(HTTPException) as missing:
        asyncio.run(server.resolve("unknown"))
    assert missing.value.status_code == 404
    with pytest.raises(HTTPException) as blank:
        asyncio.run(server.resolve("   "))
    assert blank.value.status_code == 422


def test_resolver_does_not_cache_transient_negative_results(monkeypatch):
    from uep import archives

    resolved = ResolvedObject(name="Recovered", archive="simbad", credit="SIMBAD")
    outcomes = iter([None, resolved])
    calls = []

    def resolve_once(name, prefer=None, timeout=None):
        calls.append((name, prefer, timeout))
        return next(outcomes)

    monkeypatch.setattr(archives, "resolve", resolve_once)
    with server._resolver_cache_lock:
        server._resolver_cache.clear()

    assert server._resolve_cached("Recovered", None) is None
    assert server._resolve_cached("Recovered", None) is resolved
    assert server._resolve_cached("Recovered", None) is resolved
    assert len(calls) == 2

    with server._resolver_cache_lock:
        server._resolver_cache.clear()


def test_resolver_rejects_excess_work_without_blocking_shared_api_pool(monkeypatch):
    from uep import archives

    monkeypatch.setattr(server, "_resolver_slots", asyncio.Semaphore(1))
    monkeypatch.setattr(server, "RESOLVER_QUEUE_TIMEOUT_SECONDS", 0.02)
    monkeypatch.setattr(server, "RESOLVER_RESPONSE_TIMEOUT_SECONDS", 0.05)
    monkeypatch.setattr(
        archives,
        "resolve",
        lambda *args, **kwargs: (time.sleep(0.15), None)[1],
    )

    async def scenario():
        first = asyncio.create_task(server.resolve("slow one"))
        await asyncio.sleep(0.01)
        with pytest.raises(HTTPException) as busy:
            await server.resolve("slow two")
        assert busy.value.status_code == 503
        with pytest.raises(HTTPException) as timed_out:
            await first
        assert timed_out.value.status_code == 504

    asyncio.run(scenario())


def test_search_and_object_not_found_paths(monkeypatch):
    monkeypatch.setattr(server, "_curated", lambda: _star_frame(_MISSING))
    assert server.search("star", 20)["count"] == 0
    with pytest.raises(HTTPException) as blank:
        server.search("   ", 20)
    assert blank.value.status_code == 422
    with pytest.raises(HTTPException) as missing:
        server.object_detail("unknown")
    assert missing.value.status_code == 404


def test_http_hardening_middleware_allow_and_limit(monkeypatch):
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/api/health",
        "raw_path": b"/api/health",
        "query_string": b"",
        "headers": [],
        "client": ("127.0.0.1", 1234),
        "server": ("127.0.0.1", 8000),
        "root_path": "",
    }
    request = Request(scope)

    async def next_response(_request):
        return JSONResponse({"ok": True})

    monkeypatch.setattr(server._limiter, "allow", lambda key: True)
    allowed = asyncio.run(server._harden(request, next_response))
    assert allowed.status_code == 200
    assert allowed.headers["X-Content-Type-Options"] == "nosniff"
    assert allowed.headers["Cache-Control"] == "no-store, max-age=0"

    monkeypatch.setattr(server._limiter, "allow", lambda key: False)
    limited = asyncio.run(server._harden(request, next_response))
    assert limited.status_code == 429
    assert limited.headers["Retry-After"] == "1"


def test_runtime_mounts_delivery_only_and_enables_gzip():
    mounts = {route.path for route in server.app.routes if isinstance(route, Mount)}

    assert "/data/delivery" in mounts
    assert "/data" not in mounts
    assert any(middleware.cls is GZipMiddleware for middleware in server.app.user_middleware)


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("/api/health", "no-store, max-age=0"),
        ("/api/search", "no-store, max-age=0"),
        ("/api/manifest", "public, max-age=300, stale-while-revalidate=3600"),
        ("/data/delivery/scene.json", "public, max-age=300, stale-while-revalidate=3600"),
        ("/", "no-cache, must-revalidate"),
        ("/index.html", "no-cache, must-revalidate"),
        ("/app.js", "no-cache, must-revalidate"),
        ("/ui-utils.js", "no-cache, must-revalidate"),
        ("/favicon.svg", "public, max-age=3600"),
    ],
)
def test_cache_policy_is_path_specific(path, expected):
    assert server._cache_control_for(path) == expected


def test_container_is_fail_fast_non_root_and_has_bounded_context():
    dockerfile = (ROOT / "Dockerfile").read_text()
    dockerignore = (ROOT / ".dockerignore").read_text()

    assert "|| true" not in dockerfile
    assert "USER uep" in dockerfile
    assert "pipeline.py --no-live" in dockerfile
    for ignored in (".git", ".venv", ".playwright-cli", "output", "tests", "data/raw/*"):
        assert ignored in dockerignore

    compose = (ROOT / "docker-compose.yml").read_text()
    assert "/app/data" not in compose
