"""Tests for the multi-archive adapter framework.

Structure/interface tests run offline; live-resolution tests are network-gated
and skip cleanly when an archive is unreachable.
"""
import sys
import socket
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from uep import archives  # noqa: E402
from uep.archives.base import ArchiveAdapter, ResolvedObject  # noqa: E402


def _online(host="simbad.cds.unistra.fr", port=443, timeout=4):
    try:
        socket.create_connection((host, port), timeout=timeout).close()
        return True
    except OSError:
        return False


def test_registry_has_core_adapters():
    keys = {a["key"] for a in archives.list_adapters()}
    assert {"simbad", "ned", "vizier", "mast"}.issubset(keys)


def test_every_adapter_has_credit_and_interface():
    for key in ("simbad", "ned", "vizier", "mast"):
        a = archives.get(key)
        assert isinstance(a, ArchiveAdapter)
        assert a.credit and a.acknowledgement
        assert hasattr(a, "resolve")


def test_resolved_object_serialises():
    r = ResolvedObject(name="* alf Ori", archive="simbad", ra_deg=88.79, dec_deg=7.41,
                       object_type="s*r", aliases=["Betelgeuse"], credit="SIMBAD")
    d = r.to_dict()
    assert d["name"] == "* alf Ori" and d["ra_deg"] == 88.79 and d["archive"] == "simbad"


def test_vizier_is_not_a_resolver():
    assert archives.get("vizier").resolve("Betelgeuse") is None


@pytest.mark.network
def test_unknown_name_returns_none():
    if not _online():
        pytest.skip("offline")
    assert archives.resolve("zzz_not_a_real_object_xyz_123") is None


@pytest.mark.network
@pytest.mark.skipif(not _online(), reason="SIMBAD unreachable")
def test_simbad_resolves_betelgeuse():
    r = archives.resolve("Betelgeuse")
    assert r is not None and r.archive == "simbad"
    assert 88 < r.ra_deg < 89 and 7 < r.dec_deg < 8   # known position of alf Ori
    assert r.aliases
