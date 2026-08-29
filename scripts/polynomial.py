#!/usr/bin/env python3
"""Single-variable polynomial arithmetic: add, subtract, multiply,
evaluate, and differentiate. Pure stdlib, no dependencies."""

import argparse
import re


class Polynomial:
    """Coefficients stored lowest-degree-first: Polynomial([1, 0, 3])
    represents 1 + 0x + 3x^2. Trailing zero coefficients are trimmed so
    the degree always reflects the true highest non-zero term."""

    def __init__(self, coeffs):
        coeffs = list(coeffs) if coeffs else [0]
        while len(coeffs) > 1 and coeffs[-1] == 0:
            coeffs.pop()
        self.coeffs = coeffs

    @property
    def degree(self):
        if self.coeffs == [0]:
            return 0
        return len(self.coeffs) - 1

    def __eq__(self, other):
        return isinstance(other, Polynomial) and self.coeffs == other.coeffs

    def __add__(self, other):
        a, b = self.coeffs, other.coeffs
        length = max(len(a), len(b))
        a = a + [0] * (length - len(a))
        b = b + [0] * (length - len(b))
        return Polynomial([x + y for x, y in zip(a, b)])

    def __sub__(self, other):
        return self + Polynomial([-c for c in other.coeffs])

    def __mul__(self, other):
        result = [0] * (len(self.coeffs) + len(other.coeffs) - 1)
        for i, a in enumerate(self.coeffs):
            for j, b in enumerate(other.coeffs):
                result[i + j] += a * b
        return Polynomial(result)

    def __call__(self, x):
        """Evaluates the polynomial at x via Horner's method."""
        result = 0
        for coeff in reversed(self.coeffs):
            result = result * x + coeff
        return result

    def derivative(self):
        if self.degree == 0:
            return Polynomial([0])
        return Polynomial([i * c for i, c in enumerate(self.coeffs)][1:])

    def __repr__(self):
        return f"Polynomial({self.coeffs!r})"

    def __str__(self):
        terms = []
        for power in range(len(self.coeffs) - 1, -1, -1):
            c = self.coeffs[power]
            if c == 0 and self.degree != 0:
                continue
            if power == 0:
                term = f"{c}"
            elif power == 1:
                term = f"{c}x" if c != 1 else "x"
            else:
                term = f"{c}x^{power}" if c != 1 else f"x^{power}"
            terms.append(term)
        if not terms:
            return "0"
        text = terms[0]
        for term in terms[1:]:
            if term.startswith("-"):
                text += f" - {term[1:]}"
            else:
                text += f" + {term}"
        return text


def parse_coeffs(text):
    """Parses a comma/space-separated list of numbers, lowest degree
    first, e.g. "1, 0, 3" -> [1, 0, 3]."""
    parts = re.split(r"[,\s]+", text.strip())
    parts = [p for p in parts if p]
    if not parts:
        raise ValueError("No coefficients given")
    try:
        return [float(p) if "." in p else int(p) for p in parts]
    except ValueError as e:
        raise ValueError(f"Invalid coefficient in {text!r}: {e}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("coeffs", help='Coefficients lowest-degree-first, e.g. "1,0,3"')
    parser.add_argument("--eval", type=float, help="Evaluate the polynomial at this x")
    parser.add_argument("--derivative", action="store_true", help="Print the derivative instead")
    args = parser.parse_args()

    try:
        p = Polynomial(parse_coeffs(args.coeffs))
    except ValueError as e:
        parser.error(str(e))
        return

    if args.derivative:
        print(p.derivative())
    elif args.eval is not None:
        print(p(args.eval))
    else:
        print(p)


if __name__ == "__main__":
    main()
