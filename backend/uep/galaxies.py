"""Cosmological layer — large-scale structure from real galaxy redshifts.

Uses the 2MASS Redshift Survey (2MRS; Huchra et al. 2012) via VizieR: an
all-sky catalogue of ~44,000 galaxies with measured radial velocities. We
convert cz -> redshift -> comoving distance (Planck18) and project to a 3D
point cloud (the local cosmic web). Redshifts are OBSERVED; comoving distances
are DERIVED from the chosen cosmology. Falls back to a procedural cosmic web if
VizieR is unreachable.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from . import coords
from .provenance import SourceType, ConfidenceClass, VisualisationMode, source_metadata

C_KMS = 299792.458


def fetch_2mrs(limit: int = 12000, timeout: int = 90):
    try:
        from astroquery.vizier import Vizier
        v = Vizier(columns=["RAJ2000", "DEJ2000", "cz"], row_limit=limit)
        v.TIMEOUT = timeout
        res = v.get_catalogs("J/ApJS/199/26/table3")
        t = res[0]
        ra = np.asarray(t["RAJ2000"], float)
        dec = np.asarray(t["DEJ2000"], float)
        cz = np.asarray(t["cz"], float)
        print(f"[galaxies] 2MRS returned {len(ra)} galaxies", file=sys.stderr)
        return ra, dec, cz
    except Exception as exc:
        print(f"[galaxies] VizieR query failed ({type(exc).__name__}: {exc}); procedural fallback",
              file=sys.stderr)
        return None


def _procedural(n=8000, seed=11):
    """Filament-and-void cosmic web stand-in (declared illustrative)."""
    rng = np.random.default_rng(seed)
    # cluster seeds, then scatter galaxies around them along random filaments
    nodes = rng.uniform(-200, 200, (40, 3))
    pts = []
    z = []
    for _ in range(n):
        a, b = rng.integers(0, len(nodes), 2)
        t = rng.random()
        p = nodes[a] * (1 - t) + nodes[b] * t + rng.normal(0, 8, 3)
        pts.append(p)
        z.append(np.linalg.norm(p) / (C_KMS / 67.7) * 67.7 / C_KMS * 0.0)  # placeholder
    pts = np.array(pts)
    r = np.linalg.norm(pts, axis=1)
    zz = r / (C_KMS / 67.7)  # crude Hubble z from Mpc
    return pts, zz, "procedural"


def build_payload(release: str, max_points: int = 9000,
                  prefer_live: bool = True) -> dict:
    """Build a 2MRS point cloud or a strict-offline procedural fallback."""
    got = fetch_2mrs() if prefer_live else None
    if got is None:
        pts, z, mode = _procedural(max_points)
    else:
        ra, dec, cz = got
        # keep receding galaxies in a sensible local-universe shell
        m = (cz > 300) & (cz < 30000) & np.isfinite(cz)
        ra, dec, cz = ra[m], dec[m], cz[m]
        if len(ra) > max_points:
            idx = np.random.default_rng(0).choice(len(ra), max_points, replace=False)
            ra, dec, cz = ra[idx], dec[idx], cz[idx]
        z = cz / C_KMS
        dist_mpc = coords.comoving_distance_mpc(z)
        ra_r, dec_r = np.radians(ra), np.radians(dec)
        x = dist_mpc * np.cos(dec_r) * np.cos(ra_r)
        y = dist_mpc * np.cos(dec_r) * np.sin(ra_r)
        zc = dist_mpc * np.sin(dec_r)
        pts = np.column_stack([x, y, zc])
        mode = "2mrs"

    # colour by redshift: near = warm white/blue, far = red
    zmax = float(np.percentile(z, 98)) or 1.0
    positions, colors, redshifts = [], [], []
    for i in range(len(pts)):
        positions += [round(float(pts[i, 0]), 3), round(float(pts[i, 1]), 3), round(float(pts[i, 2]), 3)]
        t = min(1.0, float(z[i]) / zmax)
        colors += [round(0.55 + 0.45 * t, 3), round(0.7 - 0.35 * t, 3), round(0.95 - 0.6 * t, 3)]
        redshifts.append(round(float(z[i]), 5))

    source = source_metadata("2mrs" if mode == "2mrs" else "cosmic_prior")
    return {
        "layer": "cosmic_web",
        "frame": "Comoving Cartesian (Mpc), heliocentric",
        "cosmology": coords.COSMOLOGY_VERSION,
        "source_mode": mode,
        "count": len(pts),
        "z_max_scale": zmax,
        "positions": positions,
        "colors": colors,
        "redshift": redshifts,
        "provenance": {
            "source_type": (SourceType.OBSERVED.value if mode == "2mrs" else SourceType.PROCEDURAL.value),
            "confidence": (ConfidenceClass.MEASURED.value if mode == "2mrs" else ConfidenceClass.ILLUSTRATIVE.value),
            "derived_source_type": (SourceType.DERIVED.value if mode == "2mrs"
                                    else SourceType.PROCEDURAL.value),
            "derived_confidence": (ConfidenceClass.INFERRED.value if mode == "2mrs"
                                   else ConfidenceClass.ILLUSTRATIVE.value),
            "derived_fields": (["positions", "comoving_distance_mpc", "colors"]
                               if mode == "2mrs" else ["positions", "redshift", "colors"]),
            "ingest_mode": ("live_archive" if mode == "2mrs" else "procedural_fallback"),
            "visualisation_mode": VisualisationMode.POINT.value,
            "distance_method": ("redshift→comoving (Planck18)" if mode == "2mrs"
                                else "procedural_filament_prior"),
            "credit": ("2MASS Redshift Survey (Huchra et al. 2012), via VizieR/CDS"
                       if mode == "2mrs" else "UEP procedural cosmic web"),
            "note": (
                "Sky coordinates and radial velocities are observed 2MRS values; redshift, "
                "comoving distance, Cartesian positions and render colours are derived using "
                "the declared cosmology."
                if mode == "2mrs"
                else "Positions, redshifts and colours are a declared illustrative filament prior."
            ),
            "dataset_release": source["dataset_release"],
            "delivery_release": release,
            "archive_accessed_at": (
                datetime.now(timezone.utc).isoformat() if mode == "2mrs" else None
            ),
            "data_rights": source["data_rights"],
            "license": source["license"],
        },
    }


def write_payload(delivery_dir: Path, release: str,
                  prefer_live: bool = True) -> dict:
    payload = build_payload(release, prefer_live=prefer_live)
    delivery_dir.mkdir(parents=True, exist_ok=True)
    (delivery_dir / "cosmic_web.json").write_text(json.dumps(payload))
    return payload
