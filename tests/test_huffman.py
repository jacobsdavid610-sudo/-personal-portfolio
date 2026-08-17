import os
import random
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from huffman import compress, decompress, build_tree, build_codes  # noqa: E402


class HuffmanRoundTripTest(unittest.TestCase):
    def roundtrip(self, data):
        blob = compress(data)
        self.assertEqual(decompress(blob), data)
        return blob

    def test_empty_input(self):
        blob = self.roundtrip(b"")
        self.assertEqual(decompress(blob), b"")

    def test_single_repeated_byte(self):
        self.roundtrip(b"a" * 500)

    def test_two_distinct_symbols(self):
        self.roundtrip(b"ab" * 100)

    def test_typical_text(self):
        text = b"the quick brown fox jumps over the lazy dog " * 20
        self.roundtrip(text)

    def test_all_256_byte_values(self):
        self.roundtrip(bytes(range(256)))

    def test_single_byte_input(self):
        self.roundtrip(b"x")

    def test_random_binary_data(self):
        rng = random.Random(42)
        data = bytes(rng.randrange(256) for _ in range(2000))
        self.roundtrip(data)

    def test_skewed_frequencies_compress_smaller_than_original(self):
        # Highly skewed distribution should actually shrink.
        data = b"a" * 900 + b"b" * 90 + b"c" * 9 + b"d"
        blob = self.roundtrip(data)
        self.assertLess(len(blob), len(data))

    def test_decompress_rejects_bad_magic(self):
        with self.assertRaises(ValueError):
            decompress(b"NOPE" + b"\x00" * 10)


class HuffmanCodeTableTest(unittest.TestCase):
    def test_no_code_is_a_prefix_of_another(self):
        freqs = {ord("a"): 5, ord("b"): 2, ord("c"): 1, ord("d"): 1}
        codes = build_codes(build_tree(freqs))
        for sym_a, code_a in codes.items():
            for sym_b, code_b in codes.items():
                if sym_a == sym_b:
                    continue
                self.assertFalse(
                    code_b.startswith(code_a),
                    f"{code_a!r} (for {sym_a}) is a prefix of {code_b!r} (for {sym_b})",
                )

    def test_more_frequent_symbol_gets_code_no_longer_than_rarer_symbol(self):
        freqs = {ord("a"): 100, ord("b"): 1}
        codes = build_codes(build_tree(freqs))
        self.assertLessEqual(len(codes[ord("a")]), len(codes[ord("b")]))

    def test_single_symbol_gets_nonempty_code(self):
        codes = build_codes(build_tree({ord("z"): 10}))
        self.assertEqual(codes, {ord("z"): "0"})


if __name__ == "__main__":
    unittest.main()
