# intervals.py

Interval set arithmetic on half-open ranges `[start, end)`: add, remove,
union, intersection, difference, gaps and total covered length, with
overlapping and adjacent ranges always kept merged and sorted. Pure
stdlib (`bisect`).

## Why

"Which parts of this window are covered, and which aren't?" turns up
constantly — uptime from a list of incident windows, free slots between
bookings, which byte ranges of a file you already have, which log
periods a job actually ran for. Hand-rolling it each time is where the
bugs live, because the interesting cases are all at the boundaries:
two ranges that merely touch, one range swallowing three others, a
subtraction landing in the middle of a span and having to split it in
two.

Representing ranges as half-open `[start, end)` is what makes those
cases decidable instead of fiddly. With closed intervals, `[0, 5]` and
`[6, 10]` are adjacent for integers but not for floats — you can't tell
"touching" from "there's a gap" without knowing the step size of the
underlying type, so the code needs an epsilon and the epsilon is wrong
for somebody. Half-open has no such ambiguity: `[0, 5)` and `[5, 10)`
share no point yet leave nothing between them, so they merge, and the
same code is correct for integer timestamps and floats alike.

## API

```python
from intervals import IntervalSet

iset = IntervalSet([(0, 5), (10, 15)])
iset.add(5, 10)          # adjacent - fuses into a single [0, 15)
iset.remove(2, 12)       # splits: [(0, 2), (12, 15)]
iset.contains(12)        # True  - start is inclusive
iset.contains(2)         # False - end is exclusive
iset.total()             # 5  - covered length, overlaps counted once
iset.gaps(0, 20)         # [(2, 12), (15, 20)]
list(iset)               # [(0, 2), (12, 15)]
```

- `IntervalSet(intervals=())` — input may be unsorted and overlapping;
  it comes back sorted and merged. Raises `ValueError` if any
  `start > end` (rather than silently swapping them).
- `add(start, end)` — merges into anything it overlaps *or touches*. An
  empty range (`start == end`) covers nothing and is a no-op.
- `remove(start, end)` — subtracts, splitting an interval in two if the
  removed range lands inside it. A merely touching range removes
  nothing.
- `contains(point)` — start inclusive, end exclusive.
- `union(other)`, `intersection(other)`, `difference(other)` — return a
  new `IntervalSet`; neither operand is modified.
- `gaps(lo, hi)` — the parts of `[lo, hi)` this set does not cover,
  clipped to those bounds.
- `total()` — total covered length, overlapping cover counted once.
- `len(iset)`, `iter(iset)`, `==` — merged interval count, the
  `(start, end)` pairs in order, and equality by covered content.

## CLI usage

```
intervals.py <file | -> [--gaps LO HI] [--total] [--contains POINT]
```

Reads one `start end` pair per line from a file or stdin (commas work
too, `#` starts a comment), then prints the merged set — or the gaps,
total, or a containment answer instead.

## Real example

```
$ cat windows.txt
0 5
10 15
5 10   # adjacent, should fuse

20 25

$ intervals.py windows.txt
0 15
20 25

$ intervals.py windows.txt --gaps 0 30
15 20
25 30

$ intervals.py windows.txt --total
20

$ intervals.py windows.txt --contains 17
no

$ printf "1,4\n3,8\n" | intervals.py -
1 8
```

## Design notes

- **Half-open ranges, stored merged.** Normalising on every `add`
  rather than merging lazily at read time keeps the internal list
  always sorted and disjoint, which is what lets every other operation
  use `bisect` and assume non-overlap. The invariant is worth more than
  the deferred work would save.
- **`bisect` on the tuple list directly, no parallel array of starts.**
  `bisect_left(intervals, (start,))` works because a 1-tuple compares as
  a prefix of `(start, end)` — so it finds the first interval starting
  at or after `start` without maintaining a second list that could drift
  out of sync with the first.
- **Adjacency handled by one explicit step, not an epsilon.** After
  `bisect_left(intervals, (end,))`, at most one interval can start
  exactly at `end` (starts are unique and sorted), so including it is a
  single bounds-checked `hi += 1` rather than a scan.
- **`>=` when merging, `>` when removing.** `add` treats an interval
  ending exactly at `start` as mergeable; `remove` treats the same
  interval as untouched. That asymmetry is the half-open semantics
  showing through, and both directions are pinned by their own test so
  the distinction can't quietly regress.
- **`start > end` raises instead of swapping.** Silently reordering
  would turn a caller's argument-order bug into a plausible-looking
  result that's wrong somewhere far away.
- **Integers stay integers when parsing.** `int()` is tried before
  `float()`, so integer input doesn't come back out with spurious `.0`
  tails — the CLI's output stays usable as input to the next thing.

## Exit codes

`0` on success, `1` if the input has no intervals at all, `2` on
malformed input (bad field count, non-numeric bounds, or `start > end`)
— reported with the offending line number.

## Running the tests

```
python -m unittest tests.test_intervals -v
```

34 tests: `start > end` rejected and empty ranges ignored, unsorted
overlapping constructor input coming back sorted and merged, overlapping
and adjacent adds merging while disjoint ones stay separate, one range
swallowing three others, a contained range changing nothing, float
bounds merging identically, removal splitting an interval in two,
removal of a merely touching range leaving it intact, removal spanning
several intervals and removal clearing the set, start-inclusive /
end-exclusive containment, intersection/union/difference against a
range overlapping two spans plus a disjoint-intersection case, set ops
leaving both operands unmodified, gaps between spans and clipped to
bounds and absent when fully covered, total counting overlapping cover
once, and the parser on comments, blank lines, comma form, int-vs-float
preservation, wrong field counts (line number included) and non-numeric
bounds. All passing. Also ran the CLI by hand over a scratch file and
piped stdin in merge, `--gaps`, `--total` and `--contains` modes, and
checked the exit codes for malformed and empty input, before committing.
