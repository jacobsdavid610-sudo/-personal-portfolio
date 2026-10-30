import io
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import hexdump  # noqa: E402

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "scripts", "hexdump.py")


def dump(data, **kwargs):
    return list(hexdump.iter_lines(io.BytesIO(data), **kwargs))


class FormatLineTest(unittest.TestCase):
    def test_full_line_layout(self):
        line = hexdump.format_line(0, b"Hello, World!\n\x00\x01")
        self.assertEqual(
            line,
            "00000000  48 65 6c 6c 6f 2c 20 57  6f 72 6c 64 21 0a 00 01  |Hello, World!...|",
        )

    def test_short_line_is_padded_so_the_gutter_lines_up(self):
        full = hexdump.format_line(0, bytes(16))
        short = hexdump.format_line(16, b"abc")
        self.assertEqual(full.index("|"), short.index("|"))

    def test_offset_is_eight_hex_digits(self):
        self.assertTrue(hexdump.format_line(0x1234abcd, b"x").startswith("1234abcd  "))

    def test_non_printable_bytes_show_as_dots(self):
        self.assertTrue(hexdump.format_line(0, b"\x00\x1f\x7f\xffa").endswith("|....a|"))

    def test_printable_range_edges(self):
        self.assertTrue(hexdump.format_line(0, b" ~").endswith("| ~|"))


class IterLinesTest(unittest.TestCase):
    def test_empty_input_is_just_the_final_offset(self):
        self.assertEqual(dump(b""), ["00000000"])

    def test_final_line_is_the_total_length(self):
        self.assertEqual(dump(b"abc")[-1], "00000003")
        self.assertEqual(dump(bytes(32))[-1], "00000020")

    def test_exact_multiple_of_width_has_no_partial_line(self):
        lines = dump(bytes(range(32)))
        self.assertEqual(len(lines), 3)

    def test_custom_width(self):
        lines = dump(b"abcdefgh", width=4)
        self.assertEqual([ln.split("  ")[0] for ln in lines], ["00000000", "00000004", "00000008"])

    def test_repeated_lines_collapse_to_a_star(self):
        lines = dump(b"A" * 16 * 5 + b"xyz")
        # first line, "*", the short last line, and the closing offset
        self.assertEqual(len(lines), 4)
        self.assertEqual(lines[1], "*")
        self.assertTrue(lines[2].startswith("00000050"))

    def test_two_identical_lines_still_squeeze_the_second(self):
        lines = dump(b"A" * 32)
        self.assertEqual(lines[:2], [hexdump.format_line(0, b"A" * 16), "*"])

    def test_no_squeeze_shows_everything(self):
        lines = dump(b"A" * 16 * 4, squeeze=False)
        self.assertEqual(len(lines), 5)
        self.assertNotIn("*", lines)

    def test_a_different_line_ends_the_squeeze_and_a_new_run_can_start(self):
        data = b"A" * 48 + b"B" * 16 + b"B" * 16 + b"B" * 16
        lines = dump(data)
        self.assertEqual(lines.count("*"), 2)

    def test_partial_last_line_is_never_squeezed(self):
        lines = dump(b"A" * 16 + b"A" * 5)
        self.assertNotIn("*", lines)
        self.assertEqual(len(lines), 3)

    def test_skip_keeps_true_offsets(self):
        lines = dump(b"abcdefghij", width=4, skip=2)
        self.assertTrue(lines[0].startswith("00000002"))
        self.assertEqual(lines[-1], "0000000a")

    def test_length_limits_the_dump(self):
        lines = dump(b"abcdefghij", length=3)
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[-1], "00000003")

    def test_skip_and_length_together(self):
        lines = dump(b"abcdefghij", width=4, skip=2, length=5)
        self.assertEqual(lines[-1], "00000007")
        self.assertTrue(lines[0].endswith("|cdef|"))

    def test_length_zero_dumps_nothing(self):
        self.assertEqual(dump(b"abc", length=0), ["00000000"])

    def test_skip_past_the_end(self):
        self.assertEqual(dump(b"abc", skip=10), ["0000000a"])

    def test_invalid_arguments(self):
        with self.assertRaises(ValueError):
            dump(b"x", width=0)
        with self.assertRaises(ValueError):
            dump(b"x", skip=-1)
        with self.assertRaises(ValueError):
            dump(b"x", length=-1)


class ChunkBoundaryTest(unittest.TestCase):
    """Output must not depend on how the stream happens to be read."""

    def setUp(self):
        self.original = hexdump.CHUNK

    def tearDown(self):
        hexdump.CHUNK = self.original

    def test_output_is_the_same_for_any_read_size(self):
        data = b"A" * 100 + bytes(range(37)) + b"Z" * 70 + b"tail"
        baseline = dump(data)
        for chunk in (1, 3, 7, 16, 17, 33, 1000):
            with self.subTest(chunk=chunk):
                hexdump.CHUNK = chunk
                self.assertEqual(dump(data), baseline)

    def test_squeeze_survives_a_chunk_boundary_inside_a_run(self):
        hexdump.CHUNK = 20
        lines = dump(b"A" * 16 * 6)
        self.assertEqual(lines.count("*"), 1)

    def test_skip_and_length_work_across_small_chunks(self):
        hexdump.CHUNK = 1000
        expected = dump(b"abcdefghij", width=4, skip=2, length=5)
        hexdump.CHUNK = 3
        self.assertEqual(dump(b"abcdefghij", width=4, skip=2, length=5), expected)


class CliTest(unittest.TestCase):
    def run_cli(self, *args, stdin=b""):
        return subprocess.run([sys.executable, SCRIPT, *args], input=stdin, capture_output=True)

    def test_reads_stdin(self):
        r = self.run_cli(stdin=b"Hi")
        self.assertEqual(r.returncode, 0)
        lines = r.stdout.decode().splitlines()
        self.assertTrue(lines[0].endswith("|Hi|"))
        self.assertEqual(lines[1], "00000002")

    def test_reads_a_file_and_accepts_hex_numbers(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "f.bin")
            with open(path, "wb") as fh:
                fh.write(bytes(range(64)))
            r = self.run_cli(path, "-s", "0x10", "-n", "0x10")
        lines = r.stdout.decode().splitlines()
        self.assertTrue(lines[0].startswith("00000010"))
        self.assertEqual(lines[-1], "00000020")

    def test_missing_file_exits_2(self):
        r = self.run_cli("/no/such/file.bin")
        self.assertEqual(r.returncode, 2)
        self.assertIn(b"hexdump:", r.stderr)

    def test_bad_width_exits_1(self):
        r = self.run_cli("-w", "0", stdin=b"x")
        self.assertEqual(r.returncode, 1)

    def test_no_squeeze_flag(self):
        r = self.run_cli("-v", stdin=b"A" * 64)
        self.assertNotIn(b"*", r.stdout)


if __name__ == "__main__":
    unittest.main()
