import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from skiplist import SkipList  # noqa: E402


class ConstructionTest(unittest.TestCase):
    def test_zero_p_raises_value_error(self):
        with self.assertRaises(ValueError):
            SkipList(p=0)

    def test_one_p_raises_value_error(self):
        with self.assertRaises(ValueError):
            SkipList(p=1)

    def test_negative_p_raises_value_error(self):
        with self.assertRaises(ValueError):
            SkipList(p=-0.5)

    def test_zero_max_level_raises_value_error(self):
        with self.assertRaises(ValueError):
            SkipList(max_level=0)

    def test_new_skiplist_is_empty(self):
        s = SkipList()
        self.assertEqual(len(s), 0)


class SearchTest(unittest.TestCase):
    def test_search_missing_key_raises_key_error(self):
        s = SkipList(seed=1)
        with self.assertRaises(KeyError):
            s.search("ghost")

    def test_insert_then_search_round_trips(self):
        s = SkipList(seed=1)
        s.insert(5, "five")
        self.assertEqual(s.search(5), "five")

    def test_reinserting_a_key_overwrites_value_without_growing_len(self):
        s = SkipList(seed=1)
        s.insert(5, "five")
        s.insert(5, "FIVE")
        self.assertEqual(s.search(5), "FIVE")
        self.assertEqual(len(s), 1)

    def test_contains_and_getitem_setitem(self):
        s = SkipList(seed=1)
        self.assertNotIn(5, s)
        s[5] = "five"
        self.assertIn(5, s)
        self.assertEqual(s[5], "five")


class DeletionTest(unittest.TestCase):
    def test_delete_missing_key_raises_key_error(self):
        s = SkipList(seed=1)
        with self.assertRaises(KeyError):
            s.delete("ghost")

    def test_delete_removes_key_and_shrinks_len(self):
        s = SkipList(seed=1)
        s.insert(5, "five")
        s.insert(10, "ten")
        s.delete(5)
        self.assertNotIn(5, s)
        self.assertIn(10, s)
        self.assertEqual(len(s), 1)

    def test_delitem_matches_delete(self):
        s = SkipList(seed=1)
        s[5] = "five"
        del s[5]
        self.assertNotIn(5, s)

    def test_deleting_every_key_returns_to_empty(self):
        s = SkipList(seed=2)
        for i in range(50):
            s.insert(i, str(i))
        for i in range(50):
            s.delete(i)
        self.assertEqual(len(s), 0)
        self.assertEqual(list(s), [])


class OrderingTest(unittest.TestCase):
    def test_iteration_yields_keys_in_ascending_order_regardless_of_insert_order(self):
        s = SkipList(seed=3)
        for key in [50, 10, 40, 20, 30, 0, -5]:
            s.insert(key, None)
        self.assertEqual(list(s), sorted([50, 10, 40, 20, 30, 0, -5]))

    def test_large_scale_insert_and_search(self):
        s = SkipList(seed=4)
        keys = list(range(1000))
        import random

        shuffled = keys[:]
        random.Random(99).shuffle(shuffled)
        for key in shuffled:
            s.insert(key, key * 2)

        self.assertEqual(len(s), 1000)
        self.assertEqual(list(s), keys)
        for key in (0, 1, 500, 998, 999):
            self.assertEqual(s.search(key), key * 2)


class RangeTest(unittest.TestCase):
    def setUp(self):
        self.s = SkipList(seed=5)
        for key in [10, 20, 30, 40, 50]:
            self.s.insert(key, key)

    def test_range_is_inclusive_on_both_ends(self):
        self.assertEqual(self.s.range(20, 40), [(20, 20), (30, 30), (40, 40)])

    def test_range_with_no_matches_is_empty(self):
        self.assertEqual(self.s.range(21, 29), [])

    def test_range_covering_everything(self):
        self.assertEqual(self.s.range(0, 100), [(10, 10), (20, 20), (30, 30), (40, 40), (50, 50)])

    def test_start_greater_than_end_raises_value_error(self):
        with self.assertRaises(ValueError):
            self.s.range(40, 10)


class LevelPromotionTest(unittest.TestCase):
    def test_same_seed_and_same_insert_order_produce_the_same_top_level(self):
        keys = list(range(200))
        s1 = SkipList(seed=42)
        s2 = SkipList(seed=42)
        for key in keys:
            s1.insert(key, None)
            s2.insert(key, None)
        self.assertEqual(s1._level, s2._level)
        self.assertEqual(list(s1), list(s2))

    def test_top_level_never_exceeds_max_level(self):
        s = SkipList(p=0.9, max_level=3, seed=7)
        for key in range(500):
            s.insert(key, None)
        self.assertLessEqual(s._level, 3)


if __name__ == "__main__":
    unittest.main()
