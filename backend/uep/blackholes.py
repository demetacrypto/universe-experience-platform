"""Black-hole showcase layer (L5) — EHT-anchored reference objects.

Scientific reference rendering is separated from real-time experiential
rendering. Here we ship the *measured* parameters of the two
horizon-scale black holes imaged by the Event Horizon Telescope (Sgr A* and
M87*) as OBSERVED data. The client renders an EHT-anchored, normalized
*schematic* (accretion disk + photon ring + illustrative Doppler asymmetry)
flagged as DERIVED; it is not a validated GR ray-traced image.
"""
from __future__ import annotations

import json
from pathlib import Path

from .provenance import SourceType, ConfidenceClass, VisualisationMode, source_metadata

G = 6.674e-11
C = 2.998e8
MSUN = 1.989e30
KM = 1e3
LY_KM = 9.4607304725808e12
UAS_TO_RAD = 4.84813681109536e-12


def _schwarzschild_km(mass_msun: float) -> float:
    rs_m = 2 * G * (mass_msun * MSUN) / (C * C)
    return rs_m / KM


OBJECTS = [
    {
        "name": "Sgr A*", "long_name": "Sagittarius A*",
        "mass_msun": 4.297e6, "distance_kly": 26.996, "distance_label": "8.28 kpc",
        "shadow_uas": 51.8, "ring_uas": 51.8,
        "disk_color_hot": "#fff2d0", "disk_color_cool": "#ff7a2f",
        "facts": {
            "location": "Centre of the Milky Way",
            "mass": "4.30 million M☉",
            "distance": "≈ 27,000 light-years",
            "ring_diameter": "≈ 51.8 µas (EHT, 2022)",
            "note": "Our galaxy's central black hole; imaged by the EHT in 2022.",
        },
        "credit": "Event Horizon Telescope Collaboration (2022)",
    },
    {
        "name": "M87*", "long_name": "Messier 87*",
        "mass_msun": 6.5e9, "distance_kly": 53500.0, "distance_label": "16.8 Mpc",
        "shadow_uas": 42.0, "ring_uas": 42.0,
        "disk_color_hot": "#fff0c8", "disk_color_cool": "#ff5a2a", "has_jet": True,
        "facts": {
            "location": "Galaxy Messier 87 (Virgo cluster)",
            "mass": "6.5 billion M☉",
            "distance": "≈ 53.5 million light-years",
            "ring_diameter": "≈ 42 µas (EHT, 2019)",
            "note": "First black hole ever imaged (2019); drives a relativistic jet.",
        },
        "credit": "Event Horizon Telescope Collaboration (2019)",
    },
]


def build_payload(release: str) -> dict:
    source = source_metadata("eht_compilation")
    objs = []
    for o in OBJECTS:
        rs = _schwarzschild_km(o["mass_msun"])
        shadow_km = o["shadow_uas"] * UAS_TO_RAD * o["distance_kly"] * 1000 * LY_KM
        objs.append({
            **o,
            "schwarzschild_km": round(rs, 1),
            "schwarzschild_au": round(rs * KM / 1.495978707e11, 5),
            # Calibrates the normalized client scene: EHT angular diameter plus
            # distance and dynamical mass -> apparent shadow diameter in Rs.
            "shadow_diameter_rs": round(shadow_km / rs, 3),
        })
    return {
        "layer": "black_holes",
        "frame": "Normalized local scene; one scene unit = one Schwarzschild radius",
        "provenance": {
            "source_type": SourceType.OBSERVED.value,
            "confidence": ConfidenceClass.MEASURED.value,
            "render_source_type": SourceType.DERIVED.value,
            "render_confidence": ConfidenceClass.INFERRED.value,
            "visualisation_mode": VisualisationMode.MESH.value,
            "distance_method": "VLBI imaging / dynamical mass",
            "credit": "Event Horizon Telescope Collaboration",
            "note": ("Mass, distance and ring angular diameter are literature measurements. "
                     "They calibrate the apparent shadow diameter in Schwarzschild radii; "
                     "the disk, arcs, colours and beaming are a real-time schematic, not a "
                     "GR ray-traced reference image."),
            "dataset_release": source["dataset_release"],
            "delivery_release": release,
            "data_rights": source["data_rights"],
            "license": source["license"],
        },
        "objects": objs,
    }


def write_payload(delivery_dir: Path, release: str) -> dict:
    payload = build_payload(release)
    delivery_dir.mkdir(parents=True, exist_ok=True)
    (delivery_dir / "black_holes.json").write_text(json.dumps(payload, indent=1))
    return payload
