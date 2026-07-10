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
from collections import OrderedDict
from dataclasses import dataclass

SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com data:; "
        "img-src 'self' data: blob: https:; "
        "connect-src 'self' https://cdn.jsdelivr.net https://threejs.org; "
        "worker-src 'self' blob:; object-src 'none'; base-uri 'self'; "
        "frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests"
    ),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-site",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
}

# Explicit data-rights states that permit public serving. Missing or blank rights
# fail closed so a future restricted archive cannot leak through schema drift.
PUBLIC_RIGHTS = {"public", "open"}
RIGHTS_FIELDS = ("data_rights", "dataRights")


@dataclass
class _Bucket:
    tokens: float
    last: float


class RateLimiter:
    """Token-bucket limiter: `rate` requests/sec with `burst` capacity, per key."""

    def __init__(self, rate: float = 20.0, burst: int = 40, max_buckets: int = 10_000):
        self.rate = rate
        self.burst = burst
        self.max_buckets = max(1, max_buckets)
        self._buckets: OrderedDict[str, _Bucket] = OrderedDict()
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            b = self._buckets.get(key)
            if b is None:
                if len(self._buckets) >= self.max_buckets:
                    self._buckets.popitem(last=False)
                self._buckets[key] = _Bucket(self.burst - 1, now)
                return True
            self._buckets.move_to_end(key)
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
        return False
    return str(rights).strip().lower() in PUBLIC_RIGHTS


def _is_missing(rights) -> bool:
    """Treat schema-level nulls as absent without importing a dataframe library."""
    if rights is None:
        return True
    try:
        return bool(rights != rights)  # NaN is the only normal scalar unequal to itself.
    except (TypeError, ValueError):
        return False


def declared_rights(record) -> tuple:
    """Return every non-null rights alias declared on a mapping/Series."""
    return tuple(
        record.get(field)
        for field in RIGHTS_FIELDS
        if field in record and not _is_missing(record.get(field))
    )


def rights_ok(record: dict) -> bool:
    """Allow only records whose every declared rights alias is public/open."""
    rights = declared_rights(record)
    return bool(rights) and all(is_public(value) for value in rights)


def public_rights_mask(frame):
    """Vectorised fail-closed rights gate for a pandas-compatible dataframe."""
    fields = [field for field in RIGHTS_FIELDS if field in frame]
    if not fields:
        return frame.index.to_series().map(lambda _: False)

    first = frame[fields[0]]
    has_rights = first.notna()
    allowed = first.isna() | first.map(is_public)
    for field in fields[1:]:
        values = frame[field]
        has_rights |= values.notna()
        allowed &= values.isna() | values.map(is_public)
    return has_rights & allowed
