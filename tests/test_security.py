"""Tests for the API security primitives (rate limiter, rights gate, headers)."""
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from uep.security import RateLimiter, rights_ok, is_public, SECURITY_HEADERS  # noqa: E402


def test_rate_limiter_blocks_burst():
    rl = RateLimiter(rate=1.0, burst=5)
    allowed = sum(1 for _ in range(20) if rl.allow("1.2.3.4"))
    assert allowed == 5                     # only the burst capacity passes immediately


def test_rate_limiter_refills_over_time():
    rl = RateLimiter(rate=100.0, burst=2)
    assert rl.allow("x") and rl.allow("x")
    assert not rl.allow("x")                # bucket empty
    time.sleep(0.05)                        # ~5 tokens refill at 100/s
    assert rl.allow("x")


def test_rate_limiter_is_per_client():
    rl = RateLimiter(rate=0.0, burst=1)
    assert rl.allow("a") and not rl.allow("a")
    assert rl.allow("b")                    # different client has its own bucket


def test_rate_limiter_bounds_client_bucket_storage():
    rl = RateLimiter(rate=0.0, burst=1, max_buckets=2)
    assert rl.allow("a") and rl.allow("b") and rl.allow("c")
    assert len(rl._buckets) == 2
    assert "a" not in rl._buckets


def test_rights_gate():
    assert is_public("public") and is_public("open")
    assert not is_public(None) and not is_public("")
    assert not is_public("restricted") and not is_public("exclusive_access")
    assert rights_ok({"data_rights": "public"})
    assert rights_ok({"dataRights": "open"})
    assert not rights_ok({})                # missing rights fail closed
    assert not rights_ok({"data_rights": "restricted"})
    # Schema aliases must never let a conflicting restriction fail open.
    assert not rights_ok({"data_rights": "public", "dataRights": "restricted"})
    assert not rights_ok({"data_rights": "restricted", "dataRights": "public"})
    assert rights_ok({"data_rights": "public", "dataRights": None})


def test_security_headers_present():
    for h in ("Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy"):
        assert h in SECURITY_HEADERS
    assert SECURITY_HEADERS["X-Content-Type-Options"] == "nosniff"
    assert "object-src 'none'" in SECURITY_HEADERS["Content-Security-Policy"]
