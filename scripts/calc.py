#!/usr/bin/env python3
"""Recursive-descent arithmetic expression evaluator. Supports
+ - * / ** parentheses and unary +/-, with standard precedence. Pure
stdlib - a real tokenizer/parser/evaluator, not just eval()."""

import argparse
import re
import sys

TOKEN_RE = re.compile(r"\s*(\*\*|[()+\-*/]|\d+\.\d+|\d+)")


class ParseError(Exception):
    pass


def tokenize(text):
    tokens = []
    pos = 0
    while pos < len(text):
        match = TOKEN_RE.match(text, pos)
        if not match:
            if text[pos:].strip() == "":
                break
            raise ParseError(f"Unexpected character at position {pos}: {text[pos:]!r}")
        tokens.append(match.group(1))
        pos = match.end()
    return tokens


class Parser:
    """Grammar (lowest to highest precedence):
    expr   := term (('+' | '-') term)*
    term   := factor (('*' | '/') factor)*
    factor := ('+' | '-') factor | power
    power  := atom ('**' factor)?      (right-associative; exponent may be unary)
    atom   := NUMBER | '(' expr ')'
    """

    def __init__(self, tokens):
        self.tokens = tokens
        self.pos = 0

    def peek(self):
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def advance(self):
        token = self.peek()
        self.pos += 1
        return token

    def expect(self, token):
        if self.peek() != token:
            raise ParseError(f"Expected {token!r}, got {self.peek()!r}")
        self.advance()

    def parse(self):
        result = self.expr()
        if self.pos != len(self.tokens):
            raise ParseError(f"Unexpected trailing tokens: {self.tokens[self.pos:]}")
        return result

    def expr(self):
        value = self.term()
        while self.peek() in ("+", "-"):
            op = self.advance()
            rhs = self.term()
            value = value + rhs if op == "+" else value - rhs
        return value

    def term(self):
        value = self.factor()
        while self.peek() in ("*", "/"):
            op = self.advance()
            rhs = self.factor()
            if op == "/":
                if rhs == 0:
                    raise ZeroDivisionError("division by zero")
                value = value / rhs
            else:
                value = value * rhs
        return value

    def factor(self):
        # Unary +/- binds *looser* than **, so -2 ** 2 == -(2 ** 2) == -4,
        # matching standard math convention (and Python itself). The base
        # of ** goes straight to power()/atom(), not back through factor().
        if self.peek() == "-":
            self.advance()
            return -self.factor()
        if self.peek() == "+":
            self.advance()
            return self.factor()
        return self.power()

    def power(self):
        value = self.atom()
        if self.peek() == "**":
            self.advance()
            rhs = self.factor()  # right-associative; exponent may be unary
            value = value**rhs
        return value

    def atom(self):
        token = self.peek()
        if token == "(":
            self.advance()
            value = self.expr()
            self.expect(")")
            return value
        if token is None:
            raise ParseError("Unexpected end of expression")
        self.advance()
        return float(token) if "." in token else int(token)


def evaluate(text):
    tokens = tokenize(text)
    if not tokens:
        raise ParseError("Empty expression")
    return Parser(tokens).parse()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("expression")
    args = parser.parse_args()

    try:
        print(evaluate(args.expression))
    except (ParseError, ZeroDivisionError) as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
