# polynomial.py

Single-variable polynomial arithmetic: add, subtract, multiply, evaluate
(via Horner's method), and differentiate. Pure stdlib, no dependencies.

## Why

A from-scratch `Polynomial` class is a good test of getting a handful of
classic small-but-easy-to-get-wrong details right at once: trimming
trailing zero coefficients so degree stays meaningful, evaluating
efficiently (Horner's method — `O(n)` multiplications instead of naively
recomputing `x**power` for every term), and formatting signs/coefficient-1
cleanly in the string representation.

## Usage

```python
from polynomial import Polynomial

p = Polynomial([1, 2, 3])  # 1 + 2x + 3x^2, lowest-degree-first
q = Polynomial([1, 1])     # 1 + x

p + q          # Polynomial([2, 3, 3])
p * q          # Polynomial([1, 3, 5, 3])
p(2)           # 17  (evaluated at x=2)
p.derivative()  # Polynomial([2, 6]) -> "6x + 2"
str(p)          # "3x^2 + 2x + 1"
```

As a CLI:

```
polynomial.py <coeffs> [--eval X] [--derivative]
```

## Example

```
$ polynomial.py "1,2,3"
3x^2 + 2x + 1

$ polynomial.py "1,2,3" --eval 2
17.0

$ polynomial.py "1,2,3" --derivative
6x + 2

$ polynomial.py "1,-2,3"
3x^2 - 2x + 1
```

## Exit codes

- `0` — success.
- `2` — a coefficient token couldn't be parsed as a number, via
  `argparse.error`.

## Design notes

- Coefficients are stored lowest-degree-first (`coeffs[i]` is the
  coefficient of `x^i`) and trailing zeros are trimmed on every
  construction — so `degree` always reflects the true highest non-zero
  term, and `Polynomial([1, 2, 0, 0]) == Polynomial([1, 2])` (both reduce
  to the same trimmed `coeffs`, which is what `__eq__` compares).
- `__call__` evaluates via Horner's method (`((c_n*x + c_{n-1})*x + ... )
  *x + c_0`), the standard way to evaluate a polynomial in the fewest
  multiplications — `n` instead of the `O(n^2)` you'd get from naively
  computing `x**i` from scratch for each term.
- String formatting special-cases coefficient `1` (printed as `x`, not
  `1x`) and a negative term (printed as `- 3x` instead of `+ -3x`), and
  the zero polynomial prints as `"0"` rather than an empty string.

## Running the tests

```
python -m unittest tests.test_polynomial -v
```

26 tests across construction (trailing-zero trimming, the all-zero and
empty-input cases, degree tracking), arithmetic (addition, a resulting
zero leading term getting trimmed, subtraction, a polynomial minus itself,
multiplication, multiplication by zero, degree being the sum of the two
factors' degrees), evaluation (Horner's method against a hand-computed
value, at zero, and at a negative point), derivatives (a quadratic, a
constant's derivative being zero, a second derivative), string formatting
(multi-term, a negative middle term, the zero polynomial, coefficient-1
omission), and coefficient-string parsing (comma-separated,
space-separated with extra whitespace, floats, empty input, and an
invalid token).
