#!/usr/bin/env python3
"""Reservoir sampling (Algorithm R): pick k items uniformly at random from
a stream of unknown or unbounded length, in a single pass, holding only
k items in memory at any point - never the whole stream. Pure stdlib
(random)."""

import argparse
import random
import sys


def reservoir_sample(iterable, k, rng=random):
    """Returns a list of up to k items sampled uniformly at random from
    iterable. If the stream has fewer than k items, every item is
    returned (in original order - no replacement ever happened).
    rng only needs a randint(a, b) method (inclusive both ends), so
    either the random module itself or a random.Random instance works.
    """
    if k < 0:
        raise ValueError("k must be non-negative")
    if k == 0:
        return []

    reservoir = []
    for i, item in enumerate(iterable):
        if i < k:
            reservoir.append(item)
        else:
            j = rng.randint(0, i)
            if j < k:
                reservoir[j] = item
    return reservoir


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lines_file", help="one item per line, or '-' for stdin")
    parser.add_argument("--k", type=int, default=1, help="sample size (default 1)")
    parser.add_argument("--seed", type=int, default=None, help="RNG seed, for reproducible sampling")
    args = parser.parse_args()

    if args.k < 0:
        print("--k must be non-negative", file=sys.stderr)
        sys.exit(2)

    rng = random.Random(args.seed) if args.seed is not None else random

    text = sys.stdin.read() if args.lines_file == "-" else open(args.lines_file).read()
    lines = text.splitlines()

    for item in reservoir_sample(lines, args.k, rng=rng):
        print(item)


if __name__ == "__main__":
    main()
