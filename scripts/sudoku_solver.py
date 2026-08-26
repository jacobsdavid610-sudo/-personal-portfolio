#!/usr/bin/env python3
"""Solve a 9x9 Sudoku puzzle via backtracking with constraint checking.
Pure stdlib. Reads an 81-character string (or a 9-line grid) using '.' or
'0' for blanks."""

import argparse
import sys

SIZE = 9
BOX = 3


def parse_grid(text):
    """Parses puzzle text into a 9x9 list of ints (0 = blank). Accepts
    either an 81-character single line or 9 lines of 9 characters."""
    digits = []
    for ch in text:
        if ch in ".0":
            digits.append(0)
        elif ch.isdigit():
            digits.append(int(ch))
        elif ch.isspace():
            continue
        else:
            raise ValueError(f"Unexpected character in puzzle: {ch!r}")

    if len(digits) != SIZE * SIZE:
        raise ValueError(f"Expected {SIZE * SIZE} cells, got {len(digits)}")

    return [digits[r * SIZE:(r + 1) * SIZE] for r in range(SIZE)]


def is_valid_placement(grid, row, col, value):
    for i in range(SIZE):
        if grid[row][i] == value or grid[i][col] == value:
            return False

    box_row, box_col = (row // BOX) * BOX, (col // BOX) * BOX
    for r in range(box_row, box_row + BOX):
        for c in range(box_col, box_col + BOX):
            if grid[r][c] == value:
                return False

    return True


def find_blank(grid):
    for r in range(SIZE):
        for c in range(SIZE):
            if grid[r][c] == 0:
                return r, c
    return None


def solve(grid):
    """Solves `grid` in place via backtracking. Returns True if solved,
    False if the puzzle has no solution (grid is left partially mutated
    on failure - callers should pass a copy if the original matters)."""
    blank = find_blank(grid)
    if blank is None:
        return True

    row, col = blank
    for value in range(1, SIZE + 1):
        if is_valid_placement(grid, row, col, value):
            grid[row][col] = value
            if solve(grid):
                return True
            grid[row][col] = 0

    return False


def is_valid_grid(grid):
    """Checks that a (possibly partially filled) grid has no duplicate
    non-zero values in any row, column, or box - i.e. it's not already
    contradictory before solving even starts."""
    for r in range(SIZE):
        seen = set()
        for c in range(SIZE):
            v = grid[r][c]
            if v != 0:
                if v in seen:
                    return False
                seen.add(v)

    for c in range(SIZE):
        seen = set()
        for r in range(SIZE):
            v = grid[r][c]
            if v != 0:
                if v in seen:
                    return False
                seen.add(v)

    for box_row in range(0, SIZE, BOX):
        for box_col in range(0, SIZE, BOX):
            seen = set()
            for r in range(box_row, box_row + BOX):
                for c in range(box_col, box_col + BOX):
                    v = grid[r][c]
                    if v != 0:
                        if v in seen:
                            return False
                        seen.add(v)

    return True


def format_grid(grid):
    lines = []
    for r in range(SIZE):
        if r != 0 and r % BOX == 0:
            lines.append("------+-------+------")
        row_cells = []
        for c in range(SIZE):
            if c != 0 and c % BOX == 0:
                row_cells.append("|")
            row_cells.append(str(grid[r][c]))
        lines.append(" ".join(row_cells))
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", nargs="?", help="Puzzle file (default: stdin)")
    args = parser.parse_args()

    text = open(args.file, encoding="utf-8").read() if args.file else sys.stdin.read()

    try:
        grid = parse_grid(text)
    except ValueError as e:
        parser.error(str(e))
        return

    if not is_valid_grid(grid):
        print("Invalid puzzle: conflicting values already present.", file=sys.stderr)
        sys.exit(1)

    if solve(grid):
        print(format_grid(grid))
    else:
        print("No solution exists for this puzzle.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
