"""Cosmic Microwave Background layer (the edge of the observable universe).

The CMB is the surface of last scattering — the relic radiation released ~380,000
years after the Big Bang, now redshifted to a near-uniform 2.725 K glow with tiny
temperature anisotropies measured by COBE, WMAP and Planck. Mean temperature and
anisotropy amplitude are observational inputs; recombination redshift, age and
distance are model-derived cosmological quantities. The rendered anisotropy
*pattern* is a declared PROCEDURAL prior (a representative Gaussian random
field, not the actual Planck sky map).
"""
from __future__ import annotations

import json
from pathlib import Path

from .provenance import SourceType, ConfidenceClass, VisualisationMode, source_metadata


def build_payload(release: str) -> dict:
    source = source_metadata("cmb_compilation")
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
        "fact_provenance": {
            "temperature": SourceType.OBSERVED.value,
            "anisotropy_rms": SourceType.OBSERVED.value,
            "redshift": SourceType.DERIVED.value,
            "emitted": SourceType.DERIVED.value,
            "light_travel": SourceType.DERIVED.value,
            "comoving_distance": SourceType.DERIVED.value,
            "discovery": SourceType.OBSERVED.value,
            "note": SourceType.DERIVED.value,
        },
        "palette": {  # representative Planck-style temperature colour ramp (cold -> hot)
            "cold": "#1a2f7a", "cool": "#4a8fd6", "mid": "#e8e8e8",
            "warm": "#e8a33a", "hot": "#b5202a",
        },
        "anisotropy_amp": 1.0,
        "provenance": {
            "source_type": SourceType.OBSERVED.value,
            "confidence": ConfidenceClass.MEASURED.value,
            "derived_source_type": SourceType.DERIVED.value,
            "derived_confidence": ConfidenceClass.INFERRED.value,
            "render_source_type": SourceType.PROCEDURAL.value,
            "render_confidence": ConfidenceClass.ILLUSTRATIVE.value,
            "visualisation_mode": VisualisationMode.VOLUME.value,
            "distance_method": "recombination physics + standard cosmology",
            "credit": ("CMB parameters: Planck Collaboration / WMAP / COBE. The rendered "
                       "anisotropy pattern is an illustrative Gaussian random field, "
                       "not the measured Planck sky map."),
            "note": ("Mean temperature and anisotropy are observed. Redshift, age, light-travel "
                     "time and comoving distance depend on recombination physics and the chosen "
                     "cosmology. Visible mottling is a representative prior."),
            "dataset_release": source["dataset_release"],
            "delivery_release": release,
            "data_rights": source["data_rights"],
            "license": source["license"],
        },
    }


def write_payload(delivery_dir: Path, release: str) -> dict:
    payload = build_payload(release)
    delivery_dir.mkdir(parents=True, exist_ok=True)
    (delivery_dir / "cmb.json").write_text(json.dumps(payload, indent=1))
    return payload
