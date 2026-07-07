"""Resolved-galaxy layer (L3) — famous individual galaxies.

Identity, distance, morphological type and physical size are OBSERVED (measured
from the literature). The 3-D star distribution rendered by the client is a
declared PROCEDURAL prior built to match the measured morphology class — we do
not have a resolved 3-D stellar map of these galaxies.
"""
from __future__ import annotations

import json
from pathlib import Path

from .provenance import SourceType, ConfidenceClass, VisualisationMode

# name, catalogue, type, morphology, distance_mly, diameter_ly, stars, arms,
# palette(core, arm, dust, hii), note, credit
GALAXIES = [
    {
        "name": "Milky Way", "catalogue": "—", "type": "Barred spiral (SBbc)",
        "morphology": "barred_spiral", "distance_mly": 0.0, "diameter_ly": 100000,
        "stars": "100–400 billion", "arms": 4,
        "palette": {"core": "#ffd9a0", "arm": "#9ec6ff", "dust": "#3a2a22", "hii": "#ff6f9c"},
        "central_bh": {"name": "Sagittarius A*", "mass_msun": 4.3e6, "note": "Imaged by the EHT in 2022."},
        "note": "Our home galaxy, shown from the outside — a barred spiral with four main arms.",
        "credit": "Structure from literature (we observe it from within).",
    },
    {
        "name": "Andromeda", "catalogue": "M31", "type": "Spiral (SA(s)b)",
        "morphology": "spiral", "distance_mly": 2.537, "diameter_ly": 152000,
        "stars": "~1 trillion", "arms": 2,
        "palette": {"core": "#ffe0ad", "arm": "#a8ccff", "dust": "#33241c", "hii": "#ff789e"},
        "central_bh": {"name": "M31*", "mass_msun": 1.4e8, "note": "One of the nearest billion-solar-mass class SMBHs."},
        "note": "The nearest large galaxy; on a collision course with the Milky Way in ~4.5 Gyr.",
        "credit": "Distance: Cepheid/TRGB (literature). Imagery class: GALEX/optical.",
    },
    {
        "name": "Triangulum", "catalogue": "M33", "type": "Spiral (SA(s)cd)",
        "morphology": "spiral", "distance_mly": 2.73, "diameter_ly": 60000,
        "stars": "~40 billion", "arms": 2,
        "palette": {"core": "#ffe6bf", "arm": "#9ec6ff", "dust": "#2e241d", "hii": "#ff7aa0"},
        "central_bh": {"name": "M33 core", "mass_msun": 3000, "note": "No classical SMBH detected — only a low upper limit."},
        "note": "Third-largest member of the Local Group; rich in star-forming regions.",
        "credit": "Distance from literature.",
    },
    {
        "name": "Whirlpool", "catalogue": "M51", "type": "Grand-design spiral (SA(s)bc)",
        "morphology": "spiral", "distance_mly": 23.0, "diameter_ly": 76000,
        "stars": "~160 billion", "arms": 2,
        "palette": {"core": "#ffdca0", "arm": "#9ec2ff", "dust": "#2c211a", "hii": "#ff6f9c"},
        "central_bh": {"name": "M51 nucleus", "mass_msun": 1.0e6, "note": "An active nucleus driving X-ray outflows."},
        "note": "A textbook grand-design spiral interacting with its companion NGC 5195.",
        "credit": "Distance from literature. Imagery class: HST.",
    },
    {
        "name": "Pinwheel", "catalogue": "M101", "type": "Spiral (SAB(rs)cd)",
        "morphology": "barred_spiral", "distance_mly": 21.0, "diameter_ly": 170000,
        "stars": "~1 trillion", "arms": 5,
        "palette": {"core": "#ffe1ad", "arm": "#a6caff", "dust": "#2e231b", "hii": "#ff7aa0"},
        "central_bh": {"name": "M101 nucleus", "mass_msun": 3.0e7, "note": "A relatively modest central black hole."},
        "note": "A giant, face-on spiral nearly twice the diameter of the Milky Way.",
        "credit": "Distance from literature. Imagery class: HST.",
    },
    {
        "name": "Sombrero", "catalogue": "M104", "type": "Lenticular / spiral (edge-on)",
        "morphology": "edge_on", "distance_mly": 29.3, "diameter_ly": 49000,
        "stars": "~800 billion", "arms": 0,
        "palette": {"core": "#ffe7c4", "arm": "#cdd6e6", "dust": "#1c140f", "hii": "#caa37a"},
        "central_bh": {"name": "Sombrero SMBH", "mass_msun": 1.0e9, "note": "One of the most massive SMBHs in the nearby universe."},
        "note": "Seen nearly edge-on, with a brilliant bulge bisected by a dark dust lane.",
        "credit": "Distance from literature. Imagery class: HST.",
    },
    {
        "name": "Centaurus A", "catalogue": "NGC 5128", "type": "Elliptical (active)",
        "morphology": "elliptical", "distance_mly": 13.0, "diameter_ly": 60000,
        "stars": "~1 trillion", "arms": 0,
        "palette": {"core": "#ffdca8", "arm": "#e0c79a", "dust": "#140d09", "hii": "#a88f6a"},
        "central_bh": {"name": "Cen A SMBH", "mass_msun": 5.5e7, "note": "Powers a giant radio jet spanning a million light-years."},
        "note": "The nearest active galaxy; a giant elliptical with a warped dust lane and a radio jet.",
        "credit": "Distance from literature. Imagery class: HST/radio.",
    },
]


def build_payload(release: str) -> dict:
    return {
        "layer": "galaxies",
        "frame": "Local scene; size in light-years",
        "provenance": {
            "source_type": SourceType.OBSERVED.value,
            "confidence": ConfidenceClass.MEASURED.value,
            "render_source_type": SourceType.PROCEDURAL.value,
            "render_confidence": ConfidenceClass.ILLUSTRATIVE.value,
            "visualisation_mode": VisualisationMode.POINT.value,
            "distance_method": "Cepheid / TRGB / surface-brightness (literature)",
            "credit": "Galaxy parameters from the published literature; 3-D star distribution is illustrative.",
            "note": ("Identity, distance, size and morphological type are measured. The "
                     "rendered stellar distribution is a declared procedural prior."),
            "dataset_release": release,
        },
        "objects": GALAXIES,
    }


def write_payload(delivery_dir: Path, release: str) -> dict:
    payload = build_payload(release)
    delivery_dir.mkdir(parents=True, exist_ok=True)
    (delivery_dir / "resolved_galaxies.json").write_text(json.dumps(payload, indent=1))
    return payload
