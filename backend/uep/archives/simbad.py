"""SIMBAD adapter — the canonical name resolver for objects outside the Solar
System (aliases, basic properties, object type)."""
from __future__ import annotations

import sys
from typing import Optional

from .base import ArchiveAdapter, ResolvedObject


class SimbadAdapter(ArchiveAdapter):
    key = "simbad"
    name = "SIMBAD (CDS, Strasbourg)"
    domain = "identity / cross-identification (Galactic + stellar)"
    credit = "SIMBAD, CDS, Strasbourg, France"
    acknowledgement = ("This research has made use of the SIMBAD database, "
                       "operated at CDS, Strasbourg, France.")

    def __init__(self):
        try:
            from astroquery.simbad import Simbad  # noqa: F401
            self._importable = True
        except Exception:
            self._importable = False

    def _client(self):
        from astroquery.simbad import Simbad
        s = Simbad()
        s.TIMEOUT = 30
        try:
            s.add_votable_fields("otype")     # object type (newer astroquery)
        except Exception:
            pass
        return s

    def resolve(self, name: str, timeout: int = 30) -> Optional[ResolvedObject]:
        if not self.available():
            return None
        try:
            s = self._client()
            s.TIMEOUT = timeout
            tbl = s.query_object(name)
            if tbl is None or len(tbl) == 0:
                return None
            row = tbl[0]
            cols = {c.lower(): c for c in tbl.colnames}

            def get(*names):
                for n in names:
                    if n in cols:
                        v = row[cols[n]]
                        try:
                            return None if v is None or str(v) == "--" else v
                        except Exception:
                            return v
                return None

            main_id = get("main_id", "main_id ")
            ra = get("ra"); dec = get("dec")
            otype = get("otype", "otype_txt", "otype_main")

            aliases = []
            try:
                ids = s.query_objectids(name)
                if ids is not None:
                    idcol = ids.colnames[0]
                    aliases = [str(x) for x in ids[idcol][:12]]
            except Exception:
                pass

            return ResolvedObject(
                name=str(main_id) if main_id is not None else name,
                archive=self.key,
                ra_deg=_to_float(ra), dec_deg=_to_float(dec),
                object_type=(str(otype) if otype is not None else None),
                aliases=aliases, credit=self.credit, acknowledgement=self.acknowledgement,
            )
        except Exception as exc:
            print(f"[simbad] resolve failed for {name!r}: {type(exc).__name__}: {exc}", file=sys.stderr)
            return None


def _to_float(v):
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        # sexagesimal string -> degrees via astropy
        try:
            from astropy.coordinates import Angle
            import astropy.units as u
            return float(Angle(str(v), unit=u.deg).deg)
        except Exception:
            return None
