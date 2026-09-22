#!/usr/bin/env python3
"""Fixed-capacity circular buffer: push is O(1) and never grows the
underlying storage, once full each push silently overwrites the oldest
item. Iteration and indexing are always in logical (oldest-to-newest)
order regardless of where the physical wrap point currently sits. Pure
stdlib, no dependencies."""

import argparse
import sys


class RingBuffer:
    def __init__(self, capacity):
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        self.capacity = capacity
        self._buf = [None] * capacity
        self._start = 0
        self._count = 0

    def push(self, item):
        if self._count < self.capacity:
            self._buf[(self._start + self._count) % self.capacity] = item
            self._count += 1
        else:
            self._buf[self._start] = item
            self._start = (self._start + 1) % self.capacity

    def clear(self):
        """Drops all items and releases references to them, rather than
        just resetting count - a buffer of large objects shouldn't keep
        them reachable after clear() because the slots weren't nulled."""
        self._buf = [None] * self.capacity
        self._start = 0
        self._count = 0

    @property
    def is_full(self):
        return self._count == self.capacity

    def __len__(self):
        return self._count

    def __getitem__(self, index):
        if index < 0:
            index += self._count
        if not 0 <= index < self._count:
            raise IndexError(index)
        return self._buf[(self._start + index) % self.capacity]

    def __iter__(self):
        for i in range(self._count):
            yield self._buf[(self._start + i) % self.capacity]

    def __repr__(self):
        return f"RingBuffer({list(self)!r}, capacity={self.capacity})"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lines_file", help="one item per line, or '-' for stdin")
    parser.add_argument("--capacity", type=int, default=10, help="buffer capacity (default 10)")
    parser.add_argument("--stats", action="store_true", help="print count/capacity/full instead of the buffered lines")
    args = parser.parse_args()

    try:
        ring = RingBuffer(args.capacity)
    except ValueError as exc:
        print(exc, file=sys.stderr)
        sys.exit(2)

    text = sys.stdin.read() if args.lines_file == "-" else open(args.lines_file).read()
    for line in text.splitlines():
        ring.push(line)

    if args.stats:
        print(f"count: {len(ring)}")
        print(f"capacity: {ring.capacity}")
        print(f"full: {'yes' if ring.is_full else 'no'}")
        return

    for line in ring:
        print(line)


if __name__ == "__main__":
    main()
