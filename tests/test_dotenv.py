import json
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import dotenv  # noqa: E402

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "scripts", "dotenv.py")


class ParseTest(unittest.TestCase):
    def test_plain_pairs(self):
        self.assertEqual(dotenv.parse("A=1\nB=two"), {"A": "1", "B": "two"})

    def test_blank_lines_and_comments_are_skipped(self):
        self.assertEqual(dotenv.parse("# hi\n\n  # indented\nA=1\n"), {"A": "1"})

    def test_export_prefix(self):
        self.assertEqual(dotenv.parse("export A=1"), {"A": "1"})

    def test_key_starting_with_export_is_not_a_prefix(self):
        self.assertEqual(dotenv.parse("exported=1"), {"exported": "1"})

    def test_trailing_comment_needs_whitespace_before_hash(self):
        self.assertEqual(dotenv.parse("A=x   # note"), {"A": "x"})
        self.assertEqual(dotenv.parse("A=a#b"), {"A": "a#b"})

    def test_empty_value(self):
        self.assertEqual(dotenv.parse("A=\nB=''"), {"A": "", "B": ""})

    def test_value_may_contain_equals(self):
        self.assertEqual(dotenv.parse("URL=http://x?a=1"), {"URL": "http://x?a=1"})

    def test_double_quotes_keep_hash_and_spaces(self):
        self.assertEqual(dotenv.parse('A="  x # y  "'), {"A": "  x # y  "})

    def test_double_quote_escapes(self):
        self.assertEqual(dotenv.parse(r'A="a\tb\nc\"d\\e"'), {"A": 'a\tb\nc"d\\e'})

    def test_unknown_escape_keeps_backslash(self):
        self.assertEqual(dotenv.parse(r'A="C:\Users\x"'), {"A": r"C:\Users\x"})

    def test_single_quotes_are_literal(self):
        self.assertEqual(dotenv.parse(r"A='a\n${B}'", {"B": "no"}), {"A": r"a\n${B}"})

    def test_comment_after_closing_quote(self):
        self.assertEqual(dotenv.parse('A="x" # why'), {"A": "x"})

    def test_later_definition_wins(self):
        self.assertEqual(dotenv.parse("A=1\nA=2"), {"A": "2"})

    def test_key_order_is_file_order(self):
        self.assertEqual(list(dotenv.parse("B=1\nA=2\nC=3")), ["B", "A", "C"])


class ExpansionTest(unittest.TestCase):
    def test_refers_to_earlier_variable(self):
        got = dotenv.parse('H=db\nURL="pg://${H}/x"')
        self.assertEqual(got["URL"], "pg://db/x")

    def test_unquoted_value_expands_too(self):
        self.assertEqual(dotenv.parse("A=1\nB=${A}${A}")["B"], "11")

    def test_falls_back_to_base_env(self):
        self.assertEqual(dotenv.parse("A=${HOME_X}", {"HOME_X": "/h"}), {"A": "/h"})

    def test_file_beats_base_env(self):
        self.assertEqual(dotenv.parse("A=1\nB=${A}", {"A": "9"})["B"], "1")

    def test_default_used_when_missing_or_empty(self):
        self.assertEqual(dotenv.parse("A=${NOPE:-dflt}"), {"A": "dflt"})
        self.assertEqual(dotenv.parse("E=\nA=${E:-dflt}")["A"], "dflt")

    def test_undefined_without_default_is_empty(self):
        self.assertEqual(dotenv.parse("A=x${NOPE}y"), {"A": "xy"})

    def test_forward_reference_is_not_expanded_from_later_lines(self):
        self.assertEqual(dotenv.parse("A=${B}\nB=1")["A"], "")


class ErrorTest(unittest.TestCase):
    def assert_error(self, text, lineno):
        with self.assertRaises(dotenv.ParseError) as ctx:
            dotenv.parse(text)
        self.assertEqual(ctx.exception.lineno, lineno)

    def test_missing_equals(self):
        self.assert_error("A=1\nJUSTAKEY", 2)

    def test_bad_key(self):
        self.assert_error("1A=x", 1)
        self.assert_error("A B=x", 1)

    def test_unterminated_quotes(self):
        self.assert_error('A="x', 1)
        self.assert_error("ok=1\nA='x", 2)

    def test_junk_after_closing_quote(self):
        self.assert_error('A="x" y', 1)

    def test_error_is_a_value_error(self):
        self.assertTrue(issubclass(dotenv.ParseError, ValueError))


class CliTest(unittest.TestCase):
    def run_cli(self, text, *args):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, ".env")
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(text)
            return subprocess.run([sys.executable, SCRIPT, path, *args],
                                  capture_output=True, text=True)

    def test_prints_key_value_lines(self):
        r = self.run_cli("A=1\nB='x y'\n", "--no-env")
        self.assertEqual((r.returncode, r.stdout), (0, 'A="1"\nB="x y"\n'))

    def test_json_output(self):
        r = self.run_cli("A=1\n", "--json", "--no-env")
        self.assertEqual(json.loads(r.stdout), {"A": "1"})

    def test_process_env_is_used_unless_disabled(self):
        env = dict(os.environ, DOTENV_TEST_VAR="yes")
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, ".env")
            with open(path, "w", encoding="utf-8") as fh:
                fh.write("A=${DOTENV_TEST_VAR}\n")
            with_env = subprocess.run([sys.executable, SCRIPT, path, "--json"],
                                      capture_output=True, text=True, env=env)
            without = subprocess.run([sys.executable, SCRIPT, path, "--json", "--no-env"],
                                     capture_output=True, text=True, env=env)
        self.assertEqual(json.loads(with_env.stdout), {"A": "yes"})
        self.assertEqual(json.loads(without.stdout), {"A": ""})

    def test_parse_error_exits_1_with_line_number(self):
        r = self.run_cli("A=1\nbad\n")
        self.assertEqual(r.returncode, 1)
        self.assertIn("line 2", r.stderr)

    def test_missing_file_exits_2(self):
        r = subprocess.run([sys.executable, SCRIPT, "/no/such/file.env"],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 2)


if __name__ == "__main__":
    unittest.main()
