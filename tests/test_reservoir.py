import os
import random
import sys
import unittest
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from reservoir import reservoir_sample  # noqa: E402


class FakeRng:
    """Returns a pre-set sequence of randint() results, in order - lets a
    test pin the exact replacement mechanics deterministically instead
    of only checking the statistical distribution over many trials."""

    def __init__(self, values):
        self._values = list(values)

    def randint(self, a, b):
        assert self._values, "FakeRng ran out of scripted values"
        return self._values.pop(0)


class EdgeCaseTest(unittest.TestCase):
    def test_negative_k_raises_value_error(self):
        with self.assertRaises(ValueError):
            reservoir_sample(["a"], -1)

    def test_k_zero_returns_empty_list(self):
        self.assertEqual(reservoir_sample(["a", "b", "c"], 0), [])

    def test_stream_shorter_than_k_returns_everything_in_order(self):
        self.assertEqual(reservoir_sample(["a", "b", "c"], 5), ["a", "b", "c"])

    def test_k_equal_to_stream_length_returns_everything_in_order(self):
        # No replacement ever triggers (every index is < k), so this is
        # the one case where output order is guaranteed to match input
        # order, not just guaranteed to contain the same items.
        self.assertEqual(reservoir_sample(["a", "b", "c"], 3), ["a", "b", "c"])

    def test_empty_stream_returns_empty_list(self):
        self.assertEqual(reservoir_sample([], 3), [])


class MechanicsTest(unittest.TestCase):
    def test_first_k_items_fill_the_reservoir_directly(self):
        # 3 items, k=3: every index is < k, so randint is never even
        # called - FakeRng([]) would raise if it were.
        result = reservoir_sample(["a", "b", "c"], 3, rng=FakeRng([]))
        self.assertEqual(result, ["a", "b", "c"])

    def test_replacement_lands_in_the_index_randint_returns(self):
        # k=2, stream = a, b, c, d.
        # i=0: reservoir = [a]
        # i=1: reservoir = [a, b]
        # i=2 (item c): randint(0, 2) scripted to return 0 -> replaces
        #   index 0: reservoir = [c, b]
        # i=3 (item d): randint(0, 3) scripted to return 5 (>= k) ->
        #   discarded, reservoir unchanged
        result = reservoir_sample(["a", "b", "c", "d"], 2, rng=FakeRng([0, 5]))
        self.assertEqual(result, ["c", "b"])

    def test_randint_result_at_or_past_k_discards_the_new_item(self):
        result = reservoir_sample(["a", "b", "c"], 2, rng=FakeRng([2]))
        self.assertEqual(result, ["a", "b"])


class ReproducibilityTest(unittest.TestCase):
    def test_same_seed_produces_the_same_sample(self):
        r1 = reservoir_sample(range(500), 5, rng=random.Random(42))
        r2 = reservoir_sample(range(500), 5, rng=random.Random(42))
        self.assertEqual(r1, r2)

    def test_different_seeds_produce_different_samples(self):
        # Not guaranteed in principle, but with 5 picks from 500 items
        # the odds of two different seeds coincidentally agreeing are
        # astronomically small - a collision here would mean the seed
        # isn't actually affecting the outcome.
        r1 = reservoir_sample(range(500), 5, rng=random.Random(1))
        r2 = reservoir_sample(range(500), 5, rng=random.Random(2))
        self.assertNotEqual(r1, r2)


class DistributionTest(unittest.TestCase):
    def test_each_item_is_selected_with_roughly_equal_probability(self):
        # 5 items, k=2 -> each item should appear in about 2/5 of
        # samples. 20000 trials against a fixed seed keeps this
        # deterministic across runs while still being a real statistical
        # check, not just a mechanics check - bounded loosely (25%-55%
        # against a 40% expectation) to only fail on a real bias, the
        # same style of tolerance consistenthash.py's tests use for its
        # own remap-fraction check.
        items = ["a", "b", "c", "d", "e"]
        trials = 20000
        rng = random.Random(7)
        counts = Counter()
        for _ in range(trials):
            for x in reservoir_sample(items, 2, rng=rng):
                counts[x] += 1

        for item in items:
            ratio = counts[item] / trials
            self.assertGreater(ratio, 0.25, f"{item} selected too rarely: {ratio}")
            self.assertLess(ratio, 0.55, f"{item} selected too often: {ratio}")

    def test_k_one_eventually_selects_every_item(self):
        items = ["a", "b", "c"]
        rng = random.Random(3)
        seen = set()
        for _ in range(2000):
            seen.update(reservoir_sample(items, 1, rng=rng))
        self.assertEqual(seen, set(items))


if __name__ == "__main__":
    unittest.main()
