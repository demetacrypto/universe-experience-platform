"""Curate a raw catalogue into the internal model + delivery tiles.

Pipeline: raw rows -> attach provenance -> compute distances + Galactic XYZ ->
HEALPix partition -> write curated Parquet (analytic zone) and compact JSON
delivery tiles (runtime zone) aligned to the web client.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from . import coords, healpix_index, crossmatch
from .provenance import (
    SourceType, ConfidenceClass, VisualisationMode, Provenance, credit_for,
    source_metadata,
)
from .security import public_rights_mask

DELIVERY_ORDER = 3          # HEALPix order for delivery tiles (nside = 8 -> 768 cells)


def _bp_rp_to_rgb(bp_rp: float) -> tuple[float, float, float]:
    """Crude but monotonic colour map from Gaia BP-RP colour index to RGB.

    Bluer (negative/low bp_rp) -> white-blue; redder (high bp_rp) -> orange-red.
    Illustrative only; flagged via visualisation_mode, not a calibrated SED.
    """
    if bp_rp is None or (isinstance(bp_rp, float) and math.isnan(bp_rp)):
        return (1.0, 1.0, 1.0)
    t = max(0.0, min(1.0, (bp_rp + 0.3) / 3.5))  # normalise typical range
    r = 0.6 + 0.4 * t
    g = 0.7 + 0.1 * t - 0.3 * t * t
    b = 1.0 - 0.7 * t
    return (round(r, 3), round(max(0.0, g), 3), round(max(0.0, b), 3))


def curate(df: pd.DataFrame, source_mode: str, release: str) -> pd.DataFrame:
    """Add distances, Galactic XYZ, HEALPix cell, colour, and provenance fields."""
    df = df.copy()

    # Distances: prefer existing distance_pc, else parallax inversion.
    if "distance_pc" not in df or df["distance_pc"].isna().all():
        df["distance_pc"] = coords.parallax_to_distance_pc(df["parallax"].to_numpy())
    df = df[np.isfinite(df["distance_pc"]) & (df["distance_pc"] > 0)].reset_index(drop=True)

    x, y, z = coords.icrs_to_galactic_cartesian(
        df["ra"].to_numpy(), df["dec"].to_numpy(), df["distance_pc"].to_numpy()
    )
    df["gx_pc"], df["gy_pc"], df["gz_pc"] = x, y, z

    nside = healpix_index.order_to_nside(DELIVERY_ORDER)
    df["healpix"] = healpix_index.ang2pix(df["ra"].to_numpy(), df["dec"].to_numpy(), nside)

    # Cross-identify well-known bright stars (SIMBAD-style name resolver stub).
    n_named = crossmatch.annotate_names(df)
    print(f"[curate] cross-identified {n_named} named landmark stars")

    # Provenance per row.
    is_observed = source_mode == "gaia"
    src = SourceType.OBSERVED if is_observed else SourceType.PROCEDURAL
    conf = ConfidenceClass.MEASURED if is_observed else ConfidenceClass.ILLUSTRATIVE
    source_key = "gaia" if is_observed else "sample_stars"
    meta = source_metadata(source_key)
    cred = credit_for("gaia") if is_observed else {
        "credit": "UEP procedural prior",
        "license": meta["license"],
        "ack": "",
    }
    df["source_type"] = src.value
    df["confidence"] = conf.value
    df["visualisation_mode"] = VisualisationMode.POINT.value
    df["distance_method"] = "parallax" if is_observed else "assumed_prior"
    df["measurement_epoch"] = 2016.0 if is_observed else None
    if "dataset_release" not in df:
        df["dataset_release"] = meta["dataset_release"]
    else:
        df["dataset_release"] = df["dataset_release"].fillna(meta["dataset_release"])
    df["delivery_release"] = release
    df["credit"] = cred["credit"]
    df["license"] = cred["license"]
    # Preserve explicit upstream restrictions. Only records without a rights
    # value inherit the registry decision for this known source mode.
    if "data_rights" not in df:
        if "dataRights" in df:
            df["data_rights"] = df["dataRights"]
        else:
            df["data_rights"] = meta["data_rights"]
    elif "dataRights" in df:
        df["data_rights"] = df["data_rights"].fillna(df["dataRights"])
    df["data_rights"] = df["data_rights"].fillna(meta["data_rights"])

    # Per-source distance uncertainty (fractional) where parallax error exists.
    if "parallax_error" in df and "parallax" in df:
        frac = (df["parallax_error"] / df["parallax"]).clip(lower=0)
        df["distance_unc_pc"] = (frac * df["distance_pc"]).round(4)
    else:
        df["distance_unc_pc"] = np.nan

    return df


def write_curated_parquet(df: pd.DataFrame, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out_path, index=False)


def write_delivery_tiles(df: pd.DataFrame, delivery_dir: Path, source_mode: str,
                         release: str, archive_accessed_at: str | None = None) -> dict:
    """Emit compact JSON tiles (one per HEALPix cell) + a manifest.

    Tile format is intentionally small and flat for fast client decode:
    parallel arrays of position, colour, magnitude, and a provenance index.
    """
    public = df[public_rights_mask(df)].copy()
    if public.empty:
        raise ValueError("Delivery contains no explicitly public records")

    delivery_dir.mkdir(parents=True, exist_ok=True)
    tiles_dir = delivery_dir / "tiles"
    tiles_dir.mkdir(exist_ok=True)
    # A release is a complete snapshot. Remove cells from older releases before
    # writing the current manifest so stale or newly restricted rows cannot leak.
    for old_tile in tiles_dir.glob("tile_*.json"):
        old_tile.unlink()

    manifest_cells = []
    for cell, g in public.groupby("healpix"):
        positions, colors, mags, names, ids, dist, dunc = [], [], [], [], [], [], []
        for _, r in g.iterrows():
            positions += [round(float(r.gx_pc), 4), round(float(r.gy_pc), 4), round(float(r.gz_pc), 4)]
            cr, cg, cb = _bp_rp_to_rgb(r.get("bp_rp"))
            colors += [cr, cg, cb]
            mags.append(round(float(r.phot_g_mean_mag), 3))
            names.append(str(r.get("name", "")) or "")
            ids.append(str(r.source_id))
            dist.append(round(float(r.distance_pc), 4))
            du = r.get("distance_unc_pc")
            dunc.append(None if (du is None or (isinstance(du, float) and math.isnan(du))) else round(float(du), 4))
        tile = {
            "healpix": int(cell),
            "count": int(len(g)),
            "positions": positions,   # flat xyz in parsecs (Galactic)
            "colors": colors,         # flat rgb 0..1
            "mag": mags,              # apparent G magnitude
            "name": names,
            "source_id": ids,
            "distance_pc": dist,
            "distance_unc_pc": dunc,
        }
        (tiles_dir / f"tile_{int(cell)}.json").write_text(json.dumps(tile))
        manifest_cells.append({"healpix": int(cell), "count": int(len(g))})

    # Combined scene bundle: one fetch for the whole layer (flat arrays).
    scene = {
        "frame": "Galactic heliocentric cartesian (parsecs)",
        "count": int(len(public)),
        "positions": [], "colors": [], "mag": [], "bp_rp": [],
        "confidence": [], "source_type": [],
        "name": [], "source_id": [], "distance_pc": [], "distance_unc_pc": [],
    }
    for _, r in public.iterrows():
        scene["positions"] += [round(float(r.gx_pc), 4), round(float(r.gy_pc), 4), round(float(r.gz_pc), 4)]
        cr, cg, cb = _bp_rp_to_rgb(r.get("bp_rp"))
        scene["colors"] += [cr, cg, cb]
        scene["mag"].append(round(float(r.phot_g_mean_mag), 3))
        _bprp = r.get("bp_rp")
        scene["bp_rp"].append(None if (_bprp is None or (isinstance(_bprp, float) and math.isnan(_bprp))) else round(float(_bprp), 3))
        scene["confidence"].append(str(r["confidence"]))
        scene["source_type"].append(str(r["source_type"]))
        scene["name"].append(str(r.get("name", "")) or "")
        scene["source_id"].append(str(r.source_id))
        scene["distance_pc"].append(round(float(r.distance_pc), 4))
        du = r.get("distance_unc_pc")
        scene["distance_unc_pc"].append(
            None if (du is None or (isinstance(du, float) and math.isnan(du))) else round(float(du), 4))
    (delivery_dir / "scene.json").write_text(json.dumps(scene))

    source_key = "gaia" if source_mode == "gaia" else "sample_stars"
    meta = source_metadata(source_key)
    cred = credit_for("gaia") if source_mode == "gaia" else {"credit": "UEP procedural prior", "ack": ""}
    manifest = {
        "platform": "Universe Experience Platform",
        "layer": "stellar_neighbourhood",
        "frame": "Galactic heliocentric cartesian (parsecs)",
        "cosmology": coords.COSMOLOGY_VERSION,
        "healpix_order": DELIVERY_ORDER,
        "source_mode": source_mode,             # 'gaia' (observed) or 'sample' (procedural)
        "dataset_release": meta["dataset_release"],
        "delivery_release": release,
        "archive_accessed_at": archive_accessed_at if source_mode == "gaia" else None,
        "data_rights": meta["data_rights"],
        "license": meta["license"],
        "total_sources": int(len(public)),
        "credit": cred["credit"],
        "acknowledgement": cred.get("ack", ""),
        "cells": manifest_cells,
        "bbox_pc": {
            "min": [float(public.gx_pc.min()), float(public.gy_pc.min()), float(public.gz_pc.min())],
            "max": [float(public.gx_pc.max()), float(public.gy_pc.max()), float(public.gz_pc.max())],
        },
        "confidence_breakdown": public["confidence"].value_counts().to_dict(),
    }
    (delivery_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest
