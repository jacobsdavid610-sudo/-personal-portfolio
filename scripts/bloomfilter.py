#!/usr/bin/env python3
"""A Bloom filter: a fixed-size, no-collision-storage probabilistic set that
answers "definitely not in the set" (never wrong) or "maybe in the set" (wrong
with a small, tunable probability) - trading exactness for O(1) space per
item that never grows with the size of the items themselves. Bit-array size
and hash count are derived automatically from an expected item count and a
target false-positive rate, using the standard optimal-m/k formulas. Pure
stdlib (hashlib + math)."""

import argparse
import hashlib
import math
import sys


class BloomFilter:
    def __init__(self, expected_items, false_positive_rate=0.01):
        if expected_items <= 0:
            raise ValueError("expected_items must be positive")
        if not 0 < false_positive_rate < 1:
            raise ValueError("false_positive_rate must be between 0 and 1")
        self.expected_items = expected_items
        self.false_positive_rate = false_positive_rate
        self.num_bits = max(1, math.ceil(
            -(expected_items * math.log(false_positive_rate)) / (math.log(2) ** 2)
        ))
        self.num_hashes = max(1, round((self.num_bits / expected_items) * math.log(2)))
        self._bits = bytearray((self.num_bits + 7) // 8)
        self._count = 0

    def _slots(self, item):
        """Kirsch-Mitzenmacher double hashing: derive num_hashes slot indexes
        from just two real hashes (h1 + i*h2) instead of needing num_hashes
        independent hash functions."""
        data = str(item).encode("utf-8")
        h1 = int.from_bytes(hashlib.sha256(data).digest()[:8], "big")
        h2 = int.from_bytes(hashlib.sha256(data + b"\x00salt").digest()[:8], "big") | 1
        for i in range(self.num_hashes):
            yield (h1 + i * h2) % self.num_bits

    def add(self, item):
        for slot in self._slots(item):
            self._bits[slot // 8] |= (1 << (slot % 8))
        self._count += 1

    def __contains__(self, item):
        return all(self._bits[slot // 8] & (1 << (slot % 8)) for slot in self._slots(item))

    def current_false_positive_rate(self):
        """Estimated fp rate given how many items have actually been added so
        far, as opposed to false_positive_rate which is just the target the
        filter was sized for."""
        if self._count == 0:
            return 0.0
        return (1 - math.exp(-self.num_hashes * self._count / self.num_bits)) ** self.num_hashes

    def __len__(self):
        return self._count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("items_file", help="one item per line, or '-' for stdin")
    parser.add_argument("--fp-rate", type=float, default=0.01, help="target false-positive rate (default 0.01)")
    parser.add_argument("--check", nargs="+", metavar="ITEM", help="after building the filter, report maybe/no for each ITEM instead of printing stats")
    args = parser.parse_args()

    text = sys.stdin.read() if args.items_file == "-" else open(args.items_file).read()
    items = [line.strip() for line in text.splitlines() if line.strip()]
    if not items:
        print("no items to add", file=sys.stderr)
        sys.exit(1)

    bf = BloomFilter(expected_items=len(items), false_positive_rate=args.fp_rate)
    for item in items:
        bf.add(item)

    if args.check:
        for item in args.check:
            print(f"{item}: {'maybe' if item in bf else 'no'}")
        return

    print(f"items added: {len(bf)}")
    print(f"bit array size: {bf.num_bits} bits ({(bf.num_bits + 7) // 8} bytes)")
    print(f"hash functions: {bf.num_hashes}")
    print(f"estimated false-positive rate: {bf.current_false_positive_rate():.4%}")


if __name__ == "__main__":
    main()
