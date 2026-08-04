import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from lru_cache import LRUCache  # noqa: E402


class LRUCacheTest(unittest.TestCase):
    def test_get_missing_key_returns_default(self):
        cache = LRUCache(2)
        self.assertIsNone(cache.get("missing"))
        self.assertEqual(cache.get("missing", "fallback"), "fallback")

    def test_put_then_get_roundtrips(self):
        cache = LRUCache(2)
        cache.put("a", 1)
        self.assertEqual(cache.get("a"), 1)

    def test_evicts_least_recently_used_on_overflow(self):
        cache = LRUCache(2)
        cache.put("a", 1)
        cache.put("b", 2)
        cache.put("c", 3)  # evicts "a" (least recently used)

        self.assertNotIn("a", cache)
        self.assertIn("b", cache)
        self.assertIn("c", cache)

    def test_get_refreshes_recency_so_it_survives_eviction(self):
        cache = LRUCache(2)
        cache.put("a", 1)
        cache.put("b", 2)
        cache.get("a")  # "a" is now most recently used, "b" is least
        cache.put("c", 3)  # evicts "b", not "a"

        self.assertIn("a", cache)
        self.assertNotIn("b", cache)
        self.assertIn("c", cache)

    def test_put_on_existing_key_updates_value_and_recency(self):
        cache = LRUCache(2)
        cache.put("a", 1)
        cache.put("b", 2)
        cache.put("a", 99)  # updates value, makes "a" most recent
        cache.put("c", 3)  # should evict "b", not "a"

        self.assertEqual(cache.get("a"), 99)
        self.assertNotIn("b", cache)
        self.assertIn("c", cache)

    def test_len_reflects_current_size_up_to_capacity(self):
        cache = LRUCache(2)
        self.assertEqual(len(cache), 0)
        cache.put("a", 1)
        self.assertEqual(len(cache), 1)
        cache.put("b", 2)
        cache.put("c", 3)
        self.assertEqual(len(cache), 2)

    def test_keys_by_recency_most_recent_first(self):
        cache = LRUCache(3)
        cache.put("a", 1)
        cache.put("b", 2)
        cache.put("c", 3)
        cache.get("a")
        self.assertEqual(cache.keys_by_recency(), ["a", "c", "b"])

    def test_rejects_non_positive_capacity(self):
        with self.assertRaises(ValueError):
            LRUCache(0)
        with self.assertRaises(ValueError):
            LRUCache(-1)

    def test_capacity_one_always_holds_just_the_latest(self):
        cache = LRUCache(1)
        cache.put("a", 1)
        cache.put("b", 2)
        self.assertNotIn("a", cache)
        self.assertEqual(cache.get("b"), 2)


if __name__ == "__main__":
    unittest.main()
