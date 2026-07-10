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
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from .provenance import SourceType, ConfidenceClass, VisualisationMode, source_metadata

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
    cols = ("pl_name,hostname,pl_rade,pl_bmasse,pl_bmassprov,pl_orbper,pl_orbsmax,pl_eqt,"
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
        # name, host, radius, mass, mass provenance, period, semi-major axis,
        # archive equilibrium-temperature model, distance, T_eff, stellar radius, log L.
        ("TRAPPIST-1 b", "TRAPPIST-1", 1.116, None, None, 1.5108, 0.01154, None, 12.43, 2566, 0.119, -3.257),
        ("TRAPPIST-1 c", "TRAPPIST-1", 1.097, None, None, 2.4219, 0.01580, None, 12.43, 2566, 0.119, -3.257),
        ("TRAPPIST-1 d", "TRAPPIST-1", 0.788, None, None, 4.0492, 0.02227, None, 12.43, 2566, 0.119, -3.257),
        ("TRAPPIST-1 e", "TRAPPIST-1", 0.920, None, None, 6.1010, 0.02925, None, 12.43, 2566, 0.119, -3.257),
        ("TRAPPIST-1 f", "TRAPPIST-1", 1.045, None, None, 9.2075, 0.03849, None, 12.43, 2566, 0.119, -3.257),
        ("TRAPPIST-1 g", "TRAPPIST-1", 1.129, None, None, 12.3524, 0.04683, None, 12.43, 2566, 0.119, -3.257),
        ("TRAPPIST-1 h", "TRAPPIST-1", 0.755, None, None, 18.7729, 0.06189, None, 12.43, 2566, 0.119, -3.257),
        # Proxima b is detected by radial velocity. 1.07 Earths is M sin(i),
        # not a measured radius; its display sphere therefore uses a neutral
        # illustrative size while the payload preserves radius as unknown.
        ("Proxima Cen b", "Proxima Cen", None, 1.07, "Msini", 11.1868, 0.04856, 234, 1.30, 2992, 0.146, -2.81),
    ]
    return pd.DataFrame(rows, columns=[
        "pl_name", "hostname", "pl_rade", "pl_bmasse", "pl_bmassprov",
        "pl_orbper", "pl_orbsmax", "pl_eqt", "sy_dist", "st_teff",
        "st_rad", "st_lum",
    ])


def build_payload(release: str, prefer_live: bool = True) -> dict:
    """Build the exoplanet payload from a live query or bundled snapshot.

    ``prefer_live=False`` is a strict offline contract: no archive client is
    invoked, which keeps CI and container builds deterministic.
    """
    df = fetch_systems() if prefer_live else None
    mode = "archive"
    if df is None or len(df) == 0:
        df, mode = _sample(), "sample"

    ingest_mode = "live_archive" if mode == "archive" else "bundled_snapshot"
    source = source_metadata("exoplanet_live" if mode == "archive" else "exoplanet_snapshot")
    ingest_note = (
        "Values were fetched from the live NASA Exoplanet Archive; habitable zones "
        "and any back-filled equilibrium temperatures are derived."
        if mode == "archive"
        else "Values are a bundled offline snapshot of published NASA Exoplanet "
        "Archive measurements; no live archive query was performed. Habitable zones "
        "and any back-filled equilibrium temperatures are derived."
    )

    systems = []
    for host, g in df.groupby("hostname"):
        r0 = g.iloc[0]
        slum = r0.get("st_lum")
        L = 10.0 ** float(slum) if pd.notna(slum) else None
        hz_inner = round(math.sqrt(L / 1.10), 4) if L else None
        hz_outer = round(math.sqrt(L / 0.53), 4) if L else None
        planets = []
        for _, p in g.sort_values("pl_orbsmax").iterrows():
            sma = p.get("pl_orbsmax")
            eqt = p.get("pl_eqt")
            eqt_from_archive = eqt is not None and pd.notna(eqt)
            if pd.isna(eqt):
                eqt = _equilibrium_temp(p.get("st_teff"), p.get("st_rad"), sma)
            rade = None if pd.isna(p.get("pl_rade")) else float(p["pl_rade"])
            mass = None if pd.isna(p.get("pl_bmasse")) else float(p["pl_bmasse"])
            has_hz_inputs = bool(hz_inner is not None and hz_outer is not None and sma is not None and pd.notna(sma))
            planets.append({
                "name": str(p["pl_name"]),
                "radius_earth": rade,
                "mass_earth": mass,
                "mass_provenance": None if pd.isna(p.get("pl_bmassprov")) else str(p.get("pl_bmassprov")),
                "period_days": None if pd.isna(p.get("pl_orbper")) else round(float(p["pl_orbper"]), 4),
                "sma_au": None if pd.isna(sma) else round(float(sma), 5),
                "eq_temp_k": None if eqt is None or pd.isna(eqt) else round(float(eqt)),
                "eq_temp_provenance": None if eqt is None or pd.isna(eqt) else "modelled",
                "eq_temp_method": (
                    "NASA Exoplanet Archive equilibrium-temperature model"
                    if eqt_from_archive
                    else "UEP black-body estimate (Bond albedo 0.3)"
                ) if eqt is not None and pd.notna(eqt) else None,
                "in_hz": (bool(hz_inner <= sma <= hz_outer) if has_hz_inputs else None),
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
            "derived_source_type": SourceType.DERIVED.value,
            "derived_confidence": ConfidenceClass.INFERRED.value,
            "derived_fields": [
                "eq_temp_k", "hz_inner_au", "hz_outer_au", "in_hz",
            ],
            "render_source_type": SourceType.PROCEDURAL.value,
            "render_confidence": ConfidenceClass.ILLUSTRATIVE.value,
            "render_fields": ["color", "orbital_scene_geometry"],
            "ingest_mode": ingest_mode,
            "visualisation_mode": VisualisationMode.MESH.value,
            "distance_method": "various (transit/RV/astrometry)",
            "credit": "NASA Exoplanet Archive (NExScI/Caltech)",
            "acknowledgement": ("This research has made use of the NASA Exoplanet Archive, "
                                "operated by Caltech under contract with NASA."),
            "note": ingest_note,
            "dataset_release": source["dataset_release"],
            "delivery_release": release,
            "archive_accessed_at": (
                datetime.now(timezone.utc).isoformat() if mode == "archive" else None
            ),
            "data_rights": source["data_rights"],
            "license": source["license"],
        },
        "snapshot_scope": (
            None if mode == "archive"
            else "Two showcase systems; all seven TRAPPIST-1 planets plus Proxima Cen b. Not a complete archive export."
        ),
        "systems": systems,
    }


def write_payload(delivery_dir: Path, release: str, prefer_live: bool = True) -> dict:
    payload = build_payload(release, prefer_live=prefer_live)
    delivery_dir.mkdir(parents=True, exist_ok=True)
    (delivery_dir / "exoplanets.json").write_text(json.dumps(payload, indent=1))
    return payload
