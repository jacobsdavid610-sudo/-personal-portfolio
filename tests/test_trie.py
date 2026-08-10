import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from trie import Trie  # noqa: E402


class TrieTest(unittest.TestCase):
    def setUp(self):
        self.trie = Trie()
        for word in ["cat", "car", "card", "care", "dog"]:
            self.trie.insert(word)

    def test_search_finds_inserted_words(self):
        self.assertTrue(self.trie.search("cat"))
        self.assertTrue(self.trie.search("card"))

    def test_search_rejects_words_never_inserted(self):
        self.assertFalse(self.trie.search("ca"))
        self.assertFalse(self.trie.search("carp"))
        self.assertFalse(self.trie.search("dogs"))

    def test_search_on_empty_trie(self):
        self.assertFalse(Trie().search("anything"))

    def test_starts_with_true_for_a_real_prefix_even_if_not_a_word(self):
        self.assertTrue(self.trie.starts_with("ca"))
        self.assertFalse(self.trie.starts_with("dogs"))

    def test_a_word_can_also_be_a_prefix_of_another_word(self):
        # "car" is itself a stored word AND a prefix of "card"/"care".
        self.assertTrue(self.trie.search("car"))
        self.assertTrue(self.trie.starts_with("car"))
        self.assertEqual(self.trie.autocomplete("car"), ["car", "card", "care"])

    def test_autocomplete_returns_alphabetical_order(self):
        self.assertEqual(self.trie.autocomplete("ca"), ["car", "card", "care", "cat"])

    def test_autocomplete_respects_limit(self):
        self.assertEqual(self.trie.autocomplete("ca", limit=2), ["car", "card"])

    def test_autocomplete_on_nonexistent_prefix_returns_empty(self):
        self.assertEqual(self.trie.autocomplete("zzz"), [])

    def test_autocomplete_empty_prefix_returns_everything_sorted(self):
        self.assertEqual(
            self.trie.autocomplete(""), ["car", "card", "care", "cat", "dog"]
        )

    def test_inserting_the_same_word_twice_is_harmless(self):
        self.trie.insert("cat")
        self.assertEqual(self.trie.autocomplete("cat"), ["cat"])


if __name__ == "__main__":
    unittest.main()
