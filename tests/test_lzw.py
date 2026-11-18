import io
import os
import random
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import lzw  # noqa: E402
from lzw import CLEAR, END, FIRST, LZWError, compress, decompress  # noqa: E402

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "scripts", "lzw.py")


def run(args, data=b""):
    r = subprocess.run([sys.executable, SCRIPT, *args], input=data, capture_output=True)
    return r.returncode, r.stdout, r.stderr.decode("utf-8", "replace")


def pack(codes):
    """Write codes the way the encoder would: the width comes from its table
    size, which grows by one for every code that isn't CLEAR or END."""
    w = lzw._BitWriter()
    size = FIRST
    for c in codes:
        w.write(c, lzw._width(size))
        if c == CLEAR:
            size = FIRST
        elif c != END:
            size += 1
    return w.finish()


def unpack(stream):
    """Read codes back using the width rule from the module docstring,
    mirroring its table growth but without building any strings."""
    codes, pos, size, first = [], 0, FIRST, True
    total = len(stream) * 8
    while pos < total:
        width = lzw._width(size + (0 if first else 1))
        code = 0
        for _ in range(width):
            code = (code << 1) | ((stream[pos >> 3] >> (7 - (pos & 7))) & 1)
            pos += 1
        codes.append(code)
        if code == END:
            break
        if code == CLEAR:
            size, first = FIRST, True
        else:
            if not first:
                size += 1
            first = False
    return codes


class KnownAnswers(unittest.TestCase):
    def test_classic_example(self):
        # Wikipedia's TOBEORNOTTOBEORTOBEORNOT, whose codes start at 256;
        # ours start at 258, so every code that is not a byte moves up by 2.
        classic = [84, 79, 66, 69, 79, 82, 78, 79, 84, 256, 258, 260, 265, 259, 261, 263]
        expected = [c + 2 if c >= 256 else c for c in classic] + [END]
        self.assertEqual(unpack(compress(b"TOBEORNOTTOBEORTOBEORNOT")), expected)

    def test_exact_bytes_of_small_inputs(self):
        self.assertEqual(compress(b""), b"\x80\x80")  # END alone, 9 bits, padded
        self.assertEqual(compress(b"A"), bytes([0x20, 0xC0, 0x40]))  # 65, 257 in 9 bits each
        self.assertEqual(pack([65, END]), compress(b"A"))

    def test_kwkwk_case(self):
        # "aaaa..." makes the decoder see a code it hasn't defined yet
        for n in (3, 4, 5, 10, 1000):
            d = b"a" * n
            self.assertEqual(decompress(compress(d)), d)
        self.assertEqual(unpack(compress(b"aaaaaa")), [97, 258, 259, END])


class RoundTrips(unittest.TestCase):
    def test_small_and_edge_inputs(self):
        for d in (b"", b"\x00", b"\xff", b"ab", b"abab", b"\x00" * 7, bytes(range(256)), bytes(range(255, -1, -1))):
            self.assertEqual(decompress(compress(d)), d)

    def test_every_length_up_to_width_changes(self):
        # distinct pairs make a new entry per code, so the table (and the
        # code width) grows as fast as possible; this crosses 9->10->11->12
        rng = random.Random(3)
        for n in list(range(0, 40)) + [500, 511, 512, 513, 514, 1020, 1023, 1024, 1025, 1026, 2046, 2047, 2048, 2049, 2050, 4000, 8000]:
            d = bytes(rng.randrange(256) for _ in range(n))
            self.assertEqual(decompress(compress(d)), d, n)

    def test_every_length_around_each_width_boundary(self):
        # END is written after the last code, and its width depends on the
        # table size at that moment. Prefixes that end on (or a byte either
        # side of) the code number that makes the table 511/512, 1023/1024,
        # 2047/2048 entries, or fill it so that CLEAR is written, hit each case.
        rng = random.Random(9)
        buf = bytes(rng.randrange(256) for _ in range(9000))
        ends = []  # offset where each code's text ends; the table resets when full
        table, size, w = set(), FIRST, b""
        for i, byte in enumerate(buf):
            wc = w + bytes([byte])
            if len(wc) == 1 or wc in table:
                w = wc
                continue
            table.add(wc)
            size += 1
            ends.append(i)
            w = bytes([byte])
            if size == lzw.FULL:
                table, size = set(), FIRST
        self.assertGreater(len(ends), 3900)
        cases = 0
        for target in (511, 512, 1023, 1024, 2047, 2048, 4094, 4095):
            for j in range(target - FIRST - 1, target - FIRST + 2):
                for delta in (-1, 0, 1):
                    n = ends[j] + delta
                    self.assertEqual(decompress(compress(buf[:n])), buf[:n], (target, j, n))
                    cases += 1
        self.assertEqual(cases, 72)

    def test_widths_really_do_grow(self):
        rng = random.Random(4)
        d = bytes(rng.randrange(256) for _ in range(20_000))
        codes = unpack(compress(d))
        self.assertIn(CLEAR, codes)  # 20000 random bytes overflow the 12-bit table
        self.assertEqual(codes[-1], END)
        self.assertTrue(any(c >= 2048 for c in codes))

    def test_table_reset_many_times(self):
        d = bytes(random.Random(5).choices(b"abcdefgh", k=200_000))
        c = compress(d)
        self.assertGreater(unpack(c).count(CLEAR), 3)
        self.assertEqual(decompress(c), d)

    def test_text_shrinks_and_noise_grows_a_little(self):
        with open(lzw.__file__, "rb") as f:
            text = f.read() * 40
        self.assertLess(len(compress(text)), len(text) // 2)
        noise = os.urandom(20_000)
        self.assertEqual(decompress(compress(noise)), noise)
        self.assertLess(len(compress(noise)), len(noise) * 1.5)

    def test_random_buffers_with_different_alphabets(self):
        rng = random.Random(6)
        for _ in range(150):
            alphabet = bytes(range(rng.choice([1, 2, 4, 16, 256])))
            d = bytes(rng.choices(alphabet, k=rng.randrange(0, 3000)))
            self.assertEqual(decompress(compress(d)), d)

    def test_accepts_bytearray_and_memoryview_input(self):
        self.assertEqual(decompress(compress(bytearray(b"hello hello"))), b"hello hello")
        self.assertEqual(decompress(memoryview(compress(b"hello hello"))), b"hello hello")

    def test_output_is_deterministic(self):
        d = os.urandom(3000)
        self.assertEqual(compress(d), compress(d))


class Refuses(unittest.TestCase):
    def test_empty_and_truncated_streams(self):
        for bad in (b"", b"\x00", compress(b"hello world")[:-1], compress(b"hello world")[:-2]):
            with self.subTest(bad=bad), self.assertRaisesRegex(LZWError, "before the END"):
                decompress(bad)

    def test_stream_without_end(self):
        with self.assertRaisesRegex(LZWError, "before the END"):
            decompress(pack([104, 105]))

    def test_code_beyond_the_table(self):
        with self.assertRaisesRegex(LZWError, "invalid code 300"):
            decompress(pack([65, 300, END]))

    def test_first_code_after_clear_must_be_a_byte(self):
        with self.assertRaisesRegex(LZWError, "invalid code 258"):
            decompress(pack([258, END]))
        with self.assertRaisesRegex(LZWError, "invalid code"):
            decompress(pack([65, 66, CLEAR, 258, END]))

    def test_clear_in_the_middle_is_fine(self):
        self.assertEqual(decompress(pack([65, 66, CLEAR, 67, 68, END])), b"ABCD")

    def test_trailing_bytes_after_end(self):
        with self.assertRaisesRegex(LZWError, "unexpected bytes after END"):
            decompress(compress(b"abc") + b"\x00")

    def test_non_zero_padding(self):
        good = compress(b"abc")
        # 4 codes * 9 bits = 36 bits, so 4 padding bits at the end of byte 5
        self.assertEqual(len(good), 5)
        with self.assertRaisesRegex(LZWError, "padding"):
            decompress(good[:-1] + bytes([good[-1] | 1]))

    def test_table_overflow_without_clear(self):
        # an encoder that never emits CLEAR would need 13-bit codes
        stream = pack([65] + [i % 256 for i in range(5000)] + [END])
        with self.assertRaisesRegex(LZWError, "table overflow"):
            decompress(stream)

    def test_nothing_garbage_crashes(self):
        rng = random.Random(8)
        for _ in range(500):
            junk = bytes(rng.randrange(256) for _ in range(rng.randrange(0, 40)))
            try:
                decompress(junk)
            except LZWError:
                pass


class Cli(unittest.TestCase):
    def test_round_trip_through_the_cli(self):
        d = os.urandom(5000) + b"abc" * 5000
        code, packed, err = run([], d)
        self.assertEqual((code, err), (0, ""))
        code, out, err = run(["-d"], packed)
        self.assertEqual((code, out, err), (0, d, ""))

    def test_file_argument(self):
        with tempfile.TemporaryDirectory() as dir_:
            path = os.path.join(dir_, "in.bin")
            with open(path, "wb") as f:
                f.write(b"hello hello hello")
            code, out, _ = run([path])
        self.assertEqual((code, out), (0, compress(b"hello hello hello")))

    def test_exit_codes(self):
        code, out, err = run(["-d"], b"not lzw at all, definitely")
        self.assertEqual((code, out), (1, b""))
        self.assertIn("lzw:", err)
        code, _, err = run(["no-such-file"])
        self.assertEqual(code, 2)
        self.assertIn("lzw:", err)

    def test_main_with_streams(self):
        out, err = io.BytesIO(), io.StringIO()
        self.assertEqual(lzw.main([], stdin=io.BytesIO(b"abab"), stdout=out, stderr=err), 0)
        self.assertEqual(out.getvalue(), compress(b"abab"))


if __name__ == "__main__":
    unittest.main()
