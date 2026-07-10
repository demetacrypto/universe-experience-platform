"""Nebula showcase layer (L5, volumetric) — famous nebulae.

The identity, distance and physical size of each nebula are OBSERVED (measured
from the literature). The volumetric gas rendering itself is a declared
PROCEDURAL prior — we do not have a true 3-D density cube, so the client builds
an illustrative cloud constrained by the measured size and morphology class.
This keeps the scientific contract honest while still looking premium.
"""
from __future__ import annotations

import json
from pathlib import Path

from .provenance import SourceType, ConfidenceClass, VisualisationMode, source_metadata

# name, type, distance_ly, size_ly, palette(core, mid, outer), render sprites, note, credit
NEBULAE = [
    {
        "name": "Orion Nebula", "catalogue": "M42", "type": "H II emission / star-forming",
        "distance_ly": 1344, "size_ly": 24,
        "palette": {"core": "#ff5d7a", "mid": "#b65cff", "outer": "#3aa0c9"},
        "render_star_sprites": 220, "morphology": "blobby",
        "note": "The closest large star-forming region; cradles the Trapezium cluster.",
        "credit": "Distance: VLBA parallax (Menten et al. 2007). Imagery class: HST.",
    },
    {
        "name": "Eagle Nebula", "catalogue": "M16", "type": "H II emission (Pillars of Creation)",
        "distance_ly": 5700, "size_ly": 70,
        "palette": {"core": "#ffcf6b", "mid": "#7bbf5a", "outer": "#5a7d3a"},
        "render_star_sprites": 160, "morphology": "pillars",
        "note": "Home of the Pillars of Creation — towers of gas being sculpted by young stars.",
        "credit": "Distance/size from literature. Imagery class: HST/JWST.",
    },
    {
        "name": "Carina Nebula", "catalogue": "NGC 3372", "type": "H II emission",
        "distance_ly": 8500, "size_ly": 230,
        "palette": {"core": "#ff8a4a", "mid": "#d96b8a", "outer": "#3a9fb0"},
        "render_star_sprites": 280, "morphology": "blobby",
        "note": "A vast complex hosting Eta Carinae, one of the most luminous known stars.",
        "credit": "Distance/size from literature. Imagery class: HST/JWST.",
    },
    {
        "name": "Helix Nebula", "catalogue": "NGC 7293", "type": "planetary nebula",
        "distance_ly": 655, "size_ly": 2.5,
        "palette": {"core": "#46d6c4", "mid": "#5aa0e0", "outer": "#ff6b6b"},
        "render_star_sprites": 60, "morphology": "ring",
        "note": "A dying Sun-like star's shed shell — the 'Eye of God'.",
        "credit": "Distance from literature. Imagery class: HST.",
    },
    {
        "name": "Crab Nebula", "catalogue": "M1", "type": "supernova remnant",
        "distance_ly": 6500, "size_ly": 11,
        "palette": {"core": "#7bd0ff", "mid": "#ff7a3a", "outer": "#ffcf4a"},
        "render_star_sprites": 90, "morphology": "filaments",
        "note": "Debris of a supernova seen in 1054 AD; powered by a central pulsar.",
        "credit": "Distance/size from literature. Imagery class: HST.",
    },
]


def build_payload(release: str) -> dict:
    source = source_metadata("nebula_compilation")
    return {
        "layer": "nebulae",
        "frame": "Local scene; size in light-years",
        "provenance": {
            "source_type": SourceType.OBSERVED.value,        # identity / distance / size
            "confidence": ConfidenceClass.INFERRED.value,
            "render_source_type": SourceType.PROCEDURAL.value,  # the gas volume itself
            "render_confidence": ConfidenceClass.ILLUSTRATIVE.value,
            "visualisation_mode": VisualisationMode.VOLUME.value,
            "distance_method": "parallax / literature",
            "credit": "Nebula parameters from the published literature; volumetric render is illustrative.",
            "note": ("Identity is observed; distances and sizes are approximate literature "
                     "estimates and do not yet carry field-level citations. The 3-D gas "
                     "distribution is a declared procedural prior — not a measured density cube."),
            "dataset_release": source["dataset_release"],
            "delivery_release": release,
            "data_rights": source["data_rights"],
            "license": source["license"],
        },
        "objects": NEBULAE,
    }


def write_payload(delivery_dir: Path, release: str) -> dict:
    payload = build_payload(release)
    delivery_dir.mkdir(parents=True, exist_ok=True)
    (delivery_dir / "nebulae.json").write_text(json.dumps(payload, indent=1))
    return payload
