import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from fuzzymatch import levenshtein, similarity, suggest  # noqa: E402


class LevenshteinTest(unittest.TestCase):
    def test_identical_strings(self):
        self.assertEqual(levenshtein("kitten", "kitten"), 0)

    def test_empty_strings(self):
        self.assertEqual(levenshtein("", ""), 0)
        self.assertEqual(levenshtein("abc", ""), 3)
        self.assertEqual(levenshtein("", "abc"), 3)

    def test_classic_kitten_sitting_example(self):
        # k->s, e->i, insert g: 3 edits, the textbook example.
        self.assertEqual(levenshtein("kitten", "sitting"), 3)

    def test_single_substitution(self):
        self.assertEqual(levenshtein("cat", "cot"), 1)

    def test_single_insertion(self):
        self.assertEqual(levenshtein("cat", "cats"), 1)

    def test_is_symmetric(self):
        self.assertEqual(levenshtein("flaw", "lawn"), levenshtein("lawn", "flaw"))


class SimilarityTest(unittest.TestCase):
    def test_identical_strings_score_one(self):
        self.assertEqual(similarity("hello", "hello"), 1.0)

    def test_completely_different_same_length(self):
        self.assertEqual(similarity("abc", "xyz"), 0.0)

    def test_both_empty_scores_one(self):
        self.assertEqual(similarity("", ""), 1.0)

    def test_score_is_between_zero_and_one(self):
        score = similarity("kitten", "sitting")
        self.assertGreaterEqual(score, 0.0)
        self.assertLessEqual(score, 1.0)


class SuggestTest(unittest.TestCase):
    def test_ranks_closest_match_first(self):
        candidates = ["apple", "orange", "grape", "banana"]
        results = suggest("aple", candidates)
        self.assertEqual(results[0][0], "apple")

    def test_respects_limit(self):
        candidates = ["apple", "orange", "grape", "banana", "mango"]
        results = suggest("a", candidates, limit=2)
        self.assertEqual(len(results), 2)

    def test_min_similarity_filters_out_weak_matches(self):
        candidates = ["apple", "spacecraft"]
        results = suggest("aple", candidates, min_similarity=0.5)
        names = [name for name, _score in results]
        self.assertIn("apple", names)
        self.assertNotIn("spacecraft", names)

    def test_results_sorted_descending_by_score(self):
        candidates = ["apple", "aple", "appl", "banana"]
        results = suggest("apple", candidates)
        scores = [score for _name, score in results]
        self.assertEqual(scores, sorted(scores, reverse=True))


if __name__ == "__main__":
    unittest.main()
