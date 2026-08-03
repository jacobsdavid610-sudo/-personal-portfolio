#!/usr/bin/env python3
"""Token-bucket rate limiter. Pure stdlib, no dependencies. The clock is
injectable so it's testable without sleeping in real time."""

import time


class TokenBucket:
    """Allows up to `capacity` calls, refilling at `refill_rate` tokens/sec."""

    def __init__(self, capacity, refill_rate, clock=time.monotonic):
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        if refill_rate <= 0:
            raise ValueError("refill_rate must be positive")

        self.capacity = capacity
        self.refill_rate = refill_rate
        self._clock = clock
        self._tokens = capacity
        self._last_refill = clock()

    def _refill(self):
        now = self._clock()
        elapsed = now - self._last_refill
        if elapsed <= 0:
            return
        self._tokens = min(self.capacity, self._tokens + elapsed * self.refill_rate)
        self._last_refill = now

    def allow(self, cost=1):
        """Try to consume `cost` tokens. Returns True if allowed, False if not
        (and does not consume anything on rejection)."""
        self._refill()
        if self._tokens >= cost:
            self._tokens -= cost
            return True
        return False

    def wait_time(self, cost=1):
        """Seconds until `cost` tokens would be available, 0 if available now."""
        self._refill()
        if self._tokens >= cost:
            return 0.0
        return (cost - self._tokens) / self.refill_rate


def main():
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capacity", type=int, default=5)
    parser.add_argument("--refill-rate", type=float, default=1.0, help="tokens/sec")
    parser.add_argument("--calls", type=int, default=10, help="calls to simulate")
    args = parser.parse_args()

    bucket = TokenBucket(args.capacity, args.refill_rate)
    for i in range(1, args.calls + 1):
        allowed = bucket.allow()
        status = "allowed" if allowed else f"blocked (retry in {bucket.wait_time():.2f}s)"
        print(f"call {i}: {status}")
        time.sleep(0.2)


if __name__ == "__main__":
    main()
