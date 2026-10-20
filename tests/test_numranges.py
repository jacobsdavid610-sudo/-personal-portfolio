import os
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import numranges  # noqa: E402

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "scripts", "numranges.py")


class ParseTest(unittest.TestCase):
    def test_mixed_singles_and_ranges(self):
        self.assertEqual(numranges.parse("1-3,5,8-10"), [1, 2, 3, 5, 8, 9, 10])

    def test_single_number(self):
        self.assertEqual(numranges.parse("7"), [7])

    def test_whitespace_is_ignored(self):
        self.assertEqual(numranges.parse(" 1 - 2 , 4 "), [1, 2, 4])

    def test_unsorted_and_overlapping_are_merged(self):
        self.assertEqual(numranges.parse("5,1-4,3-6"), [1, 2, 3, 4, 5, 6])

    def test_empty_input_is_empty_list(self):
        self.assertEqual(numranges.parse(""), [])
        self.assertEqual(numranges.parse("   "), [])
        self.assertEqual(numranges.parse(None), [])

    def test_zero_is_allowed(self):
        self.assertEqual(numranges.parse("0-2"), [0, 1, 2])

    def test_backwards_range_is_an_error(self):
        with self.assertRaises(ValueError):
            numranges.parse("5-3")

    def test_garbage_is_an_error(self):
        for bad in ("a", "1-b", "1,,2", "1,", "-5", "1--3", "1-2-3"):
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    numranges.parse(bad)

    def test_limit_rejects_big_numbers_before_expanding(self):
        with self.assertRaises(ValueError):
            numranges.parse("1-999999999", limit=100)
        self.assertEqual(numranges.parse("1-3", limit=3), [1, 2, 3])


class FormatTest(unittest.TestCase):
    def test_runs_of_three_or_more_become_ranges(self):
        self.assertEqual(numranges.format_ranges([1, 2, 3, 5, 8, 9, 10]), "1-3,5,8-10")

    def test_run_of_two_stays_as_two_numbers(self):
        self.assertEqual(numranges.format_ranges([4, 5]), "4,5")

    def test_unsorted_with_duplicates(self):
        self.assertEqual(numranges.format_ranges([3, 1, 2, 2, 9]), "1-3,9")

    def test_empty(self):
        self.assertEqual(numranges.format_ranges([]), "")

    def test_round_trip(self):
        for spec in ("1-3,5,8-10", "0", "2,4,6", "10-20"):
            with self.subTest(spec=spec):
                self.assertEqual(numranges.format_ranges(numranges.parse(spec)), spec)


class CliTest(unittest.TestCase):
    def run_cli(self, *args):
        return subprocess.run([sys.executable, SCRIPT, *args],
                              capture_output=True, text=True)

    def test_expands_one_per_line(self):
        r = self.run_cli("2-4")
        self.assertEqual((r.returncode, r.stdout), (0, "2\n3\n4\n"))

    def test_compact_normalises(self):
        r = self.run_cli("8-10, 1-3,5,2", "--compact")
        self.assertEqual(r.stdout.strip(), "1-3,5,8-10")

    def test_error_exits_1_on_stderr(self):
        r = self.run_cli("5-3")
        self.assertEqual(r.returncode, 1)
        self.assertIn("backwards", r.stderr)
        self.assertEqual(r.stdout, "")

    def test_limit_flag(self):
        r = self.run_cli("1-99", "--limit", "50")
        self.assertEqual(r.returncode, 1)


if __name__ == "__main__":
    unittest.main()
