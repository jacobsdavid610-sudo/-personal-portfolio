import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from ini_parser import IniParseError, dump, parse  # noqa: E402


class ParseTest(unittest.TestCase):
    def test_basic_section_and_keys(self):
        text = "[server]\nhost = localhost\nport = 8080\n"
        self.assertEqual(parse(text), {"": {}, "server": {"host": "localhost", "port": "8080"}})

    def test_keys_before_any_section_go_under_empty_string_section(self):
        text = "debug = true\n[server]\nhost = localhost\n"
        result = parse(text)
        self.assertEqual(result[""], {"debug": "true"})
        self.assertEqual(result["server"], {"host": "localhost"})

    def test_full_line_comments_are_ignored(self):
        text = "; this is a comment\n# so is this\n[server]\nhost = localhost\n"
        self.assertEqual(parse(text)["server"], {"host": "localhost"})

    def test_trailing_comment_after_whitespace_is_stripped(self):
        text = "[server]\nhost = localhost ; the dev box\n"
        self.assertEqual(parse(text)["server"]["host"], "localhost")

    def test_comment_marker_inside_value_with_no_preceding_space_survives(self):
        text = "[server]\nurl = http://example.com#fragment\n"
        self.assertEqual(parse(text)["server"]["url"], "http://example.com#fragment")

    def test_quoted_values_have_quotes_stripped(self):
        text = '[app]\nname = "hello world"\ntag = \'released\'\n'
        result = parse(text)
        self.assertEqual(result["app"]["name"], "hello world")
        self.assertEqual(result["app"]["tag"], "released")

    def test_blank_lines_are_ignored(self):
        text = "[server]\n\nhost = localhost\n\n\nport = 8080\n"
        self.assertEqual(parse(text)["server"], {"host": "localhost", "port": "8080"})

    def test_later_key_in_same_section_overwrites_earlier(self):
        text = "[server]\nhost = a\nhost = b\n"
        self.assertEqual(parse(text)["server"]["host"], "b")

    def test_repeated_section_header_merges_into_the_same_dict(self):
        text = "[server]\nhost = localhost\n[db]\nname = mydb\n[server]\nport = 8080\n"
        result = parse(text)
        self.assertEqual(result["server"], {"host": "localhost", "port": "8080"})

    def test_empty_input_returns_only_the_empty_section(self):
        self.assertEqual(parse(""), {"": {}})

    def test_malformed_line_raises_with_line_number(self):
        text = "[server]\nhost = localhost\nnot a valid line at all\n"
        with self.assertRaises(IniParseError) as ctx:
            parse(text)
        self.assertIn("line 3", str(ctx.exception))

    def test_colon_is_also_accepted_as_a_separator(self):
        text = "[server]\nhost: localhost\n"
        self.assertEqual(parse(text)["server"]["host"], "localhost")


class DumpTest(unittest.TestCase):
    def test_dump_basic_section(self):
        sections = {"": {}, "server": {"host": "localhost", "port": "8080"}}
        text = dump(sections)
        self.assertIn("[server]", text)
        self.assertIn("host = localhost", text)
        self.assertIn("port = 8080", text)

    def test_dump_empty_section_writes_first_unquoted(self):
        sections = {"": {"debug": "true"}, "server": {"host": "localhost"}}
        text = dump(sections)
        self.assertTrue(text.startswith("debug = true"))
        self.assertLess(text.index("debug = true"), text.index("[server]"))

    def test_dump_with_no_data_returns_empty_string(self):
        self.assertEqual(dump({"": {}}), "")

    def test_round_trip_for_simple_values(self):
        original = {"": {"debug": "true"}, "server": {"host": "localhost", "port": "8080"}}
        self.assertEqual(parse(dump(original)), original)


if __name__ == "__main__":
    unittest.main()
