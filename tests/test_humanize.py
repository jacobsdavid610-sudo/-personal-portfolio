import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from humanize import format_bytes, format_duration, parse_bytes, parse_duration  # noqa: E402


class FormatBytesTest(unittest.TestCase):
    def test_under_one_unit_stays_exact(self):
        self.assertEqual(format_bytes(0), "0 B")
        self.assertEqual(format_bytes(1023), "1023 B")

    def test_binary_units(self):
        self.assertEqual(format_bytes(1536), "1.5 KiB")
        self.assertEqual(format_bytes(5 * 1024 ** 3), "5.0 GiB")

    def test_si_units(self):
        self.assertEqual(format_bytes(1500, binary=False), "1.5 kB")
        self.assertEqual(format_bytes(999, binary=False), "999 B")

    def test_rounding_carries_into_next_unit(self):
        # 1048575 B = 1023.999 KiB; must not print "1024.0 KiB"
        self.assertEqual(format_bytes(1024 ** 2 - 1), "1.0 MiB")
        self.assertEqual(format_bytes(999_999, binary=False), "1.0 MB")

    def test_precision(self):
        self.assertEqual(format_bytes(1234567, precision=3), "1.177 MiB")

    def test_caps_at_largest_unit(self):
        self.assertEqual(format_bytes(2048 * 1024 ** 6), "2048.0 EiB")

    def test_rejects_negative_float_and_bool(self):
        for bad in (-1, 1.5, True, "10"):
            with self.assertRaises(ValueError):
                format_bytes(bad)


class ParseBytesTest(unittest.TestCase):
    def test_suffix_variants(self):
        self.assertEqual(parse_bytes("512"), 512)
        self.assertEqual(parse_bytes("512B"), 512)
        self.assertEqual(parse_bytes("1.5 KiB"), 1536)
        self.assertEqual(parse_bytes("10MB"), 10_000_000)
        self.assertEqual(parse_bytes("2gib"), 2 * 1024 ** 3)

    def test_bare_letter_means_binary_like_du(self):
        self.assertEqual(parse_bytes("4k"), 4096)
        self.assertEqual(parse_bytes("1G"), 1024 ** 3)

    def test_decimal_math_is_exact(self):
        self.assertEqual(parse_bytes("0.1 GB"), 100_000_000)
        self.assertEqual(parse_bytes(".5KiB"), 512)

    def test_round_trips_with_format(self):
        for n in (0, 1, 1024, 1536, 3 * 1024 ** 4):
            self.assertEqual(parse_bytes(format_bytes(n)), n)

    def test_rejects_garbage(self):
        for bad in ("", "abc", "-5 MB", "1.5 XB", "1.5 B", "1,000", "1.2.3k", None):
            with self.assertRaises(ValueError, msg=repr(bad)):
                parse_bytes(bad)


class FormatDurationTest(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(format_duration(0), "0s")
        self.assertEqual(format_duration(59), "59s")
        self.assertEqual(format_duration(9005), "2h 30m 5s")
        self.assertEqual(format_duration(90061), "1d 1h 1m 1s")

    def test_zero_parts_are_skipped(self):
        self.assertEqual(format_duration(3605), "1h 5s")
        self.assertEqual(format_duration(86400), "1d")

    def test_max_units_truncates_instead_of_rounding(self):
        self.assertEqual(format_duration(7199, max_units=2), "1h 59m")
        self.assertEqual(format_duration(7199, max_units=1), "1h")

    def test_sub_second(self):
        self.assertEqual(format_duration(0.25), "250ms")
        self.assertEqual(format_duration(1.9), "1s")

    def test_rejects_bad_input(self):
        for bad in (-1, float("inf"), float("nan"), "soon"):
            with self.assertRaises(ValueError, msg=repr(bad)):
                format_duration(bad)


class ParseDurationTest(unittest.TestCase):
    def test_compound_and_separators(self):
        self.assertEqual(parse_duration("1h30m"), 5400)
        self.assertEqual(parse_duration("2d 4h"), 187200)
        self.assertEqual(parse_duration("1h, 2m, 3s"), 3723)

    def test_fractional_ms_and_weeks(self):
        self.assertEqual(parse_duration("1.5h"), 5400)
        self.assertEqual(parse_duration("250ms"), 0.25)
        self.assertEqual(parse_duration("1w"), 604800)

    def test_ms_is_not_read_as_minutes_plus_seconds(self):
        self.assertEqual(parse_duration("5ms"), 0.005)
        self.assertEqual(parse_duration("5m5s"), 305)

    def test_case_insensitive(self):
        self.assertEqual(parse_duration("1H 30M"), 5400)

    def test_round_trips_with_format(self):
        for s in (1, 59, 3605, 9005, 90061):
            self.assertEqual(parse_duration(format_duration(s)), s)

    def test_rejects_trailing_garbage_instead_of_half_parsing(self):
        for bad in ("", "   ", "5", "5x", "1h banana", "h", "1 hour", None):
            with self.assertRaises(ValueError, msg=repr(bad)):
                parse_duration(bad)


if __name__ == "__main__":
    unittest.main()
