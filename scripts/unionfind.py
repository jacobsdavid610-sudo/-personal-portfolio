#!/usr/bin/env python3
"""Disjoint-set union (union-find) over arbitrary hashable elements, with
path compression and union by rank: near-constant-time "are these two
connected" queries and connected-component grouping, for problems like
Kruskal's MST, cycle detection in an undirected graph, or "friend circle"
style grouping - where repeatedly re-running BFS/DFS for every query would
be wasteful. Pure stdlib."""

import argparse
import sys
from collections import defaultdict


class UnionFind:
    def __init__(self, elements=()):
        self._parent = {}
        self._rank = {}
        self._size = {}
        for e in elements:
            self.add(e)

    def add(self, x):
        """Register x as its own singleton set, if it isn't already known."""
        if x not in self._parent:
            self._parent[x] = x
            self._rank[x] = 0
            self._size[x] = 1

    def find(self, x):
        """Return x's set representative. Raises KeyError if x was never
        add()ed - querying an element that was never part of any union()
        call is almost always a typo, not a "new singleton" you meant."""
        if x not in self._parent:
            raise KeyError(x)
        root = x
        while self._parent[root] != root:
            root = self._parent[root]
        # Path compression: repoint every node visited straight to root,
        # so the next find() on any of them is O(1) instead of retracing
        # the same chain.
        while self._parent[x] != root:
            self._parent[x], x = root, self._parent[x]
        return root

    def union(self, x, y):
        """Merge x's and y's sets, add()ing either one that's new. Returns
        True if they were previously separate, False if they were already
        in the same set."""
        self.add(x)
        self.add(y)
        rx, ry = self.find(x), self.find(y)
        if rx == ry:
            return False
        if self._rank[rx] < self._rank[ry]:
            rx, ry = ry, rx
        self._parent[ry] = rx
        self._size[rx] += self._size[ry]
        if self._rank[rx] == self._rank[ry]:
            self._rank[rx] += 1
        return True

    def connected(self, x, y):
        return self.find(x) == self.find(y)

    def size(self, x):
        """Size of x's connected component."""
        return self._size[self.find(x)]

    def groups(self):
        """{representative: [members]} for every element added so far."""
        result = defaultdict(list)
        for x in self._parent:
            result[self.find(x)].append(x)
        return dict(result)

    def num_components(self):
        return len(self.groups())

    def __len__(self):
        return len(self._parent)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("edges_file", help="one 'a b' pair per line, or '-' for stdin")
    parser.add_argument("--connected", nargs=2, metavar=("A", "B"), help="just report whether A and B end up connected")
    args = parser.parse_args()

    text = sys.stdin.read() if args.edges_file == "-" else open(args.edges_file).read()

    uf = UnionFind()
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        a, b = line.split(None, 1)
        uf.union(a, b)

    if args.connected:
        a, b = args.connected
        uf.add(a)
        uf.add(b)
        print("true" if uf.connected(a, b) else "false")
        return

    for root, members in uf.groups().items():
        print(f"{root}: {' '.join(sorted(members))}")


if __name__ == "__main__":
    main()
