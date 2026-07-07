"""Cosmic Microwave Background layer (the edge of the observable universe).

The CMB is the surface of last scattering — the relic radiation released ~380,000
years after the Big Bang, now redshifted to a near-uniform 2.725 K glow with tiny
temperature anisotropies measured by COBE, WMAP and Planck. The *parameters* here
are OBSERVED (measured); the rendered anisotropy *pattern* is a declared
PROCEDURAL prior (a representative Gaussian random field, not the actual Planck
sky map).
"""
from __future__ import annotations

import json
from pathlib import Path

from .provenance import SourceType, ConfidenceClass, VisualisationMode


def build_payload(release: str) -> dict:
    return {
        "layer": "cmb",
        "frame": "All-sky shell at the surface of last scattering",
        "facts": {
            "temperature": "2.72548 K",
            "redshift": "z ≈ 1089",
            "emitted": "≈ 380,000 years after the Big Bang",
            "light_travel": "≈ 13.8 billion years",
            "comoving_distance": "≈ 45.5 billion light-years",
            "anisotropy_rms": "≈ 18 µK (fluctuations ~ ±200 µK)",
            "discovery": "Penzias & Wilson, 1965; mapped by COBE (1992), WMAP, and Planck.",
            "note": "The oldest light in the universe — a baby photo of the cosmos before the first stars.",
        },
        "palette": {  # representative Planck-style temperature colour ramp (cold -> hot)
            "cold": "#1a2f7a", "cool": "#4a8fd6", "mid": "#e8e8e8",
            "warm": "#e8a33a", "hot": "#b5202a",
        },
        "anisotropy_amp": 1.0,
        "provenance": {
            "source_type": SourceType.OBSERVED.value,
            "confidence": ConfidenceClass.MEASURED.value,
            "render_source_type": SourceType.PROCEDURAL.value,
            "render_confidence": ConfidenceClass.ILLUSTRATIVE.value,
            "visualisation_mode": VisualisationMode.VOLUME.value,
            "distance_method": "recombination physics + standard cosmology",
            "credit": ("CMB parameters: Planck Collaboration / WMAP / COBE. The rendered "
                       "anisotropy pattern is an illustrative Gaussian random field, "
                       "not the measured Planck sky map."),
            "note": "Temperature, redshift and age are measured; the visible mottling is a representative prior.",
            "dataset_release": release,
        },
    }


def write_payload(delivery_dir: Path, release: str) -> dict:
    payload = build_payload(release)
    delivery_dir.mkdir(parents=True, exist_ok=True)
    (delivery_dir / "cmb.json").write_text(json.dumps(payload, indent=1))
    return payload
