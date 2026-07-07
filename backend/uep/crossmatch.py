"""Lightweight name cross-identification (SIMBAD-style resolver stub).

Live Gaia rows carry only ``source_id``. To give the experience recognisable
landmarks, we cross-match a small table of well-known bright/nearby stars to
the nearest ingested source within a tolerance and attach the common name +
SIMBAD identifier. In production this role belongs to SIMBAD/VizieR; here it is
a self-contained approximation flagged as a DERIVED cross-identification.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# name, ra_deg, dec_deg, simbad_id  (J2000 ICRS)
KNOWN_STARS = [
    ("Sirius",            101.2872, -16.7161, "* alf CMa"),
    ("Canopus",            95.9879, -52.6957, "* alf Car"),
    ("Arcturus",          213.9153,  19.1825, "* alf Boo"),
    ("Vega",              279.2347,  38.7837, "* alf Lyr"),
    ("Capella",            79.1723,  45.9980, "* alf Aur"),
    ("Rigel",              78.6345,  -8.2017, "* bet Ori"),
    ("Procyon",           114.8255,   5.2250, "* alf CMi"),
    ("Betelgeuse",         88.7929,   7.4071, "* alf Ori"),
    ("Altair",            297.6958,   8.8683, "* alf Aql"),
    ("Aldebaran",          68.9802,  16.5093, "* alf Tau"),
    ("Antares",           247.3519, -26.4320, "* alf Sco"),
    ("Spica",             201.2983, -11.1613, "* alf Vir"),
    ("Pollux",            116.3290,  28.0262, "* bet Gem"),
    ("Fomalhaut",         344.4127, -29.6222, "* alf PsA"),
    ("Deneb",             310.3580,  45.2803, "* alf Cyg"),
    ("Regulus",           152.0929,  11.9672, "* alf Leo"),
    ("Alpha Centauri",    219.9021, -60.8340, "* alf Cen"),
    ("Proxima Centauri",  217.4289, -62.6795, "* alf Cen C"),
    ("Barnard's Star",    269.4521,   4.6933, "* V2500 Oph"),
    ("Tau Ceti",           26.0170, -15.9375, "* tau Cet"),
    ("Polaris",            37.9545,  89.2641, "* alf UMi"),
]


def _angsep_deg(ra1, dec1, ra2, dec2):
    """Vincenty-ish angular separation in degrees (vectorised over ra2/dec2)."""
    ra1, dec1 = np.radians(ra1), np.radians(dec1)
    ra2, dec2 = np.radians(ra2), np.radians(dec2)
    d = np.arccos(np.clip(
        np.sin(dec1) * np.sin(dec2) + np.cos(dec1) * np.cos(dec2) * np.cos(ra1 - ra2),
        -1, 1))
    return np.degrees(d)


def annotate_names(df: pd.DataFrame, tol_deg: float = 0.15, max_mag: float = 4.5) -> int:
    """Attach common name + SIMBAD id to the nearest *bright* matching source.

    A match requires angular separation < ``tol_deg`` AND apparent G < ``max_mag``
    so faint background stars are never mislabelled with a famous star's name.
    Returns the number of names assigned.
    """
    if "name" not in df:
        df["name"] = ""
    if "simbad" not in df:
        df["simbad"] = ""
    ra = df["ra"].to_numpy()
    dec = df["dec"].to_numpy()
    # Famous named stars are genuinely bright. Requiring brightness avoids the
    # spurious case where a faint background star is the nearest catalogued source
    # to a bright star that itself saturates Gaia (e.g. mislabelling a red dwarf
    # as "Canopus"). Only claim an identity when the photometry is consistent.
    mag = df["phot_g_mean_mag"].to_numpy() if "phot_g_mean_mag" in df else np.full(len(df), 99.0)
    matched = 0
    for name, sra, sdec, simbad in KNOWN_STARS:
        sep = _angsep_deg(sra, sdec, ra, dec)
        i = int(np.argmin(sep))
        if sep[i] <= tol_deg and mag[i] < max_mag and not df.at[df.index[i], "name"]:
            df.at[df.index[i], "name"] = name
            df.at[df.index[i], "simbad"] = simbad
            matched += 1
    return matched
