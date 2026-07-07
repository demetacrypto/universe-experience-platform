"""Security primitives for the runtime API (OWASP API Security Top-10 oriented).

Implements, dependency-free:
  * a per-client token-bucket rate limiter (API4: unrestricted resource consumption),
  * standard security response headers,
  * a rights gate that enforces per-object data-rights before serving (API1/API3:
    broken object-level / property-level authorization), honouring the dataset's
    license/credit metadata.

These are deliberately small and in-memory so the prototype is self-contained;
in production back the limiter with Redis and the rights gate with the provenance
store + signed URLs.
"""
from __future__ import annotations

import time
import threading
from dataclasses import dataclass

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-site",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
}

# data-rights states an object may carry (mirrors MAST's dataRights field)
PUBLIC_RIGHTS = {"public", "open", "", None}


@dataclass
class _Bucket:
    tokens: float
    last: float


class RateLimiter:
    """Token-bucket limiter: `rate` requests/sec with `burst` capacity, per key."""

    def __init__(self, rate: float = 20.0, burst: int = 40):
        self.rate = rate
        self.burst = burst
        self._buckets: dict[str, _Bucket] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            b = self._buckets.get(key)
            if b is None:
                self._buckets[key] = _Bucket(self.burst - 1, now)
                return True
            # refill
            b.tokens = min(self.burst, b.tokens + (now - b.last) * self.rate)
            b.last = now
            if b.tokens >= 1:
                b.tokens -= 1
                return True
            return False


def is_public(rights) -> bool:
    """Whether an object's data-rights permit public serving."""
    if rights is None:
        return True
    return str(rights).strip().lower() in {"public", "open", ""}


def rights_ok(record: dict) -> bool:
    """Object-level authorisation: allow only public/open products."""
    return is_public(record.get("data_rights") or record.get("dataRights"))
