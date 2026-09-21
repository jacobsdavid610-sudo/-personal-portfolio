#!/usr/bin/env python3
"""Interval set arithmetic on half-open ranges [start, end): add, remove,
union, intersection, difference, gaps and total covered length, with
overlapping and adjacent ranges always kept merged and sorted. Half-open
is the whole trick - it makes [0, 5) and [5, 10) provably adjacent with
no epsilon fudging, so the same code is correct for integer timestamps
and floats alike. Pure stdlib (bisect)."""

import argparse
import bisect
import sys


def _check(start, end):
    if start > end:
        raise ValueError(f"start {start} is after end {end}")
    return start, end


class IntervalSet:
    def __init__(self, intervals=()):
        self._intervals = []
        for start, end in intervals:
            self.add(start, end)

    @classmethod
    def _from_sorted(cls, intervals):
        """Build directly from an already-disjoint, already-sorted list,
        skipping the merge work that add() would redo."""
        out = cls()
        out._intervals = list(intervals)
        return out

    def add(self, start, end):
        """Add [start, end), merging into anything it overlaps or touches.
        An empty range (start == end) covers nothing, so it's a no-op."""
        start, end = _check(start, end)
        if start == end:
            return
        ivs = self._intervals
        lo = bisect.bisect_left(ivs, (start,))
        if lo > 0 and ivs[lo - 1][1] >= start:
            lo -= 1
        hi = bisect.bisect_left(ivs, (end,))
        # Starts are unique and sorted, so at most one interval starts
        # exactly at end - it's adjacent, and adjacent ranges merge.
        if hi < len(ivs) and ivs[hi][0] == end:
            hi += 1
        if lo < hi:
            start = min(start, ivs[lo][0])
            end = max(end, ivs[hi - 1][1])
        ivs[lo:hi] = [(start, end)]

    def remove(self, start, end):
        """Subtract [start, end), splitting any interval it lands inside."""
        start, end = _check(start, end)
        if start == end:
            return
        ivs = self._intervals
        lo = bisect.bisect_left(ivs, (start,))
        # Strict >: an interval ending exactly at start only touches the
        # removed range, and touching removes nothing from a half-open set.
        if lo > 0 and ivs[lo - 1][1] > start:
            lo -= 1
        hi = bisect.bisect_left(ivs, (end,))
        replacement = []
        for s, e in ivs[lo:hi]:
            if s < start:
                replacement.append((s, start))
            if e > end:
                replacement.append((end, e))
        ivs[lo:hi] = replacement

    def contains(self, point):
        ivs = self._intervals
        idx = bisect.bisect_left(ivs, (point,))
        if idx < len(ivs) and ivs[idx][0] == point:
            return True
        return idx > 0 and ivs[idx - 1][1] > point

    def union(self, other):
        out = IntervalSet._from_sorted(self._intervals)
        for start, end in other:
            out.add(start, end)
        return out

    def difference(self, other):
        out = IntervalSet._from_sorted(self._intervals)
        for start, end in other:
            out.remove(start, end)
        return out

    def intersection(self, other):
        out = []
        a, b = self._intervals, other._intervals
        i = j = 0
        while i < len(a) and j < len(b):
            start = max(a[i][0], b[j][0])
            end = min(a[i][1], b[j][1])
            if start < end:
                out.append((start, end))
            # Advance whichever ends first; the other may still overlap
            # the next one along.
            if a[i][1] < b[j][1]:
                i += 1
            else:
                j += 1
        return IntervalSet._from_sorted(out)

    def gaps(self, lo, hi):
        """The parts of [lo, hi) this set does not cover."""
        lo, hi = _check(lo, hi)
        out = []
        cursor = lo
        for s, e in self._intervals:
            if e <= lo:
                continue
            if s >= hi:
                break
            if s > cursor:
                out.append((cursor, min(s, hi)))
            cursor = max(cursor, e)
            if cursor >= hi:
                break
        if cursor < hi:
            out.append((cursor, hi))
        return out

    def total(self):
        return sum(e - s for s, e in self._intervals)

    def __iter__(self):
        return iter(self._intervals)

    def __len__(self):
        return len(self._intervals)

    def __eq__(self, other):
        return isinstance(other, IntervalSet) and self._intervals == other._intervals

    def __repr__(self):
        return f"IntervalSet({self._intervals!r})"


def _number(text):
    """Keep integers as ints so output doesn't grow spurious .0 tails."""
    try:
        return int(text)
    except ValueError:
        return float(text)


def parse_intervals(text):
    out = []
    for lineno, line in enumerate(text.splitlines(), 1):
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        parts = line.replace(",", " ").split()
        if len(parts) != 2:
            raise ValueError(f"line {lineno}: expected 'start end', got {line!r}")
        try:
            start, end = _number(parts[0]), _number(parts[1])
        except ValueError:
            raise ValueError(f"line {lineno}: non-numeric bounds in {line!r}")
        out.append((start, end))
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("intervals_file", help="one 'start end' pair per line, or '-' for stdin")
    parser.add_argument("--gaps", nargs=2, metavar=("LO", "HI"), help="print uncovered ranges within [LO, HI) instead")
    parser.add_argument("--total", action="store_true", help="print total covered length instead")
    parser.add_argument("--contains", metavar="POINT", help="print whether POINT is covered, instead")
    args = parser.parse_args()

    text = sys.stdin.read() if args.intervals_file == "-" else open(args.intervals_file).read()
    try:
        pairs = parse_intervals(text)
    except ValueError as exc:
        print(exc, file=sys.stderr)
        sys.exit(2)

    if not pairs:
        print("no intervals to read", file=sys.stderr)
        sys.exit(1)

    try:
        iset = IntervalSet(pairs)
    except ValueError as exc:
        print(exc, file=sys.stderr)
        sys.exit(2)

    if args.total:
        print(iset.total())
        return

    if args.contains is not None:
        print("yes" if iset.contains(_number(args.contains)) else "no")
        return

    if args.gaps:
        try:
            ranges = iset.gaps(_number(args.gaps[0]), _number(args.gaps[1]))
        except ValueError as exc:
            print(exc, file=sys.stderr)
            sys.exit(2)
    else:
        ranges = list(iset)

    for start, end in ranges:
        print(f"{start} {end}")


if __name__ == "__main__":
    main()
