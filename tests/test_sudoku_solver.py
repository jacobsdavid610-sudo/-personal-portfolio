import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from sudoku_solver import (  # noqa: E402
    parse_grid,
    solve,
    is_valid_grid,
    is_valid_placement,
    format_grid,
)

# A well-known solvable puzzle (0 = blank).
EASY_PUZZLE = (
    "530070000"
    "600195000"
    "098000060"
    "800060003"
    "400803001"
    "700020006"
    "060000280"
    "000419005"
    "000080079"
)

EASY_SOLUTION = (
    "534678912"
    "672195348"
    "198342567"
    "859761423"
    "426853791"
    "713924856"
    "961537284"
    "287419635"
    "345286179"
)

# A grid with two 5s in the same row - unsolvable, contradictory as-is.
INVALID_PUZZLE = (
    "550070000"
    "600195000"
    "098000060"
    "800060003"
    "400803001"
    "700020006"
    "060000280"
    "000419005"
    "000080079"
)


class ParseGridTest(unittest.TestCase):
    def test_parses_dots_and_digits_into_a_9x9_grid(self):
        grid = parse_grid(EASY_PUZZLE)
        self.assertEqual(len(grid), 9)
        self.assertTrue(all(len(row) == 9 for row in grid))
        self.assertEqual(grid[0], [5, 3, 0, 0, 7, 0, 0, 0, 0])

    def test_accepts_a_multiline_grid_with_whitespace(self):
        lines = [EASY_PUZZLE[i:i + 9] for i in range(0, 81, 9)]
        grid = parse_grid("\n".join(lines) + "\n")
        self.assertEqual(grid[0], [5, 3, 0, 0, 7, 0, 0, 0, 0])

    def test_wrong_cell_count_raises_value_error(self):
        with self.assertRaises(ValueError):
            parse_grid("12345")

    def test_unexpected_character_raises_value_error(self):
        with self.assertRaises(ValueError):
            parse_grid("5X0070000600195000098000060800060003400803001700020006060000280000419005000080079")


class ValidationTest(unittest.TestCase):
    def test_valid_partial_grid_passes(self):
        grid = parse_grid(EASY_PUZZLE)
        self.assertTrue(is_valid_grid(grid))

    def test_grid_with_duplicate_in_a_row_is_invalid(self):
        grid = parse_grid(INVALID_PUZZLE)
        self.assertFalse(is_valid_grid(grid))

    def test_is_valid_placement_rejects_row_conflict(self):
        grid = parse_grid(EASY_PUZZLE)
        self.assertFalse(is_valid_placement(grid, 0, 2, 5))  # row already has a 5

    def test_is_valid_placement_rejects_column_conflict(self):
        grid = parse_grid(EASY_PUZZLE)
        self.assertFalse(is_valid_placement(grid, 2, 0, 6))  # column already has a 6

    def test_is_valid_placement_rejects_box_conflict(self):
        grid = parse_grid(EASY_PUZZLE)
        self.assertFalse(is_valid_placement(grid, 2, 2, 3))  # top-left box already has a 3

    def test_is_valid_placement_accepts_a_legal_move(self):
        grid = parse_grid(EASY_PUZZLE)
        self.assertTrue(is_valid_placement(grid, 0, 2, 4))


class SolveTest(unittest.TestCase):
    def test_solves_a_known_puzzle_to_the_known_solution(self):
        grid = parse_grid(EASY_PUZZLE)
        solved = solve(grid)
        self.assertTrue(solved)
        flat = "".join(str(v) for row in grid for v in row)
        self.assertEqual(flat, EASY_SOLUTION)

    def test_solved_grid_satisfies_every_row_column_and_box(self):
        grid = parse_grid(EASY_PUZZLE)
        solve(grid)
        for r in range(9):
            self.assertEqual(sorted(grid[r]), list(range(1, 10)))
        for c in range(9):
            column = [grid[r][c] for r in range(9)]
            self.assertEqual(sorted(column), list(range(1, 10)))

    def test_an_already_solved_grid_returns_true_unchanged(self):
        grid = parse_grid(EASY_SOLUTION)
        self.assertTrue(solve(grid))
        flat = "".join(str(v) for row in grid for v in row)
        self.assertEqual(flat, EASY_SOLUTION)

    def test_a_contradictory_grid_cannot_be_solved(self):
        grid = parse_grid(INVALID_PUZZLE)
        self.assertFalse(solve(grid))


class FormatGridTest(unittest.TestCase):
    def test_format_grid_includes_box_separators(self):
        grid = parse_grid(EASY_SOLUTION)
        text = format_grid(grid)
        self.assertIn("------+-------+------", text)
        self.assertIn("5 3 4", text)


if __name__ == "__main__":
    unittest.main()
