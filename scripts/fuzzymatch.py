#!/usr/bin/env python3
"""Levenshtein edit distance and a "did you mean" style fuzzy matcher.
Pure stdlib, O(n*m) dynamic programming, no external fuzzy-matching lib."""

import argparse


def levenshtein(a, b):
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)

    prev_row = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        curr_row = [i] + [0] * len(b)
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            curr_row[j] = min(
                prev_row[j] + 1,       # deletion
                curr_row[j - 1] + 1,   # insertion
                prev_row[j - 1] + cost,  # substitution
            )
        prev_row = curr_row

    return prev_row[-1]


def similarity(a, b):
    """0.0 (nothing alike) .. 1.0 (identical), normalized by the longer string."""
    longest = max(len(a), len(b))
    if longest == 0:
        return 1.0
    return 1 - levenshtein(a, b) / longest


def suggest(query, candidates, limit=3, min_similarity=0.0):
    scored = [(c, similarity(query, c)) for c in candidates]
    scored = [pair for pair in scored if pair[1] >= min_similarity]
    scored.sort(key=lambda pair: pair[1], reverse=True)
    return scored[:limit]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query")
    parser.add_argument("candidates", nargs="+")
    parser.add_argument("-n", "--limit", type=int, default=3)
    args = parser.parse_args()

    for candidate, score in suggest(args.query, args.candidates, args.limit):
        print(f"{score:.3f}  {candidate}")


if __name__ == "__main__":
    main()
