# lfu_cache.py

An LFU (least-frequently-used) cache with O(1) `get`/`put`, ties broken by
least-recently-used. Uses the classic frequency-bucket structure — a dict
of key -> node plus one doubly linked list per hit-count, and a tracked
minimum frequency — so eviction never has to scan every entry to find the
least-used one. Pure stdlib. Complements `scripts/lru_cache.py`: same
shape of problem, different eviction policy.

## Why

An LRU cache evicts whatever was touched longest ago, which is wrong for
a workload where some keys are genuinely hot and get touched constantly,
but happen to go quiet for a moment right as a burst of one-off cold keys
comes through — LRU would flush the hot key to make room for keys that
will never be seen again. LFU instead tracks how *often* each key is
used, so a truly popular key survives that kind of noise. The naive way
to build that ("keep a frequency count, scan for the minimum on evict")
is O(n) per eviction; bucketing nodes by frequency and tracking the
current minimum bucket makes both operations O(1) instead.

## API

```python
from lfu_cache import LFUCache

cache = LFUCache(2)
cache.put("a", 1)
cache.put("b", 2)
cache.get("a")          # a's frequency is now 2, b's is still 1
cache.put("c", 3)       # evicts "b" - lower frequency than "a"
"b" in cache             # False
cache.frequency_of("a")  # 2
len(cache)                # 2
```

- `LFUCache(capacity)` — raises `ValueError` if `capacity <= 0`.
- `get(key, default=None)` — returns the cached value, or `default` if
  absent. Counts as a use: bumps `key`'s frequency by one.
- `put(key, value)` — inserts or updates. Updating an existing key also
  counts as a use (frequency bumps). If inserting a new key would exceed
  capacity, evicts whichever key has the lowest frequency first, breaking
  ties by which of them was used longest ago.
- `key in cache` (`__contains__`), `len(cache)` — current size, up to
  `capacity`.
- `frequency_of(key)` — the key's current hit-count, or `None` if it
  isn't cached. For debugging/tests, not part of the hot path.

## Real example

```
$ python lfu_cache.py
put 'a' -> size=1, freq('a')=1
put 'b' -> size=2, freq('b')=1
put 'a' -> size=2, freq('a')=2
put 'c' -> size=2, freq('c')=1
put 'a' -> size=2, freq('a')=3
put 'b' -> size=2, freq('b')=1
```

`c` displaces `b` (the freq-1 key) rather than `a` (freq-2 by then); a few
steps later `b` comes back in and, being new again, displaces `c` in turn.

## Design notes

- **Frequency buckets, not a heap.** A min-heap keyed by frequency would
  give `O(log n)` eviction and still needs extra bookkeeping to break
  ties by recency. Bucketing every node by its exact current frequency
  into its own doubly linked list, with a plain dict from frequency to
  bucket, makes both bumping a node's frequency and evicting the global
  minimum true O(1) — the same trick that makes the frequency-1 through
  frequency-k structure of the classic "O(1) LFU" solution work.
- **`_min_freq` is only ever incremented, never searched for**, except
  when a `put()` inserts a brand-new key, at which point it's reset to
  `1` — a new key is always the immediate eviction candidate ahead of
  anything with real usage history, so the minimum can only live at
  frequency 1 the moment one exists. That's what keeps eviction from
  needing to scan the bucket dict for the actual minimum key.
- **A `put()` on an existing key bumps its frequency**, matching `get()`
  — from the cache's point of view, touching a key you already have is a
  use of it, not a neutral overwrite, and treating it otherwise would let
  a key get silently downgraded to the eviction candidate just from being
  updated in place.

## Exit codes

`0` on success (uncaught `ValueError` on bad capacity otherwise).

## Running the tests

```
python -m unittest tests.test_lfu_cache -v
```

15 tests: missing-key `get` returning the given default, put/get
round-tripping, rejecting non-positive capacity, `len()` tracking size up
to capacity, updating an existing key without growing the cache, a fresh
key starting at frequency 1, `get`/`put` both incrementing frequency,
`frequency_of` returning `None` for an absent key, evicting the
lower-frequency key on overflow, frequency ties breaking by
least-recently-used, touching the older of two tied keys saving it from
eviction, capacity-1 always holding just the latest key, a hot key
surviving 50 rounds of cold one-off arrivals, and a two-cycle
evict-then-refill-at-frequency-1 sequence to check the `_min_freq`
bookkeeping itself stays correct across repeated eviction rounds, not
just the first one. All passing. Also ran the module directly to confirm
the demo trace (see Real example) matches the manually worked-out
eviction order before writing the formal tests.
