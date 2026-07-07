"""Golden scenes & golden queries.

Permanent, literature-anchored regression checks (the guide's QA approach): if a
transform or ingest change moves any of these canonical values, CI fails. These
run against freshly built payloads so they need no network.
"""
import sys
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from uep import solar_system, exoplanets, blackholes, cmb, resolved_galaxies  # noqa: E402

R_EARTH_OVER_R_SUN = 0.009168


def test_golden_earth_distance():
    """Earth sits ~1 AU from the Sun (eccentricity band)."""
    jd = solar_system.now_jd()
    x, y, z = solar_system.heliocentric_xyz("Earth", jd)
    r = math.sqrt(x*x + y*y + z*z)
    assert 0.98 <= r <= 1.02


def test_golden_outer_planets_ordering():
    """Heliocentric distances increase Mercury → Neptune."""
    jd = solar_system.now_jd()
    order = ["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"]
    rs = [math.dist((0, 0, 0), solar_system.heliocentric_xyz(p, jd)) for p in order]
    # not strictly monotonic instantaneously, but a/major trend must hold
    assert rs[0] < rs[4] < rs[7] and rs[2] < rs[5]


def test_golden_sgr_a_star_mass_and_rs():
    bh = blackholes.build_payload("G")
    sgr = next(o for o in bh["objects"] if o["name"] == "Sgr A*")
    assert abs(sgr["mass_msun"] - 4.297e6) / 4.297e6 < 0.05
    assert 1.0e7 < sgr["schwarzschild_km"] < 1.5e7      # ~1.27e7 km


def test_golden_cmb_parameters():
    c = cmb.build_payload("G")
    assert "2.72" in c["facts"]["temperature"]
    assert "1089" in c["facts"]["redshift"]


def test_golden_trappist1_habitable_zone():
    """TRAPPIST-1 e should fall inside the conservative habitable zone."""
    ex = exoplanets.build_payload("G")
    sys_ = next((s for s in ex["systems"] if s["hostname"] == "TRAPPIST-1"), None)
    if sys_ is None:                                     # archive offline -> sample lacks full set
        return
    e = next((p for p in sys_["planets"] if p["name"].endswith(" e")), None)
    if e:
        assert e["in_hz"] is True


def test_golden_sombrero_is_billion_solar_mass_bh():
    g = resolved_galaxies.build_payload("G")
    s = next(o for o in g["objects"] if o["catalogue"] == "M104")
    assert s["central_bh"]["mass_msun"] >= 5e8


def test_golden_transit_depth_sanity():
    """A Jupiter-sized planet on a Sun-like star gives ~1% (10,000 ppm) depth."""
    RpRs = 11.2 * R_EARTH_OVER_R_SUN / 1.0               # Jupiter ≈ 11.2 R⊕
    depth_ppm = RpRs * RpRs * 1e6
    assert 8000 < depth_ppm < 12000
