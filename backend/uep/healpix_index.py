"""HEALPix sky partitioning.

The sky is tessellated hierarchically so the client can stream only the cells
above a view-dependent importance threshold (the nested LOD pyramid in the
guide). HATS/LSDB extend this to multi-billion-source catalogues; here we use
healpy directly for the prototype.
"""
from __future__ import annotations

import numpy as np

try:
    import healpy as hp
    _HAVE_HEALPY = True
except Exception:  # pragma: no cover
    _HAVE_HEALPY = False


def ang2pix(ra_deg, dec_deg, nside: int) -> np.ndarray:
    """Map (ra, dec) in degrees to nested HEALPix pixel indices at given nside."""
    ra = np.asarray(ra_deg, dtype=float)
    dec = np.asarray(dec_deg, dtype=float)
    if _HAVE_HEALPY:
        theta = np.radians(90.0 - dec)
        phi = np.radians(ra)
        return hp.ang2pix(nside, theta, phi, nest=True)
    # Fallback: coarse lon/lat bucketing producing a deterministic integer id.
    nlon = max(1, int(np.sqrt(12) * nside))
    lon_bin = ((ra % 360) / 360.0 * nlon).astype(int)
    lat_bin = ((dec + 90) / 180.0 * nlon).astype(int)
    return lon_bin * nlon + lat_bin


def npix(nside: int) -> int:
    if _HAVE_HEALPY:
        return hp.nside2npix(nside)
    nlon = max(1, int(np.sqrt(12) * nside))
    return nlon * nlon


def order_to_nside(order: int) -> int:
    """HEALPix order k -> nside = 2**k."""
    return 1 << order
