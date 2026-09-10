# bloomfilter.py

A Bloom filter: a fixed-size, no-collision-storage probabilistic set. It
answers "definitely not in the set" (never wrong) or "maybe in the set"
(wrong with a small, tunable probability) - trading exactness for O(1)
space per item that never grows with the size of the items themselves.
Pure stdlib.

## Why

Checking "have I seen this before?" against a growing set is normally
`O(n)` in memory - a hash set has to store every item. If a wrong answer
occasionally saying "maybe" is acceptable (and then verified against the
real, slower store), a Bloom filter answers the same question in a fixed
number of bits regardless of how big or small the items are: useful for
things like "has this URL already been crawled" or "is this username
possibly taken" gates in front of a database lookup, where most queries
are for things that were never added and can be rejected instantly
without touching the real store.

## API

```python
from bloomfilter import BloomFilter

bf = BloomFilter(expected_items=1000, false_positive_rate=0.01)
bf.add("alice@example.com")
"alice@example.com" in bf   # True
"bob@example.com" in bf     # False (or occasionally a false positive)
len(bf)                     # 1 - number of adds so far
bf.current_false_positive_rate()  # estimated rate given what's actually been added
```

- `BloomFilter(expected_items, false_positive_rate=0.01)` — sizes the bit
  array and picks the number of hash rounds automatically from the
  standard optimal-`m`/`k` formulas, given how many items you expect to
  add and how often you're willing to tolerate a false "maybe". Raises
  `ValueError` if `expected_items <= 0` or `false_positive_rate` isn't
  strictly between 0 and 1.
- `add(item)` — registers `item` (anything, stringified internally).
- `item in bf` (`__contains__`) — `False` means definitely never added.
  `True` means "maybe added" - true positive or false positive, and a
  Bloom filter can't tell you which.
- `len(bf)` — total number of `add()` calls (duplicates counted).
- `current_false_positive_rate()` — the *estimated* false-positive rate
  given how many items have actually been added, as opposed to
  `false_positive_rate`, the target the filter was sized for. Rises
  smoothly from 0.0 (empty) toward (and eventually past) the target as
  more items go in than the filter was originally sized for.

## CLI usage

```
bloomfilter.py <items-file | -> [--fp-rate 0.01] [--check ITEM [ITEM ...]]
```

Reads one item per line from a file or stdin, builds a filter sized for
exactly that many items at `--fp-rate` (default 1%), adds them all, then
either prints filter stats or, with `--check`, reports `maybe`/`no` for
each given item.

## Real example

```
$ printf "alice\nbob\ncarol\ndave\n" | bloomfilter.py -
items added: 4
bit array size: 39 bits (5 bytes)
hash functions: 7
estimated false-positive rate: 0.9255%

$ printf "alice\nbob\ncarol\ndave\n" | bloomfilter.py - --check alice erin
alice: maybe
erin: no
```

## Design notes

- **Double hashing (Kirsch-Mitzenmacher)** derives all `num_hashes` slot
  indexes from just two real SHA-256 hashes (`h1 + i*h2`) instead of
  needing `num_hashes` independent hash functions - the standard trick
  that keeps a Bloom filter's actual false-positive rate provably close
  to a naive multi-hash design without the cost of running many separate
  hash functions per item.
- **No deletion support.** Clearing a bit that's shared by another item's
  slot would silently turn a real membership into a false negative -
  the one guarantee a Bloom filter is supposed to give up front. Counting
  Bloom filters solve this with per-slot counters instead of single bits,
  but that's a different data structure with different space costs, not
  something to bolt on here.
- **`expected_items` isn't enforced** — nothing stops `add()`-ing more
  items than the filter was sized for. It still works, it just makes
  `current_false_positive_rate()` climb above the original target as the
  bit array saturates, which is why that method reads the *actual* count
  rather than assuming it matches `expected_items`.

## Exit codes

`0` on success, `1` if the items file/stdin is empty (nothing to add).

## Running the tests

```
python -m unittest tests.test_bloomfilter -v
```

14 tests: rejecting non-positive `expected_items` and out-of-range
`false_positive_rate`, bit-array/hash-count sizing matching the textbook
formulas exactly, a never-added item reporting absent, an added item
always reporting maybe-present, zero false negatives across 300 added
items, non-string items being hashed consistently by their string form,
the empirical false-positive rate over 2000 disjoint probes staying well
under a 5x safety margin of the 1% target, `len()` counting every `add()`
including duplicates, the empty-filter estimate being exactly 0.0, the
estimate rising monotonically as more items are added, and the estimate
landing within one target-rate's-width of the target once filled to
exactly its sized capacity.
