import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from ratelimiter import TokenBucket  # noqa: E402


class FakeClock:
    """Injectable clock so tests don't sleep in real time."""

    def __init__(self, start=0.0):
        self.now = start

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


class TokenBucketTest(unittest.TestCase):
    def test_allows_up_to_capacity_with_no_time_passing(self):
        clock = FakeClock()
        bucket = TokenBucket(capacity=3, refill_rate=1, clock=clock)

        self.assertTrue(bucket.allow())
        self.assertTrue(bucket.allow())
        self.assertTrue(bucket.allow())
        self.assertFalse(bucket.allow())

    def test_refills_over_time(self):
        clock = FakeClock()
        bucket = TokenBucket(capacity=2, refill_rate=1, clock=clock)

        self.assertTrue(bucket.allow())
        self.assertTrue(bucket.allow())
        self.assertFalse(bucket.allow())

        clock.advance(1.0)
        self.assertTrue(bucket.allow())

    def test_never_exceeds_capacity_even_after_long_idle(self):
        clock = FakeClock()
        bucket = TokenBucket(capacity=2, refill_rate=1, clock=clock)

        clock.advance(1000)
        self.assertTrue(bucket.allow())
        self.assertTrue(bucket.allow())
        self.assertFalse(bucket.allow())

    def test_rejected_call_does_not_consume_tokens(self):
        clock = FakeClock()
        bucket = TokenBucket(capacity=1, refill_rate=1, clock=clock)

        self.assertTrue(bucket.allow())
        self.assertFalse(bucket.allow())
        self.assertFalse(bucket.allow())

        clock.advance(1.0)
        self.assertTrue(bucket.allow())

    def test_wait_time_is_zero_when_tokens_available(self):
        clock = FakeClock()
        bucket = TokenBucket(capacity=1, refill_rate=1, clock=clock)
        self.assertEqual(bucket.wait_time(), 0.0)

    def test_wait_time_reflects_refill_rate(self):
        clock = FakeClock()
        bucket = TokenBucket(capacity=1, refill_rate=2, clock=clock)
        bucket.allow()
        self.assertAlmostEqual(bucket.wait_time(), 0.5)

    def test_rejects_non_positive_capacity_and_refill_rate(self):
        with self.assertRaises(ValueError):
            TokenBucket(capacity=0, refill_rate=1)
        with self.assertRaises(ValueError):
            TokenBucket(capacity=1, refill_rate=0)

    def test_cost_greater_than_one(self):
        clock = FakeClock()
        bucket = TokenBucket(capacity=5, refill_rate=1, clock=clock)

        self.assertTrue(bucket.allow(cost=3))
        self.assertFalse(bucket.allow(cost=3))
        self.assertTrue(bucket.allow(cost=2))


if __name__ == "__main__":
    unittest.main()
