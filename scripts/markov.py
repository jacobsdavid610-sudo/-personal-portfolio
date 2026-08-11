#!/usr/bin/env python3
"""Markov chain text generator: builds an n-gram transition table from a
corpus and generates new text by sampling from it. Pure stdlib, no ML
framework - this is the actual statistical-model-from-counts approach,
not a call out to a language model."""

import argparse
import random
import re
from collections import defaultdict

TOKEN_RE = re.compile(r"\S+")


def tokenize(text):
    return TOKEN_RE.findall(text)


def build_model(tokens, order=2):
    """Maps an n-gram (tuple of `order` tokens) -> list of tokens observed
    to follow it (with repeats, so more common continuations are sampled
    more often)."""
    if len(tokens) <= order:
        return {}

    model = defaultdict(list)
    for i in range(len(tokens) - order):
        key = tuple(tokens[i : i + order])
        model[key].append(tokens[i + order])
    return dict(model)


def generate(model, order=2, max_tokens=50, rng=None, start=None):
    rng = rng or random
    if not model:
        return []

    key = start if start is not None else rng.choice(list(model.keys()))
    output = list(key)

    for _ in range(max_tokens - order):
        candidates = model.get(key)
        if not candidates:
            break
        next_token = rng.choice(candidates)
        output.append(next_token)
        key = tuple(output[-order:])

    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("corpus", help="Path to a text file to train on")
    parser.add_argument("-n", "--order", type=int, default=2, help="n-gram size")
    parser.add_argument("-m", "--max-tokens", type=int, default=50)
    parser.add_argument("--seed", type=int, default=None, help="RNG seed for reproducible output")
    args = parser.parse_args()

    with open(args.corpus, encoding="utf-8") as f:
        tokens = tokenize(f.read())

    model = build_model(tokens, args.order)
    if not model:
        print("Corpus too short for the given order.")
        return

    rng = random.Random(args.seed)
    result = generate(model, args.order, args.max_tokens, rng=rng)
    print(" ".join(result))


if __name__ == "__main__":
    main()
