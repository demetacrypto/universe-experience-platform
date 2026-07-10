"""Data-correctness, provenance, and golden-query regression tests.

Implements the guide's three QA levels at prototype scale:
  * data correctness   — coords, units, distances, HEALPix
  * physical plausibility — distance/parallax consistency, sane ranges
  * experiential integrity — every entity carries honest provenance

Run:  pytest -q   (from repo root)
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from uep import coords, healpix_index, crossmatch, sample_data, curate, solar_system, exoplanets, galaxies, blackholes, nebulae, resolved_galaxies, cmb  # noqa: E402
from uep.provenance import SourceType, ConfidenceClass, Provenance, VisualisationMode, credit_for  # noqa: E402

CURATED = ROOT / "data" / "curated" / "stars.parquet"
DELIVERY = ROOT / "data" / "delivery"


# --------------------------------------------------------------------------- #
# Level 1: data correctness
# --------------------------------------------------------------------------- #
def test_parallax_to_distance_roundtrip():
    plx = np.array([100.0, 10.0, 1.0])     # mas
    d = coords.parallax_to_distance_pc(plx)
    assert np.allclose(d, [10.0, 100.0, 1000.0])


def test_negative_parallax_is_nan():
    d = coords.parallax_to_distance_pc(np.array([-5.0, 0.0, 5.0]))
    assert np.isnan(d[0]) and np.isnan(d[1]) and np.isfinite(d[2])


def test_cartesian_distance_preserved():
    # Galactic XYZ magnitude must equal the input distance regardless of frame rotation.
    ra = np.array([10.0, 250.0, 88.0])
    dec = np.array([-20.0, 45.0, 7.0])
    dist = np.array([5.0, 100.0, 168.0])
    x, y, z = coords.icrs_to_galactic_cartesian(ra, dec, dist)
    r = np.sqrt(x**2 + y**2 + z**2)
    assert np.allclose(r, dist, rtol=1e-4)


def test_healpix_indices_in_range():
    nside = healpix_index.order_to_nside(curate.DELIVERY_ORDER)
    ra = np.random.default_rng(0).uniform(0, 360, 1000)
    dec = np.degrees(np.arcsin(np.random.default_rng(1).uniform(-1, 1, 1000)))
    pix = healpix_index.ang2pix(ra, dec, nside)
    assert pix.min() >= 0 and pix.max() < healpix_index.npix(nside)


# --------------------------------------------------------------------------- #
# Level 2: physical plausibility
# --------------------------------------------------------------------------- #
def test_comoving_distance_monotonic():
    z = np.array([0.1, 0.5, 1.0, 2.0])
    dc = coords.comoving_distance_mpc(z)
    assert np.all(np.diff(dc) > 0)


def test_lookback_time_bounded():
    z = np.array([0.0, 1.0, 5.0])
    t = coords.lookback_time_gyr(z)
    # universe age is < 14 Gyr; lookback must be finite and below that.
    assert np.all((t >= 0) & (t < 14))


# --------------------------------------------------------------------------- #
# Level 3: experiential integrity / provenance contract
# --------------------------------------------------------------------------- #
def test_every_provenance_field_serialises():
    p = Provenance(SourceType.OBSERVED, ConfidenceClass.MEASURED, VisualisationMode.POINT,
                   catalogue_ids={"gaia": "DR3 1"}, distance_method="parallax")
    d = p.to_dict()
    assert d["source_type"] == "observed" and d["confidence"] == "measured"


def test_archive_credits_present():
    for arc in ("gaia", "simbad", "ned", "wise"):
        assert credit_for(arc)["credit"]


def test_crossmatch_resolver():
    # A bright source exactly at Sirius must be named; a faint one must not.
    df = pd.DataFrame({"ra": [101.2872, 101.2872], "dec": [-16.7161, -16.7161],
                       "phot_g_mean_mag": [-1.4, 9.0], "name": ["", ""], "simbad": ["", ""]})
    n = crossmatch.annotate_names(df)
    assert n == 1
    assert df.loc[0, "name"] == "Sirius" and df.loc[1, "name"] == ""  # faint one rejected


# --------------------------------------------------------------------------- #
# Golden-scene checks against the actually-built delivery data
# --------------------------------------------------------------------------- #
@pytest.mark.skipif(not CURATED.exists(), reason="run backend/pipeline.py first")
def test_curated_has_full_provenance():
    df = pd.read_parquet(CURATED)
    required = {"source_type", "confidence", "visualisation_mode", "distance_method",
                "dataset_release", "delivery_release", "data_rights", "credit",
                "gx_pc", "gy_pc", "gz_pc", "healpix"}
    assert required.issubset(df.columns)
    # No renderable entity without a declared source type (the scientific contract).
    assert df["source_type"].notna().all()
    assert set(df["source_type"]).issubset({s.value for s in SourceType})


@pytest.mark.skipif(not (DELIVERY / "scene.json").exists(), reason="run pipeline first")
def test_scene_bundle_consistent():
    import json
    s = json.loads((DELIVERY / "scene.json").read_text())
    assert len(s["positions"]) == 3 * s["count"]
    assert len(s["colors"]) == 3 * s["count"]
    assert len(s["mag"]) == s["count"]
    assert len(s["bp_rp"]) == s["count"]        # needed for the HR diagram
    assert len(s["source_id"]) == s["count"]
    # colours normalised 0..1
    assert min(s["colors"]) >= 0.0 and max(s["colors"]) <= 1.0


# --------------------------------------------------------------------------- #
# Solar System layer (L0)
# --------------------------------------------------------------------------- #
def test_planet_distances_match_orbits():
    """Computed heliocentric distance must sit within the eccentricity band of
    each planet's semi-major axis (a sanity check on the Kepler solver)."""
    jd = solar_system.now_jd()
    import math
    for name, el in solar_system.ELEMENTS.items():
        a, e = el[0], el[1]
        x, y, z = solar_system.heliocentric_xyz(name, jd)
        r = math.sqrt(x*x + y*y + z*z)
        assert a * (1 - e) - 0.05 <= r <= a * (1 + e) + 0.05, f"{name} r={r} a={a}"


def test_solar_system_payload_complete():
    p = solar_system.build_payload("TEST")
    assert sum(1 for b in p["planets"] if b.get("category") == "planet") == 8
    assert p["provenance"]["source_type"] == "derived"
    for pl in p["planets"]:
        assert pl["radius_km"] > 0
        assert "facts" in pl and pl["palette"]
        assert len(pl["position_au"]) == 3
    # rings + moons present where expected
    saturn = next(pl for pl in p["planets"] if pl["name"] == "Saturn")
    assert saturn["rings"] and saturn["rings"]["outer"] > saturn["rings"]["inner"]
    earth = next(pl for pl in p["planets"] if pl["name"] == "Earth")
    assert any(m["name"] == "Moon" for m in earth["moons"])
    by_name = {planet["name"]: planet for planet in p["planets"]}
    assert by_name["Jupiter"]["facts"]["moons"] == 101
    assert by_name["Jupiter"]["facts"]["moons_as_of"] == "March 2026"
    assert by_name["Saturn"]["facts"]["moons"] == 274
    assert by_name["Saturn"]["facts"]["moons_as_of"] == "March 2025"
    assert by_name["Uranus"]["facts"]["moons"] == 29
    assert "science in progress" in by_name["Uranus"]["facts"]["moons_status"].lower()
    assert p["provenance"]["dataset_release"].startswith("JPL")
    assert p["provenance"]["delivery_release"] == "TEST"


@pytest.mark.skipif(not (DELIVERY / "solar_system.json").exists(), reason="run pipeline first")
def test_solar_system_delivery_file():
    import json
    s = json.loads((DELIVERY / "solar_system.json").read_text())
    assert s["layer"] == "solar_system"
    assert s["frame"].startswith("Heliocentric")
    assert s["provenance"]["credit"].startswith("Orbital elements")


# --------------------------------------------------------------------------- #
# Exoplanet layer + cosmological layer
# --------------------------------------------------------------------------- #
def test_equilibrium_temp_and_hz_logic():
    # Sun-like star: HZ should bracket ~1 AU.
    t = exoplanets._equilibrium_temp(5772, 1.0, 1.0)
    assert 250 < t < 300            # Earth's eq. temp ~255 K
    assert exoplanets._planet_color(1.0, 280) == "#4fae6a"   # temperate rock


def test_offline_exoplanet_snapshot_keeps_mass_radius_and_models_distinct():
    payload = exoplanets.build_payload("TEST", prefer_live=False)
    proxima = next(
        planet
        for system in payload["systems"]
        for planet in system["planets"]
        if planet["name"] == "Proxima Cen b"
    )

    assert proxima["radius_earth"] is None
    assert proxima["mass_earth"] == pytest.approx(1.07)
    assert proxima["mass_provenance"] == "Msini"
    assert proxima["eq_temp_provenance"] == "modelled"
    assert proxima["in_hz"] is True
    assert payload["provenance"]["dataset_release"].startswith("UEP exoplanet snapshot")
    assert payload["provenance"]["delivery_release"] == "TEST"
    assert "color" not in payload["provenance"]["derived_fields"]
    assert "color" in payload["provenance"]["render_fields"]
    assert payload["provenance"]["render_confidence"] == "illustrative"


def test_habitable_zone_status_is_unknown_when_inputs_are_missing(monkeypatch):
    incomplete = exoplanets._sample().head(1).copy()
    incomplete["pl_orbsmax"] = None
    monkeypatch.setattr(exoplanets, "_sample", lambda: incomplete)

    planet = exoplanets.build_payload("TEST", prefer_live=False)["systems"][0]["planets"][0]

    assert planet["in_hz"] is None


def test_dwarf_planets_present():
    p = solar_system.build_payload("TEST")
    dwarfs = [b for b in p["planets"] if b.get("category") == "dwarf"]
    names = {d["name"] for d in dwarfs}
    assert {"Pluto", "Ceres", "Eris"}.issubset(names)
    pluto = next(d for d in dwarfs if d["name"] == "Pluto")
    assert 29 < pluto["distance_au"] < 50    # Pluto's heliocentric range


def test_black_hole_payload():
    p = blackholes.build_payload("TEST")
    assert len(p["objects"]) == 2
    assert p["provenance"]["credit"].startswith("Event Horizon Telescope")
    assert p["provenance"]["visualisation_mode"] == "mesh"  # real-time approximation, not a ray-traced observation
    assert p["provenance"]["render_source_type"] == "derived"
    sgr = next(o for o in p["objects"] if o["name"] == "Sgr A*")
    # Schwarzschild radius of a 4.3e6 Msun BH is ~1.27e7 km.
    assert 1.0e7 < sgr["schwarzschild_km"] < 1.5e7
    assert 4.5 < sgr["shadow_diameter_rs"] < 5.8
    assert "schematic" in p["provenance"]["note"].lower()
    assert "validated real-time" not in p["provenance"]["note"].lower()


def test_cmb_payload():
    p = cmb.build_payload("TEST")
    assert p["layer"] == "cmb"
    assert p["provenance"]["source_type"] == "observed"
    assert p["provenance"]["render_source_type"] == "procedural"
    assert p["fact_provenance"]["temperature"] == "observed"
    for field in ("redshift", "emitted", "light_travel", "comoving_distance"):
        assert p["fact_provenance"][field] == "derived"
    assert "2.72" in p["facts"]["temperature"] and p["palette"]["cold"]


@pytest.mark.skipif(not (DELIVERY / "cmb.json").exists(), reason="run pipeline first")
def test_cmb_delivery():
    import json
    c = json.loads((DELIVERY / "cmb.json").read_text())
    assert c["layer"] == "cmb" and "redshift" in c["facts"]


def test_resolved_galaxies_payload():
    p = resolved_galaxies.build_payload("TEST")
    assert len(p["objects"]) >= 6
    assert p["provenance"]["render_source_type"] == "procedural"
    m31 = next(o for o in p["objects"] if o["catalogue"] == "M31")
    assert m31["morphology"] == "spiral" and m31["distance_mly"] > 2
    assert "billion-solar-mass" not in m31["central_bh"]["note"]
    m33 = next(o for o in p["objects"] if o["catalogue"] == "M33")
    assert m33["central_bh"]["status"] == "upper_limit"
    assert m33["central_bh"]["detected"] is False
    assert m33["central_bh"]["mass_upper_limit_msun"] == 3000
    assert "mass_msun" not in m33["central_bh"]
    morphs = {o["morphology"] for o in p["objects"]}
    assert {"spiral", "barred_spiral", "elliptical", "edge_on"}.issubset(morphs)


@pytest.mark.skipif(not (DELIVERY / "resolved_galaxies.json").exists(), reason="run pipeline first")
def test_resolved_galaxies_delivery():
    import json
    g = json.loads((DELIVERY / "resolved_galaxies.json").read_text())
    assert g["layer"] == "galaxies"
    assert all("palette" in o and "morphology" in o for o in g["objects"])


def test_nebula_payload():
    p = nebulae.build_payload("TEST")
    assert len(p["objects"]) >= 5
    # render must be declared procedural even though identity is observed
    assert p["provenance"]["source_type"] == "observed"
    assert p["provenance"]["render_source_type"] == "procedural"
    orion = next(o for o in p["objects"] if o["catalogue"] == "M42")
    assert orion["distance_ly"] == 1344 and orion["palette"]["core"]
    assert orion["render_star_sprites"] == 220
    assert "star_count" not in orion


@pytest.mark.skipif(not (DELIVERY / "nebulae.json").exists(), reason="run pipeline first")
def test_nebula_delivery():
    import json
    n = json.loads((DELIVERY / "nebulae.json").read_text())
    assert n["layer"] == "nebulae"
    assert all("palette" in o and "size_ly" in o for o in n["objects"])


@pytest.mark.skipif(not (DELIVERY / "black_holes.json").exists(), reason="run pipeline first")
def test_black_hole_delivery():
    import json
    b = json.loads((DELIVERY / "black_holes.json").read_text())
    assert b["layer"] == "black_holes"
    assert all("schwarzschild_km" in o for o in b["objects"])


@pytest.mark.skipif(not (DELIVERY / "exoplanets.json").exists(), reason="run pipeline first")
def test_exoplanet_delivery():
    import json
    e = json.loads((DELIVERY / "exoplanets.json").read_text())
    assert e["layer"] == "exoplanets"
    assert e["provenance"]["credit"].startswith("NASA Exoplanet Archive")
    assert len(e["systems"]) >= 1
    for s in e["systems"]:
        assert s["n_planets"] == len(s["planets"])


@pytest.mark.skipif(not (DELIVERY / "cosmic_web.json").exists(), reason="run pipeline first")
def test_cosmic_web_delivery():
    import json
    g = json.loads((DELIVERY / "cosmic_web.json").read_text())
    assert g["layer"] == "cosmic_web"
    assert len(g["positions"]) == 3 * g["count"]
    assert len(g["colors"]) == 3 * g["count"]
    assert g["cosmology"] == coords.COSMOLOGY_VERSION


@pytest.mark.skipif(not (DELIVERY / "manifest.json").exists(), reason="run pipeline first")
def test_manifest_declares_cosmology_and_release():
    import json
    m = json.loads((DELIVERY / "manifest.json").read_text())
    assert m["cosmology"] == coords.COSMOLOGY_VERSION
    assert m["dataset_release"] in {"Gaia DR3", "UEP procedural star sample v1"}
    assert m["delivery_release"]
    assert m["dataset_release"] != m["delivery_release"]
    assert m["source_mode"] in ("gaia", "sample")
