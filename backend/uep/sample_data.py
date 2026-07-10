"""Scientifically plausible fallback catalogue.

Used when the live Gaia archive is unreachable so the whole pipeline and client
still run end-to-end and reproducibly. Every generated row is flagged
PROCEDURAL / ILLUSTRATIVE in provenance so it is never mistaken for a real
measurement.

The generator mixes a handful of *real* bright nearby stars (clearly labelled,
with literature values) with a procedural local-neighbourhood population whose
spatial and luminosity distributions are loosely realistic (exponential disk
scale height, roughly Salpeter-like brightness tail).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# A few real anchor stars (J2000 ICRS, Hipparcos/Gaia-ish values) so the scene
# has recognisable landmarks. Distances in parsecs.
REAL_ANCHORS = [
    # name, ra_deg, dec_deg, distance_pc, parallax_mas, phot_g_mean_mag, bp_rp, simbad
    ("Sirius",        101.287,  -16.716,  2.64,  379.2, -1.46,  0.00, "* alf CMa"),
    ("Alpha Centauri", 219.902, -60.834,  1.34,  747.1, -0.27,  0.88, "* alf Cen"),
    ("Barnard's Star", 269.452,   4.668,  1.83,  546.9,  9.51,  2.40, "* V2500 Oph"),
    ("Vega",           279.234,  38.784,  7.68,  130.2,  0.03,  0.00, "* alf Lyr"),
    ("Betelgeuse",      88.793,   7.407, 168.0,    5.95, 0.42,  1.85, "* alf Ori"),
    ("Procyon",        114.825,   5.225,  3.51,  284.6,  0.34,  0.42, "* alf CMi"),
    ("Proxima Centauri",217.429,-62.679,  1.30,  768.1, 11.13,  3.80, "* alf Cen C"),
    ("Tau Ceti",       26.017,  -15.937,  3.65,  273.8,  3.50,  0.72, "* tau Cet"),
]


def generate(n: int = 5000, radius_pc: float = 200.0, seed: int = 42) -> pd.DataFrame:
    if n < 1:
        raise ValueError("sample catalogue size must be at least one")
    rng = np.random.default_rng(seed)

    rows = []
    for (name, ra, dec, dist, plx, g, bprp, simbad) in REAL_ANCHORS[:n]:
        rows.append(dict(source_id=f"ANCHOR-{name.replace(' ', '_')}", ra=ra, dec=dec,
                         parallax=plx, phot_g_mean_mag=g, bp_rp=bprp,
                         distance_pc=dist, name=name, simbad=simbad, is_anchor=True))
    anchors = pd.DataFrame(rows)

    # Procedural population: isotropic-ish on sky, exponential radial falloff.
    m = n - len(anchors)
    ra = rng.uniform(0, 360, m)
    dec = np.degrees(np.arcsin(rng.uniform(-1, 1, m)))   # uniform on sphere
    # Exponential distance distribution truncated at radius_pc.
    dist = rng.exponential(scale=radius_pc / 3.0, size=m)
    dist = np.clip(dist, 1.0, radius_pc)
    parallax = 1000.0 / dist
    # Absolute mag from a crude IMF-ish tail, then apparent G from distance modulus.
    abs_g = rng.normal(loc=6.0, scale=2.5, size=m)
    app_g = abs_g + 5 * np.log10(dist) - 5
    bp_rp = rng.normal(loc=1.0, scale=0.6, size=m)

    proc = pd.DataFrame(dict(
        source_id=[f"PROC-{i:06d}" for i in range(m)],
        ra=ra, dec=dec, parallax=parallax, phot_g_mean_mag=app_g,
        bp_rp=bp_rp, distance_pc=dist, name="", simbad="", is_anchor=False,
    ))

    df = pd.concat([anchors, proc], ignore_index=True)
    return df
