import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from polynomial import Polynomial, parse_coeffs  # noqa: E402


class ConstructionTest(unittest.TestCase):
    def test_trims_trailing_zero_coefficients(self):
        p = Polynomial([1, 2, 0, 0])
        self.assertEqual(p.coeffs, [1, 2])

    def test_all_zero_reduces_to_a_single_zero_coefficient(self):
        p = Polynomial([0, 0, 0])
        self.assertEqual(p.coeffs, [0])

    def test_empty_input_is_the_zero_polynomial(self):
        p = Polynomial([])
        self.assertEqual(p.coeffs, [0])

    def test_degree_reflects_the_highest_nonzero_term(self):
        self.assertEqual(Polynomial([1, 2, 3]).degree, 2)
        self.assertEqual(Polynomial([5]).degree, 0)
        self.assertEqual(Polynomial([0]).degree, 0)


class ArithmeticTest(unittest.TestCase):
    def test_addition(self):
        a = Polynomial([1, 2, 3])   # 1 + 2x + 3x^2
        b = Polynomial([4, 5])      # 4 + 5x
        self.assertEqual((a + b).coeffs, [5, 7, 3])

    def test_addition_trims_a_resulting_zero_leading_term(self):
        a = Polynomial([1, 2, 3])
        b = Polynomial([0, 0, -3])
        self.assertEqual((a + b).coeffs, [1, 2])

    def test_subtraction(self):
        a = Polynomial([5, 7, 3])
        b = Polynomial([1, 2, 3])
        self.assertEqual((a - b).coeffs, [4, 5])

    def test_subtracting_a_polynomial_from_itself_is_zero(self):
        a = Polynomial([1, 2, 3])
        self.assertEqual(a - a, Polynomial([0]))

    def test_multiplication(self):
        # (1 + x) * (1 - x) = 1 - x^2
        a = Polynomial([1, 1])
        b = Polynomial([1, -1])
        self.assertEqual((a * b).coeffs, [1, 0, -1])

    def test_multiplication_by_zero_polynomial_is_zero(self):
        a = Polynomial([1, 2, 3])
        self.assertEqual((a * Polynomial([0])), Polynomial([0]))

    def test_multiplication_degree_is_the_sum_of_degrees(self):
        a = Polynomial([1, 2])   # degree 1
        b = Polynomial([1, 2, 3])  # degree 2
        self.assertEqual((a * b).degree, 3)


class EvaluationTest(unittest.TestCase):
    def test_evaluates_at_a_point_via_horner(self):
        # 1 + 2x + 3x^2 at x=2 -> 1 + 4 + 12 = 17
        p = Polynomial([1, 2, 3])
        self.assertEqual(p(2), 17)

    def test_evaluates_at_zero_returns_the_constant_term(self):
        p = Polynomial([7, 2, 3])
        self.assertEqual(p(0), 7)

    def test_evaluates_at_a_negative_point(self):
        # 1 + 2x at x=-3 -> 1 - 6 = -5
        p = Polynomial([1, 2])
        self.assertEqual(p(-3), -5)


class DerivativeTest(unittest.TestCase):
    def test_derivative_of_a_quadratic(self):
        # d/dx (1 + 2x + 3x^2) = 2 + 6x
        p = Polynomial([1, 2, 3])
        self.assertEqual(p.derivative().coeffs, [2, 6])

    def test_derivative_of_a_constant_is_zero(self):
        p = Polynomial([5])
        self.assertEqual(p.derivative(), Polynomial([0]))

    def test_second_derivative(self):
        # d^2/dx^2 (1 + 2x + 3x^2) = 6
        p = Polynomial([1, 2, 3])
        self.assertEqual(p.derivative().derivative().coeffs, [6])


class StringFormattingTest(unittest.TestCase):
    def test_formats_a_multi_term_polynomial(self):
        p = Polynomial([1, 2, 3])
        self.assertEqual(str(p), "3x^2 + 2x + 1")

    def test_formats_a_negative_middle_term_with_a_minus_sign(self):
        p = Polynomial([1, -2, 3])
        self.assertEqual(str(p), "3x^2 - 2x + 1")

    def test_formats_the_zero_polynomial_as_0(self):
        self.assertEqual(str(Polynomial([0])), "0")

    def test_omits_coefficient_1_on_x_and_x_to_a_power(self):
        p = Polynomial([0, 1, 1])
        self.assertEqual(str(p), "x^2 + x")


class ParseCoeffsTest(unittest.TestCase):
    def test_parses_comma_separated_integers(self):
        self.assertEqual(parse_coeffs("1,2,3"), [1, 2, 3])

    def test_parses_space_separated_with_extra_whitespace(self):
        self.assertEqual(parse_coeffs(" 1  2   3 "), [1, 2, 3])

    def test_parses_floats(self):
        self.assertEqual(parse_coeffs("1.5,2"), [1.5, 2])

    def test_empty_input_raises_value_error(self):
        with self.assertRaises(ValueError):
            parse_coeffs("")

    def test_invalid_token_raises_value_error(self):
        with self.assertRaises(ValueError):
            parse_coeffs("1,x,3")


if __name__ == "__main__":
    unittest.main()
