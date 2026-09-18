#!/usr/bin/env python3
"""Skip list: an ordered map built from layered linked lists, where each
node is randomly promoted to higher levels on insert. Search, insert, and
delete all walk from the top level down, skipping over runs of nodes at
each level, which gives O(log n) expected time without the rebalancing
a balanced tree needs. Pure stdlib (random)."""

import argparse
import random
import sys


class _Node:
    __slots__ = ("key", "value", "forward")

    def __init__(self, key, value, level):
        self.key = key
        self.value = value
        self.forward = [None] * (level + 1)


class SkipList:
    def __init__(self, p=0.5, max_level=16, seed=None):
        if not 0 < p < 1:
            raise ValueError("p must be between 0 and 1 exclusive")
        if max_level < 1:
            raise ValueError("max_level must be at least 1")
        self.p = p
        self.max_level = max_level
        self._level = 0
        self._header = _Node(None, None, max_level)
        self._size = 0
        self._rand = random.Random(seed)

    def _random_level(self):
        level = 0
        while self._rand.random() < self.p and level < self.max_level:
            level += 1
        return level

    def _find_update_path(self, key):
        """Returns (update, node) where update[i] is the rightmost node at
        level i with a key < the given key, and node is update[0]'s
        successor at level 0 (the node itself, if key is present)."""
        update = [self._header] * (self.max_level + 1)
        node = self._header
        for i in range(self._level, -1, -1):
            while node.forward[i] is not None and node.forward[i].key < key:
                node = node.forward[i]
            update[i] = node
        return update, node.forward[0]

    def insert(self, key, value=None):
        """Inserts key with value, or overwrites value if key is already
        present. Overwriting does not change the node's level or len()."""
        update, existing = self._find_update_path(key)
        if existing is not None and existing.key == key:
            existing.value = value
            return

        level = self._random_level()
        if level > self._level:
            for i in range(self._level + 1, level + 1):
                update[i] = self._header
            self._level = level

        new_node = _Node(key, value, level)
        for i in range(level + 1):
            new_node.forward[i] = update[i].forward[i]
            update[i].forward[i] = new_node
        self._size += 1

    def search(self, key):
        """Raises KeyError if key is not present."""
        _, node = self._find_update_path(key)
        if node is not None and node.key == key:
            return node.value
        raise KeyError(key)

    def delete(self, key):
        """Raises KeyError if key is not present."""
        update, node = self._find_update_path(key)
        if node is None or node.key != key:
            raise KeyError(key)
        for i in range(self._level + 1):
            if update[i].forward[i] is not node:
                break
            update[i].forward[i] = node.forward[i]
        while self._level > 0 and self._header.forward[self._level] is None:
            self._level -= 1
        self._size -= 1

    def range(self, start, end):
        """All (key, value) pairs with start <= key <= end, in ascending
        order. Raises ValueError if start > end."""
        if start > end:
            raise ValueError("start must be <= end")
        _, node = self._find_update_path(start)
        result = []
        while node is not None and node.key <= end:
            result.append((node.key, node.value))
            node = node.forward[0]
        return result

    def __len__(self):
        return self._size

    def __contains__(self, key):
        try:
            self.search(key)
            return True
        except KeyError:
            return False

    def __getitem__(self, key):
        return self.search(key)

    def __setitem__(self, key, value):
        self.insert(key, value)

    def __delitem__(self, key):
        self.delete(key)

    def __iter__(self):
        node = self._header.forward[0]
        while node is not None:
            yield node.key
            node = node.forward[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("entries_file", help="one 'key' or 'key=value' per line, or '-' for stdin")
    parser.add_argument("--p", type=float, default=0.5, help="level-promotion probability (default 0.5)")
    parser.add_argument("--max-level", type=int, default=16, help="maximum node level (default 16)")
    parser.add_argument("--seed", type=int, default=None, help="seed the level RNG for reproducible structure")
    parser.add_argument("--search", metavar="KEY", help="print the value for KEY instead of stats")
    parser.add_argument("--range", nargs=2, metavar=("START", "END"), help="print key=value pairs with START <= key <= END")
    args = parser.parse_args()

    if args.entries_file == "-":
        text = sys.stdin.read()
    else:
        with open(args.entries_file) as f:
            text = f.read()

    skiplist = SkipList(p=args.p, max_level=args.max_level, seed=args.seed)
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        key, _, value = line.partition("=")
        skiplist.insert(key, value or None)

    if len(skiplist) == 0:
        print("no entries to add", file=sys.stderr)
        sys.exit(1)

    if args.search is not None:
        try:
            value = skiplist.search(args.search)
        except KeyError:
            print(f"{args.search}: not found", file=sys.stderr)
            sys.exit(1)
        print(f"{args.search}={value}" if value is not None else args.search)
        return

    if args.range is not None:
        start, end = args.range
        for key, value in skiplist.range(start, end):
            print(f"{key}={value}" if value is not None else key)
        return

    print(f"entries: {len(skiplist)}")
    print(f"top level: {skiplist._level}")


if __name__ == "__main__":
    main()
