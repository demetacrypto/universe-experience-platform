"""Base interface for astronomy archive adapters.

Every archive (SIMBAD, NED, VizieR, MAST, …) is wrapped in a small adapter that
exposes the same surface, so the platform can federate identity resolution and
cross-matching without coupling to any one service. Adapters degrade gracefully
when offline and always attach a credit/acknowledgement so the rights contract
is preserved end-to-end.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Optional


@dataclass
class ResolvedObject:
    """Unified result of resolving an object name against an archive."""

    name: str                              # canonical/main identifier
    archive: str                           # which adapter produced this
    ra_deg: Optional[float] = None
    dec_deg: Optional[float] = None
    object_type: Optional[str] = None      # star, galaxy, AGN, …
    aliases: list = field(default_factory=list)
    credit: str = ""
    acknowledgement: str = ""
    extra: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


class ArchiveAdapter:
    """Adapter contract. Subclasses implement `resolve` (and optionally more)."""

    key: str = "base"
    name: str = "Archive"
    credit: str = ""
    acknowledgement: str = ""
    #: roughly what this archive is authoritative for
    domain: str = "general"

    # Subclasses set this False at import time if their client cannot be loaded.
    _importable: bool = True

    def available(self) -> bool:
        return self._importable

    def resolve(self, name: str, timeout: int = 30) -> Optional[ResolvedObject]:
        """Resolve a free-text object name to a ResolvedObject, or None."""
        raise NotImplementedError

    def info(self) -> dict:
        return {"key": self.key, "name": self.name, "domain": self.domain,
                "credit": self.credit, "available": self.available()}
