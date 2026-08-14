import os
import sys
import unittest
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from logparse import LEVELS, filter_entries, parse_line, parse_lines, summarize  # noqa: E402


class ParseLineTest(unittest.TestCase):
    def test_parses_a_well_formed_line(self):
        entry = parse_line("2026-08-14T10:15:32 ERROR Database connection failed")
        self.assertEqual(entry.timestamp, datetime.fromisoformat("2026-08-14T10:15:32"))
        self.assertEqual(entry.level, "ERROR")
        self.assertEqual(entry.message, "Database connection failed")

    def test_message_may_contain_spaces_and_is_captured_in_full(self):
        entry = parse_line("2026-08-14T10:15:32 INFO server started on port 8080")
        self.assertEqual(entry.message, "server started on port 8080")

    def test_unrecognized_level_returns_none(self):
        self.assertIsNone(parse_line("2026-08-14T10:15:32 TRACE too verbose"))

    def test_malformed_line_returns_none(self):
        self.assertIsNone(parse_line("not a log line at all"))

    def test_bad_timestamp_returns_none(self):
        self.assertIsNone(parse_line("not-a-timestamp ERROR message"))

    def test_blank_line_returns_none(self):
        self.assertIsNone(parse_line(""))
        self.assertIsNone(parse_line("   \n"))


class ParseLinesTest(unittest.TestCase):
    def test_separates_entries_from_unparsed_count(self):
        lines = [
            "2026-08-14T10:00:00 INFO ok\n",
            "garbage line\n",
            "2026-08-14T10:01:00 ERROR boom\n",
        ]
        entries, unparsed = parse_lines(lines)
        self.assertEqual(len(entries), 2)
        self.assertEqual(unparsed, 1)

    def test_blank_lines_are_not_counted_as_unparsed(self):
        lines = ["2026-08-14T10:00:00 INFO ok\n", "\n", "   \n"]
        entries, unparsed = parse_lines(lines)
        self.assertEqual(len(entries), 1)
        self.assertEqual(unparsed, 0)


class FilterEntriesTest(unittest.TestCase):
    def setUp(self):
        lines = [
            "2026-08-14T10:00:00 DEBUG starting up\n",
            "2026-08-14T10:01:00 INFO ready\n",
            "2026-08-14T10:02:00 WARNING disk 80% full\n",
            "2026-08-14T10:03:00 ERROR request failed\n",
            "2026-08-14T10:04:00 CRITICAL out of memory\n",
        ]
        self.entries, _ = parse_lines(lines)

    def test_level_keeps_that_severity_and_above(self):
        result = filter_entries(self.entries, level="WARNING")
        self.assertEqual([e.level for e in result], ["WARNING", "ERROR", "CRITICAL"])

    def test_level_debug_keeps_everything(self):
        result = filter_entries(self.entries, level="DEBUG")
        self.assertEqual(len(result), len(self.entries))

    def test_since_is_an_inclusive_lower_bound(self):
        since = datetime.fromisoformat("2026-08-14T10:02:00")
        result = filter_entries(self.entries, since=since)
        self.assertEqual([e.level for e in result], ["WARNING", "ERROR", "CRITICAL"])

    def test_until_is_an_inclusive_upper_bound(self):
        until = datetime.fromisoformat("2026-08-14T10:01:00")
        result = filter_entries(self.entries, until=until)
        self.assertEqual([e.level for e in result], ["DEBUG", "INFO"])

    def test_level_and_time_range_combine(self):
        since = datetime.fromisoformat("2026-08-14T10:01:00")
        until = datetime.fromisoformat("2026-08-14T10:03:00")
        result = filter_entries(self.entries, level="WARNING", since=since, until=until)
        self.assertEqual([e.level for e in result], ["WARNING", "ERROR"])


class SummarizeTest(unittest.TestCase):
    def test_counts_per_level(self):
        lines = [
            "2026-08-14T10:00:00 INFO a\n",
            "2026-08-14T10:01:00 INFO b\n",
            "2026-08-14T10:02:00 ERROR c\n",
        ]
        entries, _ = parse_lines(lines)
        self.assertEqual(summarize(entries), {"INFO": 2, "ERROR": 1})

    def test_zero_count_levels_are_omitted(self):
        entries, _ = parse_lines(["2026-08-14T10:00:00 DEBUG a\n"])
        counts = summarize(entries)
        self.assertNotIn("CRITICAL", counts)

    def test_order_follows_severity_not_first_seen(self):
        lines = [
            "2026-08-14T10:00:00 ERROR first\n",
            "2026-08-14T10:01:00 DEBUG second\n",
        ]
        entries, _ = parse_lines(lines)
        self.assertEqual(list(summarize(entries).keys()), ["DEBUG", "ERROR"])

    def test_empty_input_returns_empty_summary(self):
        self.assertEqual(summarize([]), {})


class LevelsOrderingTest(unittest.TestCase):
    def test_levels_are_in_ascending_severity_order(self):
        self.assertEqual(LEVELS, ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"])


if __name__ == "__main__":
    unittest.main()
