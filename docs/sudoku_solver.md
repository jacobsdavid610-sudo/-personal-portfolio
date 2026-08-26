# sudoku_solver.py

Solves a 9x9 Sudoku puzzle via backtracking: try a legal value in the
first blank cell, recurse, undo and try the next value if that path dead-
ends. Pure stdlib, no dependencies.

## Why

A genuinely different kind of exercise from the rest of this repo's
utilities — constraint satisfaction via backtracking search, rather than a
parser or a data-transform pipeline. It's also a good test of getting the
recursion's undo step right: forgetting to reset a cell after a failed
branch is the classic bug in every from-scratch backtracking solver, so
the test suite checks the solved grid is fully valid (every row, column,
and box a permutation of 1-9), not just that `solve()` returned `True`.

## Usage

```
sudoku_solver.py [file]
```

Reads the puzzle from `file`, or from stdin if omitted. Accepts either an
81-character string or a 9-line grid; `.` or `0` marks a blank cell,
whitespace is ignored either way.

## Example

```
$ cat puzzle.txt
53..7....
6..195...
.98....6.
8...6...3
4..8.3..1
7...2...6
.6....28.
...419..5
....8..79

$ sudoku_solver.py puzzle.txt
5 3 4 | 6 7 8 | 9 1 2
6 7 2 | 1 9 5 | 3 4 8
1 9 8 | 3 4 2 | 5 6 7
------+-------+------
8 5 9 | 7 6 1 | 4 2 3
4 2 6 | 8 5 3 | 7 9 1
7 1 3 | 9 2 4 | 8 5 6
------+-------+------
9 6 1 | 5 3 7 | 2 8 4
2 8 7 | 4 1 9 | 6 3 5
3 4 5 | 2 8 6 | 1 7 9
```

## Exit codes

- `0` — solved; the solution is printed.
- `1` — the given puzzle already has a contradiction (a duplicate value
  in some row/column/box before solving even starts), or has no solution
  at all. Reported to stderr.
- `2` — malformed input: wrong cell count, or a character that isn't a
  digit, `.`, or whitespace (via `argparse.error`).

## Design notes

- Contradictory input is checked *before* attempting to solve
  (`is_valid_grid`), separately from "the puzzle is valid but has no
  solution" — a puzzle with two `5`s already in one row would otherwise
  just search forever/uselessly through a space that can never succeed,
  instead of failing immediately with a clearer message.
- No cell-ordering heuristic (like picking the blank with the fewest legal
  candidates first) — plain first-blank-cell backtracking is fast enough
  for a standard 9x9 puzzle, and staying with the simplest correct version
  keeps the recursion easy to verify by reading it.
- `solve()` mutates its argument in place and returns a boolean rather
  than returning a new grid, matching how in-place backtracking is
  normally written — callers who need to keep the original get an
  unsolved puzzle back on failure, since backtracking necessarily leaves
  partial attempts behind as it unwinds.

## Running the tests

```
python -m unittest tests.test_sudoku_solver -v
```

15 tests: parsing both the single-line and multi-line grid formats,
rejecting a wrong cell count and an unexpected character, `is_valid_grid`
accepting a legal partial puzzle and rejecting one with a duplicate,
`is_valid_placement` catching row/column/box conflicts individually and
accepting a legal move, solving a known puzzle to its known correct
solution, confirming the solved grid is a fully valid Sudoku (every row,
column, and box a permutation of 1-9 — not just "some value's in every
cell"), an already-solved grid being returned unchanged, a contradictory
grid correctly failing to solve, and the formatted output including the
3x3 box separators.
