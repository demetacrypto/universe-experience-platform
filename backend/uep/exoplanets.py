"""Exoplanet layer — real systems from the NASA Exoplanet Archive (TAP).

Pulls a curated set of notable/nearby multi-planet systems with their host-star
and planet parameters, computes a conservative habitable zone from the stellar
luminosity, and emits a provenance-tagged payload. Planet/star values are
OBSERVED (measured); the habitable-zone bounds and any back-filled equilibrium
temperatures are DERIVED. Falls back to a small bundled sample if the archive
is unreachable.
"""
from __future__ import annotations

import io
import json
import math
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd

from .provenance import SourceType, ConfidenceClass, VisualisationMode

TAP = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
R_SUN_AU = 0.00465047

# Notable systems: nearby, habitable-zone, or rich multi-planet showcases.
SYSTEMS = [
    "TRAPPIST-1", "Proxima Cen", "Kepler-90", "Kepler-186", "Kepler-442",
    "Kepler-452", "TOI-700", "55 Cnc", "HD 10180", "GJ 667 C", "GJ 887",
    "HD 219134", "tau Cet", "Teegarden's Star", "LHS 1140", "K2-138", "51 Peg",
]


def _equilibrium_temp(teff, st_rad_sun, sma_au, albedo=0.3):
    if not (teff and st_rad_sun and sma_au):
        return None
    r_au = st_rad_sun * R_SUN_AU
    return teff * math.sqrt(r_au / (2 * sma_au)) * (1 - albedo) ** 0.25


def _planet_color(radius_earth, eq_temp):
    """Illustrative colour from size + temperature (declared, not measured)."""
    if radius_earth and radius_earth > 6:      # gas giant
        return "#caa46a"
    if radius_earth and radius_earth > 2.2:    # mini-Neptune
        return "#7fb0c9"
    if eq_temp:
        if eq_temp > 400:
            return "#d98050"                    # hot rock
        if 230 <= eq_temp <= 320:
            return "#4fae6a"                     # temperate (HZ-ish)
        return "#8aa6c4"                         # cold rock
    return "#b0b8c4"


def fetch_systems(timeout: int = 60) -> pd.DataFrame | None:
    cols = ("pl_name,hostname,pl_rade,pl_bmasse,pl_orbper,pl_orbsmax,pl_eqt,"
            "sy_dist,ra,dec,st_teff,st_rad,st_mass,st_lum")
    names = ",".join("'%s'" % s.replace("'", "''") for s in SYSTEMS)
    adql = (f"select {cols} from ps where hostname in ({names}) and default_flag=1")
    url = TAP + "?" + urllib.parse.urlencode({"query": adql, "format": "csv"})
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            df = pd.read_csv(io.StringIO(r.read().decode("utf-8")))
        print(f"[exoplanets] live archive returned {len(df)} planets", file=sys.stderr)
        return df
    except Exception as exc:
        print(f"[exoplanets] live query failed ({type(exc).__name__}: {exc}); sample fallback",
              file=sys.stderr)
        return None


def _sample() -> pd.DataFrame:
    rows = [
        # name, host, rade, per, sma, eqt, dist, teff, srad, slum
        ("TRAPPIST-1 b", "TRAPPIST-1", 1.116, 1.51, 0.0115, None, 12.47, 2566, 0.119, -3.257),
        ("TRAPPIST-1 e", "TRAPPIST-1", 0.920, 6.10, 0.0293, None, 12.47, 2566, 0.119, -3.257),
        ("TRAPPIST-1 g", "TRAPPIST-1", 1.129, 12.35, 0.0468, None, 12.47, 2566, 0.119, -3.257),
        ("Proxima Cen b", "Proxima Cen", 1.07, 11.19, 0.0485, 234, 1.30, 2992, 0.146, -2.81),
    ]
    return pd.DataFrame(rows, columns=["pl_name", "hostname", "pl_rade", "pl_orbper",
                        "pl_orbsmax", "pl_eqt", "sy_dist", "st_teff", "st_rad", "st_lum"])


def build_payload(release: str) -> dict:
    df = fetch_systems()
    mode = "archive"
    if df is None or len(df) == 0:
        df, mode = _sample(), "sample"

    systems = []
    for host, g in df.groupby("hostname"):
        r0 = g.iloc[0]
        slum = r0.get("st_lum")
        L = 10 ** slum if pd.notna(slum) else None
        hz_inner = round(math.sqrt(L / 1.10), 4) if L else None
        hz_outer = round(math.sqrt(L / 0.53), 4) if L else None
        planets = []
        for _, p in g.sort_values("pl_orbsmax").iterrows():
            sma = p.get("pl_orbsmax")
            eqt = p.get("pl_eqt")
            if pd.isna(eqt):
                eqt = _equilibrium_temp(p.get("st_teff"), p.get("st_rad"), sma)
            rade = None if pd.isna(p.get("pl_rade")) else float(p["pl_rade"])
            planets.append({
                "name": str(p["pl_name"]),
                "radius_earth": rade,
                "period_days": None if pd.isna(p.get("pl_orbper")) else round(float(p["pl_orbper"]), 4),
                "sma_au": None if pd.isna(sma) else round(float(sma), 5),
                "eq_temp_k": None if eqt is None or pd.isna(eqt) else round(float(eqt)),
                "in_hz": bool(hz_inner and hz_outer and sma and pd.notna(sma)
                              and hz_inner <= sma <= hz_outer),
                "color": _planet_color(rade, None if eqt is None or pd.isna(eqt) else eqt),
            })
        systems.append({
            "hostname": str(host),
            "distance_pc": None if pd.isna(r0.get("sy_dist")) else round(float(r0["sy_dist"]), 2),
            "st_teff": None if pd.isna(r0.get("st_teff")) else round(float(r0["st_teff"])),
            "st_rad_sun": None if pd.isna(r0.get("st_rad")) else round(float(r0["st_rad"]), 4),
            "st_lum_log": None if pd.isna(slum) else round(float(slum), 3),
            "hz_inner_au": hz_inner, "hz_outer_au": hz_outer,
            "n_planets": int(len(planets)),
            "planets": planets,
        })

    systems.sort(key=lambda s: (-s["n_planets"], s["distance_pc"] or 1e9))
    return {
        "layer": "exoplanets",
        "frame": "Per-system orbital plane (AU); host star at origin",
        "source_mode": mode,
        "provenance": {
            "source_type": SourceType.OBSERVED.value,
            "confidence": ConfidenceClass.MEASURED.value,
            "visualisation_mode": VisualisationMode.MESH.value,
            "distance_method": "various (transit/RV/astrometry)",
            "credit": "NASA Exoplanet Archive (NExScI/Caltech)",
            "acknowledgement": ("This research has made use of the NASA Exoplanet Archive, "
                                "operated by Caltech under contract with NASA."),
            "note": "Star/planet parameters are measured; habitable zones and any "
                    "back-filled equilibrium temperatures are derived.",
            "dataset_release": release,
        },
        "systems": systems,
    }


def write_payload(delivery_dir: Path, release: str) -> dict:
    payload = build_payload(release)
    delivery_dir.mkdir(parents=True, exist_ok=True)
    (delivery_dir / "exoplanets.json").write_text(json.dumps(payload, indent=1))
    return payload
