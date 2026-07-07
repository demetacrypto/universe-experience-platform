"""MAST adapter — mission archive (HST, JWST, …). Gold-standard for high-
resolution showcase imagery and deep-field validation. Respects per-product
data-rights fields (public / exclusive access / restricted)."""
from __future__ import annotations

import sys
from typing import Optional

from .base import ArchiveAdapter, ResolvedObject


class MastAdapter(ArchiveAdapter):
    key = "mast"
    name = "MAST (STScI)"
    domain = "mission archive (HST/JWST imagery, deep fields)"
    credit = "Mikulski Archive for Space Telescopes (MAST), STScI"
    acknowledgement = ("Some of the data presented in this work were obtained from "
                       "the Mikulski Archive for Space Telescopes (MAST) at STScI.")

    def __init__(self):
        try:
            from astroquery.mast import Observations  # noqa: F401
            self._importable = True
        except Exception:
            self._importable = False

    def resolve(self, name: str, timeout: int = 40) -> Optional[ResolvedObject]:
        # Identity belongs to SIMBAD/NED; MAST is for imagery products.
        return None

    def count_products(self, name: str, timeout: int = 40) -> Optional[dict]:
        """Count public observations for an object (rights-aware)."""
        if not self.available():
            return None
        try:
            from astroquery.mast import Observations
            obs = Observations.query_object(name, radius="0.02 deg")
            if obs is None or len(obs) == 0:
                return {"object": name, "observations": 0, "public": 0}
            rights = [str(r).lower() for r in obs["dataRights"]] if "dataRights" in obs.colnames else []
            public = sum(1 for r in rights if r == "public")
            return {"object": name, "observations": int(len(obs)),
                    "public": public, "note": "Respect per-product dataRights before serving."}
        except Exception as exc:
            print(f"[mast] count_products failed: {type(exc).__name__}: {exc}", file=sys.stderr)
            return None
