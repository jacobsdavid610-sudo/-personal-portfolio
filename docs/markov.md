# markov.py

A Markov chain text generator: builds an n-gram transition table from a
corpus (which n-token sequence tends to be followed by which word) and
generates new text by sampling from those observed transitions. Pure
stdlib.

## Why, and what this honestly is/isn't

This is a classic, pre-neural-network approach to text generation —
literally counting "what word came after this word/pair of words" in a
training text, then sampling from that distribution. It's the kind of thing
that predates and is conceptually much simpler than a language model,
worth being upfront about: there's no learned embedding space, no
attention, no gradient descent here. It's frequency counting plus weighted
random sampling. That's exactly why it's a good small project though — the
whole mechanism fits in about 70 lines and is fully inspectable.

## How it works

1. Tokenize the corpus into words.
2. For every window of `order` consecutive tokens, record what token came
   next — as a **list**, not a set, so a more common continuation is more
   likely to be picked later (this is what makes it "weighted" sampling
   rather than uniform).
3. To generate: start from some n-gram key, look up its list of observed
   next-tokens, pick one at random, slide the window forward, repeat.

## Usage

```
markov.py <corpus-file> [-n ORDER] [-m MAX_TOKENS] [--seed N]
```

- `-n/--order` — how many tokens form a state (default 2, i.e. bigrams of
  context predicting the next token). Higher order = output stays more
  faithful to the source phrasing but needs more training text to have
  enough transitions to be interesting.
- `--seed` — pass this for reproducible output; useful for tests/demos.
  Omit it for actual randomness each run.

## Real example

Trained on a 3-sentence corpus about a fox and a dog:

```
$ markov.py corpus.txt --order 2 --max-tokens 20 --seed 1
dog. The lazy dog sleeps in the sun. The quick brown fox jumps over the lazy dog watches from the
```

Running it again with `--seed 1` produces byte-for-byte identical output —
the randomness is fully determined by the seed, not by wall-clock time or
any hidden state.

## Running the tests

```
python -m unittest tests.test_markov -v
```

11 tests covering: tokenizing, the transition table for a known small
corpus (including that repeated transitions are kept as repeats, not
deduplicated - that's what makes sampling weighted), an order too large for
the corpus returning an empty model, order-3 keys, reproducibility with a
seeded RNG, that different seeds can (not must, since collisions are
possible) diverge, that every generated token actually came from the
corpus vocabulary, correctly stopping early when a key has no recorded
continuation, and `max_tokens` capping output length.
