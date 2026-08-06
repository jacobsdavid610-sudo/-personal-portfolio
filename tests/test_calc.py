import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from calc import ParseError, evaluate  # noqa: E402


class EvaluateTest(unittest.TestCase):
    def test_single_number(self):
        self.assertEqual(evaluate("42"), 42)

    def test_basic_arithmetic(self):
        self.assertEqual(evaluate("2 + 3"), 5)
        self.assertEqual(evaluate("10 - 4"), 6)
        self.assertEqual(evaluate("6 * 7"), 42)
        self.assertEqual(evaluate("10 / 4"), 2.5)

    def test_operator_precedence(self):
        self.assertEqual(evaluate("2 + 3 * 4"), 14)
        self.assertEqual(evaluate("2 * 3 + 4"), 10)

    def test_parentheses_override_precedence(self):
        self.assertEqual(evaluate("(2 + 3) * 4"), 20)

    def test_nested_parentheses(self):
        self.assertEqual(evaluate("((1 + 2) * (3 + 4))"), 21)

    def test_unary_minus(self):
        self.assertEqual(evaluate("-5 + 3"), -2)
        self.assertEqual(evaluate("3 - -5"), 8)

    def test_unary_plus(self):
        self.assertEqual(evaluate("+5"), 5)

    def test_power_is_right_associative(self):
        # 2 ** (3 ** 2) = 2 ** 9 = 512, not (2 ** 3) ** 2 = 64
        self.assertEqual(evaluate("2 ** 3 ** 2"), 512)

    def test_power_binds_tighter_than_unary_minus(self):
        # Standard math convention: -2 ** 2 == -(2 ** 2) == -4
        self.assertEqual(evaluate("-2 ** 2"), -4)

    def test_float_literals(self):
        self.assertEqual(evaluate("1.5 + 2.5"), 4.0)

    def test_division_by_zero_raises(self):
        with self.assertRaises(ZeroDivisionError):
            evaluate("1 / 0")

    def test_unbalanced_parens_raises(self):
        with self.assertRaises(ParseError):
            evaluate("(1 + 2")

    def test_trailing_garbage_raises(self):
        with self.assertRaises(ParseError):
            evaluate("1 + 2 3")

    def test_empty_expression_raises(self):
        with self.assertRaises(ParseError):
            evaluate("")

    def test_invalid_character_raises(self):
        with self.assertRaises(ParseError):
            evaluate("2 + @")


if __name__ == "__main__":
    unittest.main()
