"""NED adapter — identity broker for extragalactic objects (galaxies, AGN,
clusters) beyond the Milky Way."""
from __future__ import annotations

import sys
from typing import Optional

from .base import ArchiveAdapter, ResolvedObject


class NedAdapter(ArchiveAdapter):
    key = "ned"
    name = "NASA/IPAC Extragalactic Database (NED)"
    domain = "identity (extragalactic: galaxies, AGN, clusters)"
    credit = "NASA/IPAC Extragalactic Database (NED)"
    acknowledgement = ("This research has made use of the NASA/IPAC Extragalactic "
                       "Database (NED), operated by Caltech under contract with NASA.")

    def __init__(self):
        try:
            from astroquery.ipac.ned import Ned  # noqa: F401
            self._importable = True
        except Exception:
            self._importable = False

    def resolve(self, name: str, timeout: int = 40) -> Optional[ResolvedObject]:
        if not self.available():
            return None
        try:
            from astroquery.ipac.ned import Ned
            tbl = Ned.query_object(name)
            if tbl is None or len(tbl) == 0:
                return None
            row = tbl[0]
            cols = {c.lower(): c for c in tbl.colnames}
            g = lambda *ns: next((row[cols[n]] for n in ns if n in cols), None)
            return ResolvedObject(
                name=str(g("object name") or name), archive=self.key,
                ra_deg=_f(g("ra", "ra(deg)")), dec_deg=_f(g("dec", "dec(deg)")),
                object_type=(str(g("type")) if g("type") is not None else None),
                credit=self.credit, acknowledgement=self.acknowledgement,
                extra={"redshift": _f(g("redshift"))},
            )
        except Exception as exc:
            print(f"[ned] resolve failed for {name!r}: {type(exc).__name__}: {exc}", file=sys.stderr)
            return None


def _f(v):
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None
