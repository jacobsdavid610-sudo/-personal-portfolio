import os
import random
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from markov import build_model, generate, tokenize  # noqa: E402


class TokenizeTest(unittest.TestCase):
    def test_splits_on_whitespace(self):
        self.assertEqual(tokenize("the quick  brown\nfox"), ["the", "quick", "brown", "fox"])


class BuildModelTest(unittest.TestCase):
    def test_bigram_model_maps_pairs_to_next_word(self):
        tokens = tokenize("the cat sat on the mat")
        model = build_model(tokens, order=2)
        self.assertEqual(model[("the", "cat")], ["sat"])
        self.assertEqual(model[("cat", "sat")], ["on"])

    def test_repeated_transitions_are_kept_with_repeats_not_deduped(self):
        # "the cat" is followed by "sat" once and "ran" once here.
        tokens = tokenize("the cat sat. the cat ran.")
        model = build_model(tokens, order=2)
        self.assertEqual(sorted(model[("the", "cat")]), ["ran.", "sat."])

    def test_corpus_too_short_for_order_returns_empty_model(self):
        self.assertEqual(build_model(tokenize("only two words"), order=5), {})

    def test_order_three_uses_three_token_keys(self):
        tokens = tokenize("a b c d a b c e")
        model = build_model(tokens, order=3)
        self.assertEqual(sorted(model[("a", "b", "c")]), ["d", "e"])


class GenerateTest(unittest.TestCase):
    def test_empty_model_returns_empty_list(self):
        self.assertEqual(generate({}), [])

    def test_generation_is_reproducible_with_a_seeded_rng(self):
        tokens = tokenize("the cat sat on the mat the cat ran on the roof")
        model = build_model(tokens, order=2)

        out1 = generate(model, order=2, max_tokens=10, rng=random.Random(42))
        out2 = generate(model, order=2, max_tokens=10, rng=random.Random(42))
        self.assertEqual(out1, out2)

    def test_different_seeds_can_produce_different_output(self):
        tokens = tokenize("the cat sat on the mat the dog ran in the park today")
        model = build_model(tokens, order=1)

        outputs = {
            tuple(generate(model, order=1, max_tokens=15, rng=random.Random(seed)))
            for seed in range(10)
        }
        self.assertGreater(len(outputs), 1)

    def test_generated_tokens_all_come_from_the_corpus(self):
        tokens = tokenize("the cat sat on the mat the cat ran on the roof")
        model = build_model(tokens, order=2)
        vocab = set(tokens)

        result = generate(model, order=2, max_tokens=20, rng=random.Random(7))
        self.assertTrue(set(result).issubset(vocab))

    def test_stops_early_if_a_key_has_no_continuation(self):
        # Only one transition exists at all, so generation must stop after it.
        tokens = tokenize("a b c")
        model = build_model(tokens, order=2)  # {(a, b): [c]}
        result = generate(model, order=2, max_tokens=100, rng=random.Random(1), start=("a", "b"))
        self.assertEqual(result, ["a", "b", "c"])

    def test_max_tokens_caps_output_length(self):
        tokens = tokenize("a b " * 20)
        model = build_model(tokens, order=1)
        result = generate(model, order=1, max_tokens=5, rng=random.Random(3))
        self.assertLessEqual(len(result), 5)


if __name__ == "__main__":
    unittest.main()
