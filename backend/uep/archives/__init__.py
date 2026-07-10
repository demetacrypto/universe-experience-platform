"""Archive adapter registry + federated identity resolution.

Resolution strategy: try the authoritative name resolver (SIMBAD) first, then
fall back to the extragalactic broker (NED). The first hit wins; every result
carries the producing archive's credit so the rights contract is preserved.
"""
from __future__ import annotations

from typing import Optional

from .base import ArchiveAdapter, ResolvedObject
from .simbad import SimbadAdapter
from .ned import NedAdapter
from .vizier import VizierAdapter
from .mast import MastAdapter

# Order matters: SIMBAD is the canonical name resolver, NED the extragalactic one.
ADAPTERS = {
    "simbad": SimbadAdapter(),
    "ned": NedAdapter(),
    "vizier": VizierAdapter(),
    "mast": MastAdapter(),
}

#: which adapters can resolve a free-text name to coordinates, in priority order
_RESOLVE_ORDER = ["simbad", "ned"]


def get(key: str) -> Optional[ArchiveAdapter]:
    return ADAPTERS.get(key)


def list_adapters() -> list:
    return [a.info() for a in ADAPTERS.values()]


def resolve(name: str, prefer: str | None = None, timeout: int = 8) -> Optional[ResolvedObject]:
    """Federated resolve: return the first archive that recognises `name`."""
    order = ([prefer] if prefer else []) + [k for k in _RESOLVE_ORDER if k != prefer]
    for key in order:
        a = ADAPTERS.get(key)
        if a and a.available():
            r = a.resolve(name, timeout=timeout)
            if r is not None:
                return r
    return None
