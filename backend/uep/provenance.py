"""Provenance truth model for the Universe Experience Platform.

Every renderable entity carries a compact provenance payload so the user can
always tell what is *measured*, *inferred*, *simulated*, or *illustrative*.
This is the scientific contract described in the guide: nothing is shown
without declaring where it came from.
"""
from __future__ import annotations

import enum
from dataclasses import dataclass, field, asdict
from typing import Optional


class SourceType(str, enum.Enum):
    """Hierarchy of evidence, strongest first."""

    OBSERVED = "observed"          # direct catalogue measurement (e.g. Gaia astrometry)
    DERIVED = "derived"            # quantity computed from measurements + literature model
    SIMULATED = "simulated"        # public simulation output (TNG, FIRE, CAMELS)
    PROCEDURAL = "procedural"      # declared statistical / artistic prior to fill a gap


class VisualisationMode(str, enum.Enum):
    POINT = "point"                # point / star sprite
    SPRITE = "sprite"              # billboarded impostor
    MESH = "mesh"                  # polygonal proxy or detailed mesh
    VOLUME = "volume"              # sparse volume (nebula, gas, dust)
    RAYTRACED = "raytraced"        # GR / relativistic reference render


class ConfidenceClass(str, enum.Enum):
    MEASURED = "measured"          # value + formal uncertainty from a catalogue
    INFERRED = "inferred"          # literature-derived, model dependent
    MODELLED = "modelled"          # simulation / emulator output
    ILLUSTRATIVE = "illustrative"  # procedural, not a claim about reality


@dataclass
class Provenance:
    """Compact, serialisable provenance record attached to every entity."""

    source_type: SourceType
    confidence: ConfidenceClass
    visualisation_mode: VisualisationMode
    catalogue_ids: dict = field(default_factory=dict)   # {"gaia": "DR3 12345", "simbad": "..."}
    measurement_epoch: Optional[float] = None            # decimal year, e.g. 2016.0 for Gaia DR3
    distance_method: Optional[str] = None                # "parallax", "redshift", "photometric", "assumed"
    uncertainty: dict = field(default_factory=dict)      # {"parallax_mas": 0.02, "distance_pc": 3.1}
    license: Optional[str] = None
    credit: Optional[str] = None
    dataset_release: Optional[str] = None                # immutable, citeable release tag
    notes: Optional[str] = None

    def to_dict(self) -> dict:
        d = asdict(self)
        d["source_type"] = self.source_type.value
        d["confidence"] = self.confidence.value
        d["visualisation_mode"] = self.visualisation_mode.value
        return d


# Canonical credit / license strings for the archives used by the platform.
# Honouring these is a launch requirement (see guide: rights & acknowledgements).
ARCHIVE_CREDITS = {
    "gaia": {
        "credit": "ESA/Gaia/DPAC",
        "license": "Gaia Data is released under CC BY-SA 3.0 IGO; cite the DR3 papers.",
        "ack": "This work has made use of data from the ESA mission Gaia, processed by "
               "the Gaia Data Processing and Analysis Consortium (DPAC).",
    },
    "simbad": {
        "credit": "SIMBAD, CDS, Strasbourg",
        "license": "ODbL; cite original papers as requested.",
        "ack": "This research has made use of the SIMBAD database, operated at CDS, Strasbourg, France.",
    },
    "ned": {
        "credit": "NASA/IPAC Extragalactic Database (NED)",
        "license": "Acknowledgement required for research use.",
        "ack": "This research has made use of the NASA/IPAC Extragalactic Database (NED).",
    },
    "wise": {
        "credit": "NASA/JPL-Caltech/UCLA (WISE)",
        "license": "Public; include required WISE credit text.",
        "ack": "This publication makes use of data products from the Wide-field Infrared Survey Explorer.",
    },
    "2mass": {
        "credit": "2MASS / IPAC / Caltech / UMass",
        "license": "Public; acknowledgement requested.",
        "ack": "This publication makes use of data products from the Two Micron All Sky Survey.",
    },
    "illustristng": {
        "credit": "IllustrisTNG Collaboration",
        "license": "Public; account login required for downloads; cite TNG papers.",
        "ack": "We thank the IllustrisTNG Collaboration for making their data public.",
    },
}


def credit_for(archive: str) -> dict:
    return ARCHIVE_CREDITS.get(archive.lower(), {"credit": archive, "license": "unknown", "ack": ""})
