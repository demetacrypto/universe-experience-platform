"""Astronomy-native coordinate handling.

Keep astronomy coordinates authoritative; treat engine coordinates as
ephemeral views. The backend stores ICRS sky positions + distance and only
converts to a floating-origin Cartesian space for the client at delivery time.
"""
from __future__ import annotations

import numpy as np

try:
    from astropy.coordinates import SkyCoord, Distance
    from astropy import units as u
    from astropy.cosmology import Planck18
    _HAVE_ASTROPY = True
except Exception:  # pragma: no cover - astropy is a hard dependency in practice
    _HAVE_ASTROPY = False


# Default cosmology version is recorded explicitly so scenes are reproducible.
COSMOLOGY_VERSION = "Planck18"


def parallax_to_distance_pc(parallax_mas: np.ndarray) -> np.ndarray:
    """Naive parallax inversion (distance[pc] = 1000 / parallax[mas]).

    Real pipelines should use a Bayesian distance prior (e.g. Bailer-Jones);
    this is flagged as ``distance_method='parallax'`` with the formal
    uncertainty so the client can render it honestly.
    """
    parallax_mas = np.asarray(parallax_mas, dtype=float)
    with np.errstate(divide="ignore", invalid="ignore"):
        dist = 1000.0 / parallax_mas
    # Negative / zero parallaxes are non-physical inversions -> mark as NaN.
    dist[parallax_mas <= 0] = np.nan
    return dist


def icrs_to_galactic_cartesian(ra_deg, dec_deg, distance_pc):
    """Convert ICRS (ra, dec, distance) to heliocentric Galactic XYZ in parsecs.

    Uses Astropy when available; otherwise a pure-numpy ICRS spherical->cartesian
    fallback (good enough for the local stellar neighbourhood prototype).
    """
    ra = np.asarray(ra_deg, dtype=float)
    dec = np.asarray(dec_deg, dtype=float)
    dist = np.asarray(distance_pc, dtype=float)

    if _HAVE_ASTROPY:
        c = SkyCoord(ra=ra * u.deg, dec=dec * u.deg,
                     distance=Distance(dist * u.pc, allow_negative=True),
                     frame="icrs")
        g = c.galactic.cartesian
        return (np.asarray(g.x.to_value(u.pc)),
                np.asarray(g.y.to_value(u.pc)),
                np.asarray(g.z.to_value(u.pc)))

    # Fallback: spherical ICRS -> cartesian (no rotation into Galactic frame).
    ra_r = np.radians(ra)
    dec_r = np.radians(dec)
    x = dist * np.cos(dec_r) * np.cos(ra_r)
    y = dist * np.cos(dec_r) * np.sin(ra_r)
    z = dist * np.sin(dec_r)
    return x, y, z


def comoving_distance_mpc(redshift):
    """Comoving distance for cosmological-layer objects, Planck18 default."""
    if not _HAVE_ASTROPY:
        # Rough low-z Hubble approximation, H0 ~ 67.7 km/s/Mpc.
        return np.asarray(redshift, dtype=float) * (299792.458 / 67.7)
    z = np.asarray(redshift, dtype=float)
    return np.asarray(Planck18.comoving_distance(z).to_value(u.Mpc))


def lookback_time_gyr(redshift):
    """Lookback time so the UI can offer 'now' vs 'as seen' toggles."""
    if not _HAVE_ASTROPY:
        return np.full_like(np.asarray(redshift, dtype=float), np.nan)
    z = np.asarray(redshift, dtype=float)
    return np.asarray(Planck18.lookback_time(z).to_value(u.Gyr))
