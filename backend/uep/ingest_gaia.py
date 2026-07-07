"""Gaia DR3 ingestion via Astroquery TAP, with offline fallback.

Tries a real cone/box query against the ESA Gaia archive. If the archive is
unreachable (no network, timeout, service change), it falls back to the
procedural sample catalogue so downstream stages always have data. The two
paths are flagged differently in provenance: OBSERVED vs PROCEDURAL.
"""
from __future__ import annotations

import sys
import pandas as pd

from . import sample_data

GAIA_RELEASE = "Gaia DR3"


def fetch_gaia_bright(limit: int = 6000, max_g: float = 8.5, timeout: int = 60) -> pd.DataFrame | None:
    """Fetch the brightest Gaia DR3 sources with good parallaxes.

    Bright + positive-parallax selection keeps the prototype to genuinely
    nearby, well-measured stars. Returns None on any failure.
    """
    try:
        from astroquery.gaia import Gaia
        Gaia.ROW_LIMIT = limit
        adql = f"""
            SELECT TOP {limit}
                source_id, ra, dec, parallax, parallax_error,
                phot_g_mean_mag, bp_rp
            FROM gaiadr3.gaia_source
            WHERE phot_g_mean_mag < {max_g}
              AND parallax > 2
              AND parallax_over_error > 10
            ORDER BY phot_g_mean_mag ASC
        """
        # Synchronous job: faster to first byte than async for small TOP queries.
        job = Gaia.launch_job(adql)
        tbl = job.get_results()
        df = tbl.to_pandas()
        df["source_id"] = df["source_id"].astype(str)
        df["distance_pc"] = 1000.0 / df["parallax"]
        df["name"] = ""
        df["simbad"] = ""
        df["is_anchor"] = False
        print(f"[ingest] live Gaia query returned {len(df)} sources", file=sys.stderr)
        return df
    except Exception as exc:  # network/service failure -> caller falls back
        print(f"[ingest] live Gaia query failed ({type(exc).__name__}: {exc}); "
              f"will use sample fallback", file=sys.stderr)
        return None


def load_catalogue(prefer_live: bool = True, limit: int = 6000) -> tuple[pd.DataFrame, str]:
    """Return (dataframe, source_mode) where source_mode is 'gaia' or 'sample'."""
    if prefer_live:
        df = fetch_gaia_bright(limit=limit)
        if df is not None and len(df) > 0:
            return df, "gaia"
    print("[ingest] using procedural sample catalogue", file=sys.stderr)
    return sample_data.generate(n=limit), "sample"
