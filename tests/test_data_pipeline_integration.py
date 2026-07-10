"""Offline integration coverage for the real data-lake pipeline."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import pipeline  # noqa: E402
from uep import ingest_gaia  # noqa: E402


def test_real_offline_pipeline_builds_public_delivery_lake(monkeypatch, tmp_path):
    data = tmp_path / "data"
    monkeypatch.setattr(pipeline, "DATA", data)
    monkeypatch.setattr(
        sys,
        "argv",
        ["pipeline.py", "--no-live", "--limit", "64", "--release", "INTEGRATION"],
    )

    assert pipeline.main() == 0

    curated = pd.read_parquet(data / "curated" / "stars.parquet")
    manifest = json.loads((data / "delivery" / "manifest.json").read_text())
    exoplanets = json.loads((data / "delivery" / "exoplanets.json").read_text())
    cosmic = json.loads((data / "delivery" / "cosmic_web.json").read_text())

    assert len(curated) == 64
    assert set(curated["data_rights"]) == {"public"}
    assert manifest["source_mode"] == "sample"
    assert manifest["total_sources"] == 64
    assert manifest["dataset_release"] == "UEP procedural star sample v1"
    assert manifest["delivery_release"] == "INTEGRATION"
    assert exoplanets["provenance"]["ingest_mode"] == "bundled_snapshot"
    assert cosmic["provenance"]["ingest_mode"] == "procedural_fallback"
    assert (data / "delivery" / "tiles").is_dir()


def test_gaia_ingest_success_failure_and_mode_selection(monkeypatch):
    from astroquery.gaia import Gaia

    source = pd.DataFrame({
        "source_id": [123],
        "ra": [10.0],
        "dec": [20.0],
        "parallax": [100.0],
        "parallax_error": [1.0],
        "phot_g_mean_mag": [2.0],
        "bp_rp": [0.5],
    })

    class Results:
        def to_pandas(self):
            return source.copy()

    class Job:
        def get_results(self):
            return Results()

    monkeypatch.setattr(Gaia, "launch_job", lambda adql: Job())
    fetched = ingest_gaia.fetch_gaia_bright(limit=1)
    assert fetched.loc[0, "source_id"] == "123"
    assert fetched.loc[0, "distance_pc"] == 10.0

    monkeypatch.setattr(Gaia, "launch_job", lambda adql: (_ for _ in ()).throw(TimeoutError()))
    assert ingest_gaia.fetch_gaia_bright(limit=1) is None

    monkeypatch.setattr(ingest_gaia, "fetch_gaia_bright", lambda limit: fetched)
    live, live_mode = ingest_gaia.load_catalogue(prefer_live=True, limit=1)
    assert live_mode == "gaia" and len(live) == 1

    offline, offline_mode = ingest_gaia.load_catalogue(prefer_live=False, limit=16)
    assert offline_mode == "sample" and len(offline) == 16
