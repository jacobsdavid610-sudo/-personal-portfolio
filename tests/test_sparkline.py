import math
import os
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import sparkline  # noqa: E402
from sparkline import bar, histogram, parse_numbers, render_histogram, squeeze  # noqa: E402
from sparkline import sparkline as spark  # noqa: E402

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "scripts", "sparkline.py")


class SparklineTest(unittest.TestCase):
    def test_min_is_lowest_bar_and_max_is_highest(self):
        self.assertEqual(spark([1, 5, 2, 8]), "▁▅▂█")

    def test_every_level_is_reachable(self):
        self.assertEqual(spark(range(8)), "▁▂▃▄▅▆▇█")

    def test_levels_are_evenly_spread(self):
        self.assertEqual(spark([i / 10 for i in range(81)]).count("▁"), 10)

    def test_negative_and_float_values(self):
        self.assertEqual(spark([-1.5, 0.0, 1.5]), "▁▅█")

    def test_flat_series_is_mid_height(self):
        self.assertEqual(spark([3, 3, 3]), "▄▄▄")
        self.assertEqual(spark([7]), "▄")

    def test_empty(self):
        self.assertEqual(spark([]), "")

    def test_gaps_are_spaces(self):
        self.assertEqual(spark([1, None, 8, float("nan"), 1]), "▁ █ ▁")

    def test_all_gaps(self):
        self.assertEqual(spark([None, float("nan")]), "  ")

    def test_fixed_scale(self):
        self.assertEqual(spark([0, 50, 100], lo=0, hi=100), "▁▅█")
        self.assertEqual(spark([50], lo=0, hi=100), "▅")

    def test_fixed_scale_clamps(self):
        self.assertEqual(spark([-10, 200], lo=0, hi=100), "▁█")

    def test_only_one_end_fixed(self):
        self.assertEqual(spark([5, 10], lo=0), "▅█")

    def test_lo_equals_hi_scale(self):
        self.assertEqual(spark([1, 2], lo=5, hi=5), "▄▄")

    def test_hi_below_lo_is_an_error(self):
        with self.assertRaises(ValueError):
            spark([1], lo=5, hi=1)

    def test_rejects_non_numbers(self):
        for bad in (["1"], [True], [object()]):
            with self.assertRaises(TypeError):
                spark(bad)

    def test_rejects_infinity(self):
        with self.assertRaises(ValueError):
            spark([1, math.inf])

    def test_accepts_any_iterable(self):
        self.assertEqual(spark(x for x in (1, 2)), "▁█")


class SqueezeTest(unittest.TestCase):
    def test_short_series_unchanged(self):
        self.assertEqual(squeeze([1, 2, 3], 5), [1, 2, 3])
        self.assertEqual(squeeze([1, 2, 3], 3), [1, 2, 3])

    def test_averages_buckets(self):
        self.assertEqual(squeeze([1, 3, 5, 7], 2), [2, 6])

    def test_uneven_buckets_use_every_value_once(self):
        values = list(range(10))
        out = squeeze(values, 3)
        self.assertEqual(len(out), 3)
        # bucket edges 0..3, 3..6, 6..10
        self.assertEqual(out, [1, 4, 7.5])

    def test_width_one_is_the_mean(self):
        self.assertEqual(squeeze([2, 4, 6, 8], 1), [5])

    def test_gaps_skipped_and_all_gap_bucket_stays_gap(self):
        self.assertEqual(squeeze([1, None, None, None, 5, 7], 3), [1, None, 6])

    def test_bad_width(self):
        with self.assertRaises(ValueError):
            squeeze([1], 0)


class HistogramTest(unittest.TestCase):
    def test_counts(self):
        rows = histogram([1, 2, 2, 3, 3, 3, 4, 4, 4, 4, 9], 4)
        self.assertEqual([c for _, _, c in rows], [3, 7, 0, 1])
        self.assertEqual([(lo, hi) for lo, hi, _ in rows], [(1, 3), (3, 5), (5, 7), (7, 9)])

    def test_max_lands_in_the_last_bin(self):
        rows = histogram([0, 10], 5)
        self.assertEqual([c for _, _, c in rows], [1, 0, 0, 0, 1])
        self.assertEqual(rows[-1][1], 10)

    def test_counts_add_up(self):
        values = [i * 0.37 % 5 for i in range(200)]
        self.assertEqual(sum(c for _, _, c in histogram(values, 7)), 200)

    def test_single_value_or_flat(self):
        self.assertEqual(histogram([4, 4, 4], 10), [(4, 4, 3)])

    def test_empty_and_gaps(self):
        self.assertEqual(histogram([], 3), [])
        self.assertEqual(histogram([None], 3), [])
        self.assertEqual(sum(c for *_, c in histogram([1, None, 2], 2)), 2)

    def test_bad_bins(self):
        with self.assertRaises(ValueError):
            histogram([1, 2], 0)


class BarTest(unittest.TestCase):
    def test_full_and_empty(self):
        self.assertEqual(bar(1, 4), "████")
        self.assertEqual(bar(0, 4), "")

    def test_eighths(self):
        self.assertEqual(bar(1 / 32, 4), "▏")
        self.assertEqual(bar(0.5 + 1 / 16, 4), "██▎")  # 2.25 cells
        self.assertEqual(bar(0.625, 4), "██▌")  # 2.5 cells
        self.assertEqual(bar(7 / 8, 1), "▉")

    def test_clamped(self):
        self.assertEqual(bar(2, 3), "███")
        self.assertEqual(bar(-1, 3), "")


class RenderHistogramTest(unittest.TestCase):
    def test_largest_count_fills_the_width(self):
        lines = render_histogram([(0, 1, 2), (1, 2, 4)], width=8)
        self.assertEqual(lines, ["0 – 1 │████ 2", "1 – 2 │████████ 4"])

    def test_labels_are_right_aligned(self):
        lines = render_histogram([(0, 5, 1), (5, 10, 1), (10, 100, 1)], width=2)
        self.assertEqual(lines, [" 0 –   5 │██ 1", " 5 –  10 │██ 1", "10 – 100 │██ 1"])

    def test_zero_count(self):
        self.assertEqual(render_histogram([(0, 1, 0), (1, 2, 1)], width=2)[0], "0 – 1 │ 0")

    def test_float_labels_are_short(self):
        lines = render_histogram([(0.5, 1.25, 1)], width=1)
        self.assertEqual(lines, ["0.5 – 1.25 │█ 1"])

    def test_empty(self):
        self.assertEqual(render_histogram([]), [])


class ParseNumbersTest(unittest.TestCase):
    def test_whitespace_and_commas(self):
        self.assertEqual(parse_numbers("1 2\n3,4 , 5\t6"), [1, 2, 3, 4, 5, 6])

    def test_types(self):
        out = parse_numbers("1 2.5 -3 1e3 +4")
        self.assertEqual(out, [1, 2.5, -3, 1000.0, 4])
        self.assertIsInstance(out[0], int)
        self.assertIsInstance(out[3], float)

    def test_gaps(self):
        self.assertEqual(parse_numbers("1,,3 - nan NaN"), [1, None, 3, None, None, None])

    def test_empty(self):
        self.assertEqual(parse_numbers(""), [])
        self.assertEqual(parse_numbers("  \n "), [])

    def test_bad_token_is_named(self):
        with self.assertRaisesRegex(ValueError, "'abc'"):
            parse_numbers("1 abc")

    def test_infinity_rejected(self):
        with self.assertRaises(ValueError):
            parse_numbers("1 inf")


def run_cli(*args, stdin=""):
    proc = subprocess.run([sys.executable, SCRIPT, *args], input=stdin.encode("utf-8"), capture_output=True)
    # Text-mode stdout writes \r\n on Windows; compare lines, not line endings.
    return (proc.returncode, proc.stdout.decode("utf-8").replace("\r\n", "\n"),
            proc.stderr.decode("utf-8").replace("\r\n", "\n"))


class CliTest(unittest.TestCase):
    def test_arguments(self):
        self.assertEqual(run_cli("1", "5", "2", "8"), (0, "▁▅▂█\n", ""))

    def test_stdin(self):
        self.assertEqual(run_cli(stdin="1,2,,4\n")[1], "▁▃ █\n")

    def test_width(self):
        code, out, _ = run_cli("-w", "4", *map(str, range(100)))
        self.assertEqual((code, out), (0, "▁▃▆█\n"))

    def test_fixed_scale(self):
        self.assertEqual(run_cli("--min", "0", "--max", "10", "5")[1], "▅\n")

    def test_histogram(self):
        code, out, _ = run_cli("--hist", "2", "-w", "4", "1", "2", "3", "10")
        self.assertEqual(code, 0)
        self.assertEqual(out.splitlines(), ["  1 – 5.5 │████ 3", "5.5 –  10 │█▍ 1"])

    def test_bad_number_is_exit_1(self):
        code, out, err = run_cli("1", "x")
        self.assertEqual((code, out), (1, ""))
        self.assertIn("'x'", err)

    def test_no_numbers_is_exit_1(self):
        self.assertEqual(run_cli(stdin="")[0], 1)
        self.assertEqual(run_cli(stdin="- nan")[0], 1)

    def test_usage_errors_are_exit_2(self):
        self.assertEqual(run_cli("-w", "0", "1")[0], 2)
        self.assertEqual(run_cli("--hist", "0", "1")[0], 2)
        self.assertEqual(run_cli("--hist", "100000", "1")[0], 2)
        self.assertEqual(run_cli("--min", "5", "--max", "1", "3")[0], 2)
        self.assertEqual(run_cli("--frobnicate")[0], 2)


if __name__ == "__main__":
    unittest.main()
