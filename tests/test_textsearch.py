import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from textsearch import build_index, cosine_similarity, load_docs, search, tokenize, vectorize  # noqa: E402


class TokenizeTest(unittest.TestCase):
    def test_lowercases_and_splits_on_punctuation(self):
        self.assertEqual(tokenize("Hello, World! It's great."), ["hello", "world", "it's", "great"])


class SearchTest(unittest.TestCase):
    def setUp(self):
        self.docs = {
            "cats.txt": "Cats are small furry mammals. Cats sleep most of the day.",
            "dogs.txt": "Dogs are loyal companions and love to play fetch.",
            "cars.txt": "Cars run on engines and need regular maintenance.",
        }

    def test_ranks_most_relevant_document_first(self):
        results = search(self.docs, "cats sleeping")
        self.assertGreater(len(results), 0)
        self.assertEqual(results[0][0], "cats.txt")

    def test_unrelated_query_returns_no_matches(self):
        results = search(self.docs, "spacecraft telemetry orbit")
        self.assertEqual(results, [])

    def test_top_n_limits_results(self):
        results = search(self.docs, "the a", top_n=1)
        self.assertLessEqual(len(results), 1)

    def test_scores_are_sorted_descending(self):
        results = search(self.docs, "cats dogs cars")
        scores = [score for _name, score in results]
        self.assertEqual(scores, sorted(scores, reverse=True))


class CosineSimilarityTest(unittest.TestCase):
    def test_identical_vectors_score_one(self):
        vec = {"a": 1.0, "b": 2.0}
        self.assertAlmostEqual(cosine_similarity(vec, vec), 1.0)

    def test_disjoint_vectors_score_zero(self):
        self.assertEqual(cosine_similarity({"a": 1.0}, {"b": 1.0}), 0.0)

    def test_empty_vector_scores_zero(self):
        self.assertEqual(cosine_similarity({}, {"a": 1.0}), 0.0)


class BuildIndexTest(unittest.TestCase):
    def test_common_term_has_lower_idf_than_rare_term(self):
        docs = {
            "a": "shared zephyr",
            "b": "shared quartz",
            "c": "shared marble",
        }
        _term_freqs, idf = build_index(docs)
        self.assertLess(idf["shared"], idf["zephyr"])


class LoadDocsTest(unittest.TestCase):
    def test_only_loads_txt_and_md_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            with open(os.path.join(tmp, "a.txt"), "w") as f:
                f.write("hello")
            with open(os.path.join(tmp, "b.md"), "w") as f:
                f.write("world")
            with open(os.path.join(tmp, "c.bin"), "wb") as f:
                f.write(b"\x00\x01")

            docs = load_docs(tmp)

            names = {os.path.basename(p) for p in docs}
            self.assertEqual(names, {"a.txt", "b.md"})


if __name__ == "__main__":
    unittest.main()
