import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from bloomfilter import BloomFilter  # noqa: E402


class ConstructionTest(unittest.TestCase):
    def test_zero_expected_items_raises_value_error(self):
        with self.assertRaises(ValueError):
            BloomFilter(expected_items=0)

    def test_negative_expected_items_raises_value_error(self):
        with self.assertRaises(ValueError):
            BloomFilter(expected_items=-5)

    def test_zero_false_positive_rate_raises_value_error(self):
        with self.assertRaises(ValueError):
            BloomFilter(expected_items=10, false_positive_rate=0)

    def test_false_positive_rate_of_one_raises_value_error(self):
        with self.assertRaises(ValueError):
            BloomFilter(expected_items=10, false_positive_rate=1)

    def test_sizing_matches_the_standard_optimal_m_k_formulas(self):
        import math
        n, p = 500, 0.02
        bf = BloomFilter(expected_items=n, false_positive_rate=p)
        expected_bits = math.ceil(-(n * math.log(p)) / (math.log(2) ** 2))
        expected_hashes = max(1, round((expected_bits / n) * math.log(2)))
        self.assertEqual(bf.num_bits, expected_bits)
        self.assertEqual(bf.num_hashes, expected_hashes)


class MembershipTest(unittest.TestCase):
    def test_a_never_added_item_is_reported_as_not_present(self):
        bf = BloomFilter(expected_items=10)
        self.assertNotIn("ghost", bf)

    def test_an_added_item_is_always_reported_as_maybe_present(self):
        bf = BloomFilter(expected_items=10)
        bf.add("alice")
        self.assertIn("alice", bf)

    def test_no_false_negatives_across_many_added_items(self):
        bf = BloomFilter(expected_items=300, false_positive_rate=0.01)
        items = [f"item-{i}" for i in range(300)]
        for item in items:
            bf.add(item)
        missing = [item for item in items if item not in bf]
        self.assertEqual(missing, [])

    def test_non_string_items_are_hashed_by_their_string_form(self):
        bf = BloomFilter(expected_items=10)
        bf.add(42)
        self.assertIn(42, bf)
        self.assertIn("42", bf)

    def test_false_positive_rate_stays_within_a_safe_margin_of_target(self):
        # Deterministic (sha256-based, no randomness): build a filter sized
        # for 200 items at a 1% target, add exactly those 200, then probe
        # 2000 disjoint items that were never added. The measured rate
        # should land close to the target - well under a 5x safety margin,
        # which would only be blown by a real regression in the hashing or
        # sizing math, not by chance.
        bf = BloomFilter(expected_items=200, false_positive_rate=0.01)
        for i in range(200):
            bf.add(f"item-{i}")
        false_positives = sum(1 for i in range(2000) if f"check-{i}" in bf)
        self.assertLess(false_positives / 2000, 0.05)


class LenAndEstimateTest(unittest.TestCase):
    def test_len_tracks_the_number_of_adds_including_duplicates(self):
        bf = BloomFilter(expected_items=10)
        bf.add("a")
        bf.add("b")
        bf.add("a")
        self.assertEqual(len(bf), 3)

    def test_empty_filter_has_zero_estimated_false_positive_rate(self):
        bf = BloomFilter(expected_items=10)
        self.assertEqual(bf.current_false_positive_rate(), 0.0)

    def test_estimated_false_positive_rate_rises_as_items_are_added(self):
        bf = BloomFilter(expected_items=100, false_positive_rate=0.01)
        rates = []
        for i in range(0, 100, 10):
            for j in range(10):
                bf.add(f"item-{i + j}")
            rates.append(bf.current_false_positive_rate())
        self.assertEqual(rates, sorted(rates))

    def test_estimated_rate_near_target_once_filled_to_expected_capacity(self):
        n, p = 400, 0.01
        bf = BloomFilter(expected_items=n, false_positive_rate=p)
        for i in range(n):
            bf.add(f"item-{i}")
        self.assertLess(abs(bf.current_false_positive_rate() - p), p)


if __name__ == "__main__":
    unittest.main()
