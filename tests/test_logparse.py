import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from logparse import parse_line, analyze, format_report  # noqa: E402

SAMPLE_LINES = [
    '10.0.0.1 - - [10/Oct/2023:13:55:36 -0700] "GET /index.html HTTP/1.1" 200 2326 "-" "curl/7.68.0"',
    '10.0.0.2 - - [10/Oct/2023:13:55:37 -0700] "GET /index.html HTTP/1.1" 200 2326 "-" "curl/7.68.0"',
    '10.0.0.1 - - [10/Oct/2023:13:55:38 -0700] "GET /missing.html HTTP/1.1" 404 512 "-" "curl/7.68.0"',
    '10.0.0.3 - - [10/Oct/2023:13:55:39 -0700] "POST /api/login HTTP/1.1" 500 0 "-" "curl/7.68.0"',
    'this is not a valid log line at all',
    '10.0.0.1 - - [10/Oct/2023:13:55:40 -0700] "GET /index.html HTTP/1.1" 200 1000 "-" "curl/7.68.0"',
]


class ParseLineTest(unittest.TestCase):
    def test_parses_a_well_formed_line(self):
        entry = parse_line(SAMPLE_LINES[0])
        self.assertEqual(entry["ip"], "10.0.0.1")
        self.assertEqual(entry["method"], "GET")
        self.assertEqual(entry["path"], "/index.html")
        self.assertEqual(entry["status"], 200)
        self.assertEqual(entry["bytes"], 2326)

    def test_dash_byte_count_becomes_zero(self):
        entry = parse_line(SAMPLE_LINES[3])
        self.assertEqual(entry["bytes"], 0)

    def test_malformed_line_returns_none(self):
        self.assertIsNone(parse_line(SAMPLE_LINES[4]))

    def test_empty_line_returns_none(self):
        self.assertIsNone(parse_line(""))


class AnalyzeTest(unittest.TestCase):
    def setUp(self):
        self.stats = analyze(SAMPLE_LINES)

    def test_counts_total_and_matched_lines(self):
        self.assertEqual(self.stats.total_lines, 6)
        self.assertEqual(self.stats.matched, 5)
        self.assertEqual(self.stats.unmatched, 1)

    def test_status_code_counts(self):
        self.assertEqual(self.stats.status_counts[200], 3)
        self.assertEqual(self.stats.status_counts[404], 1)
        self.assertEqual(self.stats.status_counts[500], 1)

    def test_ip_counts(self):
        self.assertEqual(self.stats.ip_counts["10.0.0.1"], 3)
        self.assertEqual(self.stats.ip_counts["10.0.0.2"], 1)
        self.assertEqual(self.stats.ip_counts["10.0.0.3"], 1)

    def test_path_counts(self):
        self.assertEqual(self.stats.path_counts["/index.html"], 3)
        self.assertEqual(self.stats.path_counts["/missing.html"], 1)

    def test_total_bytes_sums_only_matched_lines_and_treats_dash_as_zero(self):
        self.assertEqual(self.stats.total_bytes, 2326 + 2326 + 512 + 0 + 1000)

    def test_empty_input(self):
        stats = analyze([])
        self.assertEqual(stats.total_lines, 0)
        self.assertEqual(stats.matched, 0)
        self.assertEqual(stats.total_bytes, 0)


class FormatReportTest(unittest.TestCase):
    def test_report_contains_key_sections_and_top_ip(self):
        stats = analyze(SAMPLE_LINES)
        report = format_report(stats, top_n=2)
        self.assertIn("Lines: 6 total, 5 parsed, 1 skipped", report)
        self.assertIn("Total bytes transferred: 6164", report)
        self.assertIn("200: 3", report)
        self.assertIn("     3  10.0.0.1", report)
        self.assertIn("     3  /index.html", report)

    def test_top_n_limits_ip_and_path_sections(self):
        stats = analyze(SAMPLE_LINES)
        report = format_report(stats, top_n=1)
        lines = report.splitlines()
        start = lines.index("Top 1 client IPs:") + 1
        end = lines.index("Top 1 paths:") - 1
        ip_section = [l for l in lines[start:end] if l.strip()]
        self.assertEqual(len(ip_section), 1)
        self.assertIn("10.0.0.1", ip_section[0])


if __name__ == "__main__":
    unittest.main()
