# reservoir.py

Reservoir sampling (Algorithm R): picks `k` items uniformly at random
from a stream of unknown or unbounded length, in a single pass, holding
only `k` items in memory at any point — never the whole stream. Pure
stdlib (`random`).

## Why

"Give me a random sample of N items from this" is easy when you know
the total count up front: pick N random indices, done. It stops being
easy the moment the source is a stream you can't size ahead of time or
can't afford to hold in memory all at once — log lines being tailed
live, rows from a cursor over a huge table, anything arriving faster
than you'd want to buffer. Reservoir sampling solves exactly that: read
the stream once, keep a "reservoir" of `k` items, and as each new item
arrives, replace a uniformly-random slot in the reservoir with
probability `k/i` (where `i` is how many items have been seen so far).
Every item ends up with exactly `k/n` probability of surviving to the
end, regardless of `n` - which isn't obvious on sight and is worth
trusting the tests over intuition for.

## API

```python
from reservoir import reservoir_sample

reservoir_sample(["a", "b", "c", "d", "e"], 2)
# 2 items, each with an equal 2/5 chance of being picked

reservoir_sample(range(10_000_000), 5)
# still only ever holds 5 items in memory, one pass over the range
```

- `reservoir_sample(iterable, k, rng=random)` — `iterable` is consumed
  exactly once, in order; doesn't need to support `len()` and doesn't
  need to fit in memory. Raises `ValueError` if `k < 0`.
- If the stream has fewer than `k` items, every item is returned, in
  original order — no replacement ever ran, since every index was still
  `< k`.
- `rng` only needs a `randint(a, b)` method (inclusive both ends) — the
  `random` module itself works as the default, or pass a seeded
  `random.Random(seed)` instance for reproducible sampling, the same
  injectable-source pattern `ratelimiter.py`'s clock and `memoize.js`'s
  clock use for testability without depending on real randomness (or
  real time) inside a test.

## CLI usage

```
reservoir.py <file | -> [--k N] [--seed N]
```

Reads one item per line, prints a random sample of `N` (default 1) of
them. `--seed` makes the sample reproducible across runs; omit it for
real randomness.

## Real example

```
$ seq 1 1000000 | reservoir.py - --k 5 --seed 1
384215
712048
9931
560872
217664

$ seq 1 1000000 | reservoir.py - --k 5 --seed 1   # same seed, same sample
384215
712048
9931
560872
217664
```

One million lines streamed through, only 5 ever held in memory.

## Design notes

- **`i < k` items are appended directly; only later items compete for a
  slot.** The first `k` items have nowhere else to go — the reservoir
  isn't "full" yet, so there's no meaningful `k/i` probability to apply.
  This is also why a stream shorter than `k` comes back in original
  order: replacement code never runs at all.
- **`randint(0, i)` inclusive, not `randint(0, i - 1)`.** The interval
  has to be `i + 1` wide (indices `0` through `i`, the item's own
  position included) for the `k/(i+1)` survival probability to come out
  right — the classic derivation for Algorithm R treats the current
  item as the `(i+1)`-th one seen. Getting this bound off by one would
  produce a working-looking sampler with a subtly biased distribution,
  which is exactly the kind of bug a quick eyeball test wouldn't catch
  and only the statistical test would.
- **Tested two different ways, not just one.** A `FakeRng` test double
  that returns a scripted sequence of `randint` results pins the exact
  replacement mechanics for a small, fully worked-out example (this
  index gets replaced, this one doesn't) — real confidence that the
  logic is right, not just that it looks statistically plausible over
  many runs. Separately, a 20,000-trial run against a fixed seed checks
  that the *actual* distribution comes out close to uniform, with a
  deliberately loose tolerance (25%-55% against a 40% expectation, the
  same style of wide-but-real bound `consistenthash.py`'s remap-fraction
  test uses) so it only fails on a genuine bias, not sampling noise.
  Neither test alone would have been enough - the mechanics test can't
  catch a subtly-biased-but-plausible-looking formula, and the
  statistical test alone wouldn't pin down *why* a failure happened.

## Exit codes

`0` on success, `2` if `--k` is negative.

## Running the tests

```
python -m unittest tests.test_reservoir -v
```

12 tests: negative `k` rejected, `k=0` returning empty, a stream shorter
than `k` (and equal to `k`) returning everything in original order, an
empty stream, the first-`k`-items-fill-directly path (proven by a
`FakeRng` that would raise if `randint` were called at all), a scripted
replacement landing exactly where `randint` says it should, a scripted
`randint` result at or past `k` correctly discarding the new item,
same-seed reproducibility, different seeds producing different samples,
the 20,000-trial uniformity check described above, and `k=1` eventually
covering every item in the stream given enough draws. All passing. Also
ran the CLI by hand piping a million-line stream through `--k 5` with a
fixed `--seed` twice to confirm reproducibility, and checked the exit
code for negative `--k`, before committing.
