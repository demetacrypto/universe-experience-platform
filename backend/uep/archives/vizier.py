"""VizieR adapter — federation layer over thousands of published catalogues.
Used for catalogue discovery and literature-linked enrichment, not as a sole
persistent source."""
from __future__ import annotations

import sys
from typing import Optional

from .base import ArchiveAdapter, ResolvedObject


class VizierAdapter(ArchiveAdapter):
    key = "vizier"
    name = "VizieR (CDS)"
    domain = "catalogue federation / literature enrichment"
    credit = "VizieR catalogue access tool, CDS, Strasbourg, France"
    acknowledgement = ("This research has made use of the VizieR catalogue access "
                       "tool, CDS, Strasbourg, France (DOI: 10.26093/cds/vizier).")

    def __init__(self):
        try:
            from astroquery.vizier import Vizier  # noqa: F401
            self._importable = True
        except Exception:
            self._importable = False

    def resolve(self, name: str, timeout: int = 30) -> Optional[ResolvedObject]:
        # VizieR is a catalogue federation, not a name resolver; identity should
        # come from SIMBAD/NED. Returns None by design.
        return None

    def find_catalogues(self, keyword: str, limit: int = 10) -> list:
        """Discover published catalogues matching a keyword (DOI-citable)."""
        if not self.available():
            return []
        try:
            from astroquery.vizier import Vizier
            res = Vizier.find_catalogs(keyword)
            out = []
            for k, v in list(res.items())[:limit]:
                out.append({"catalogue": k, "description": getattr(v, "description", "")})
            return out
        except Exception as exc:
            print(f"[vizier] find_catalogues failed: {type(exc).__name__}: {exc}", file=sys.stderr)
            return []
