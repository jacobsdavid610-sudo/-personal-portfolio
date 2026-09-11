import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from lfu_cache import LFUCache  # noqa: E402


class BasicTest(unittest.TestCase):
    def test_get_missing_key_returns_default(self):
        cache = LFUCache(2)
        self.assertIsNone(cache.get("missing"))
        self.assertEqual(cache.get("missing", "fallback"), "fallback")

    def test_put_then_get_roundtrips(self):
        cache = LFUCache(2)
        cache.put("a", 1)
        self.assertEqual(cache.get("a"), 1)

    def test_rejects_non_positive_capacity(self):
        with self.assertRaises(ValueError):
            LFUCache(0)
        with self.assertRaises(ValueError):
            LFUCache(-1)

    def test_len_reflects_current_size_up_to_capacity(self):
        cache = LFUCache(2)
        self.assertEqual(len(cache), 0)
        cache.put("a", 1)
        self.assertEqual(len(cache), 1)
        cache.put("b", 2)
        cache.put("c", 3)
        self.assertEqual(len(cache), 2)

    def test_put_on_existing_key_updates_value_without_growing(self):
        cache = LFUCache(2)
        cache.put("a", 1)
        cache.put("a", 99)
        self.assertEqual(cache.get("a"), 99)
        self.assertEqual(len(cache), 1)


class FrequencyTest(unittest.TestCase):
    def test_a_fresh_key_starts_at_frequency_one(self):
        cache = LFUCache(2)
        cache.put("a", 1)
        self.assertEqual(cache.frequency_of("a"), 1)

    def test_get_increments_frequency(self):
        cache = LFUCache(2)
        cache.put("a", 1)
        cache.get("a")
        cache.get("a")
        self.assertEqual(cache.frequency_of("a"), 3)

    def test_put_on_existing_key_also_increments_frequency(self):
        cache = LFUCache(2)
        cache.put("a", 1)
        cache.put("a", 2)
        self.assertEqual(cache.frequency_of("a"), 2)

    def test_frequency_of_missing_key_is_none(self):
        cache = LFUCache(2)
        self.assertIsNone(cache.frequency_of("ghost"))


class EvictionTest(unittest.TestCase):
    def test_evicts_the_least_frequently_used_key_on_overflow(self):
        cache = LFUCache(2)
        cache.put("a", 1)
        cache.put("b", 2)
        cache.get("a")  # a: freq 2, b: freq 1
        cache.put("c", 3)  # should evict b, the less-frequent one

        self.assertIn("a", cache)
        self.assertNotIn("b", cache)
        self.assertIn("c", cache)

    def test_ties_in_frequency_break_by_least_recently_used(self):
        cache = LFUCache(2)
        cache.put("a", 1)
        cache.put("b", 2)  # both at freq 1; a is now the older/LRU one
        cache.put("c", 3)  # should evict a, not b

        self.assertNotIn("a", cache)
        self.assertIn("b", cache)
        self.assertIn("c", cache)

    def test_touching_the_older_tied_key_saves_it_from_eviction(self):
        cache = LFUCache(2)
        cache.put("a", 1)
        cache.put("b", 2)  # both at freq 1
        cache.get("a")  # a: freq 2, b still freq 1 -> b is now the sole minimum
        cache.put("c", 3)  # should evict b

        self.assertIn("a", cache)
        self.assertNotIn("b", cache)
        self.assertIn("c", cache)

    def test_capacity_one_always_holds_just_the_latest(self):
        cache = LFUCache(1)
        cache.put("a", 1)
        cache.put("b", 2)
        self.assertNotIn("a", cache)
        self.assertEqual(cache.get("b"), 2)

    def test_repeated_use_keeps_a_hot_key_alive_across_many_new_arrivals(self):
        cache = LFUCache(2)
        cache.put("hot", 1)
        for i in range(50):
            cache.get("hot")
            cache.put(f"cold-{i}", i)  # each cold key immediately evicted next round
        self.assertIn("hot", cache)

    def test_min_frequency_tracking_survives_a_full_bucket_eviction_and_refill(self):
        # Regression check for the _min_freq bookkeeping itself: drive the
        # cache through an evict-then-refill-at-freq-1 cycle twice and
        # confirm eviction order stays correct both times, not just once.
        cache = LFUCache(2)
        cache.put("a", 1)
        cache.put("b", 2)
        cache.put("c", 3)  # evicts a (tie-break, older)
        self.assertNotIn("a", cache)
        cache.put("d", 4)  # b and c both at freq 1; evicts b (older)
        self.assertNotIn("b", cache)
        self.assertIn("c", cache)
        self.assertIn("d", cache)


if __name__ == "__main__":
    unittest.main()
