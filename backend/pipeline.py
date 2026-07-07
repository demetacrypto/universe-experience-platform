#!/usr/bin/env python3
"""End-to-end ingestion pipeline orchestrator (raw -> curated -> delivery).

Usage:
    python backend/pipeline.py --limit 6000 --release DR3-2024.1
    python backend/pipeline.py --no-live          # force sample fallback
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

# Allow running as a script without installing the package.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from uep import ingest_gaia, curate, solar_system, exoplanets, galaxies, blackholes, nebulae, resolved_galaxies, cmb  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "data"


def main() -> int:
    ap = argparse.ArgumentParser(description="UEP ingestion pipeline")
    ap.add_argument("--limit", type=int, default=6000, help="max sources to ingest")
    ap.add_argument("--release", default=None, help="immutable dataset release tag")
    ap.add_argument("--no-live", action="store_true", help="skip live archive, use sample")
    ap.add_argument("--use-cache", action="store_true",
                    help="reuse previously ingested raw parquet if present")
    args = ap.parse_args()

    release = args.release or f"UEP-{datetime.now(timezone.utc):%Y.%m.%d}"

    print(f"[pipeline] === Universe Experience Platform ingestion ===")
    print(f"[pipeline] release={release} limit={args.limit} live={not args.no_live}")

    # 1. RAW: load catalogue (cache -> live Gaia -> sample fallback)
    import pandas as pd
    cached = sorted((DATA / "raw").glob("catalogue_*.parquet")) if (DATA / "raw").exists() else []
    if args.use_cache and cached:
        raw_path = cached[0]
        df = pd.read_parquet(raw_path)
        source_mode = raw_path.stem.replace("catalogue_", "")
        print(f"[pipeline] reusing cached raw zone: {raw_path.name} ({len(df)} rows)")
    else:
        df, source_mode = ingest_gaia.load_catalogue(prefer_live=not args.no_live, limit=args.limit)
        raw_path = DATA / "raw" / f"catalogue_{source_mode}.parquet"
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        df.to_parquet(raw_path, index=False)
    print(f"[pipeline] raw zone:      {len(df)} rows  -> {raw_path.name} (mode={source_mode})")

    # 2. CURATED: provenance + coords + HEALPix
    cur = curate.curate(df, source_mode, release)
    curated_path = DATA / "curated" / "stars.parquet"
    curate.write_curated_parquet(cur, curated_path)
    print(f"[pipeline] curated zone:  {len(cur)} rows  -> {curated_path.name}")

    # 3. DELIVERY: client tiles + manifest
    manifest = curate.write_delivery_tiles(cur, DATA / "delivery", source_mode, release)
    print(f"[pipeline] delivery zone: {len(manifest['cells'])} HEALPix tiles, "
          f"{manifest['total_sources']} sources")

    # 3b. Solar System layer (L0): Keplerian ephemerides + body data
    ss = solar_system.write_payload(DATA / "delivery", release)
    n_planets = sum(1 for p in ss['planets'] if p.get('category') == 'planet')
    n_dwarf = sum(1 for p in ss['planets'] if p.get('category') == 'dwarf')
    print(f"[pipeline] solar system: {n_planets} planets, {n_dwarf} dwarf planets, "
          f"{sum(len(p['moons']) for p in ss['planets'])} moons")

    # 3c. Exoplanet layer: NASA Exoplanet Archive systems
    ex = exoplanets.write_payload(DATA / "delivery", release)
    print(f"[pipeline] exoplanets:   {len(ex['systems'])} systems, "
          f"{sum(s['n_planets'] for s in ex['systems'])} planets (mode={ex['source_mode']})")

    # 3d. Cosmological layer: galaxy redshift cosmic web
    gw = galaxies.write_payload(DATA / "delivery", release)
    print(f"[pipeline] cosmic web:   {gw['count']} galaxies (mode={gw['source_mode']})")

    # 3e. Black-hole showcase layer (L5): EHT-anchored reference objects
    bh = blackholes.write_payload(DATA / "delivery", release)
    print(f"[pipeline] black holes:  {len(bh['objects'])} objects "
          f"({', '.join(o['name'] for o in bh['objects'])})")

    # 3f. Nebula showcase layer (L5, volumetric)
    neb = nebulae.write_payload(DATA / "delivery", release)
    print(f"[pipeline] nebulae:      {len(neb['objects'])} objects "
          f"({', '.join(o['name'] for o in neb['objects'])})")

    # 3g. Resolved-galaxy layer (L3)
    rg = resolved_galaxies.write_payload(DATA / "delivery", release)
    print(f"[pipeline] galaxies:     {len(rg['objects'])} objects "
          f"({', '.join(o['name'] for o in rg['objects'])})")

    # 3h. Cosmic Microwave Background (edge of the observable universe)
    cmb.write_payload(DATA / "delivery", release)
    print(f"[pipeline] cmb:          surface of last scattering (z≈1089, 2.725 K)")
    print(f"[pipeline] confidence:    {manifest['confidence_breakdown']}")
    print(f"[pipeline] DONE. Open web/index.html or run the API to view.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
