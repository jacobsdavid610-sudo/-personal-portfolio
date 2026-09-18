# skiplist.py

An ordered map built from layered linked lists: every node lives in the
bottom list, and is randomly promoted to higher "express lane" lists on
insert. Search, insert, and delete all walk from the top level down,
skipping over runs of nodes at each level, giving O(log n) expected time
without any tree-rotation logic. Pure stdlib (`random`).

## Why

A sorted list gives you range queries and ordered iteration for free but
O(n) insert/search. A balanced binary tree gives you O(log n) for both,
but every insert/delete can trigger rotations to keep the tree balanced,
which is fiddly to get right. A skip list gets the same O(log n) expected
bounds by leaning on randomness instead of rebalancing: each node flips a
biased coin on insert to decide how many extra levels it gets promoted
to, and on average that produces the same "skip half the remaining nodes
each level up" shape a balanced tree enforces by construction — with
plain linked-list insert/delete at every level instead of rotations.

## API

```python
from skiplist import SkipList

s = SkipList(p=0.5, max_level=16, seed=None)
s.insert("banana", "yellow")
s["apple"] = "red"           # __setitem__ is insert
s.search("apple")            # "red"
s["apple"]                   # "red" - __getitem__ is search
"apple" in s                  # True
s.range("apple", "cherry")    # [("apple", "red"), ("banana", "yellow")]
del s["apple"]                 # __delitem__ is delete
list(s)                        # remaining keys, ascending
len(s)                          # entry count
```

- `SkipList(p=0.5, max_level=16, seed=None)` — `p` is the promotion
  probability per level (each node keeps getting promoted while a
  `random() < p` coin flip keeps landing, capped at `max_level`).
  `seed` seeds the internal RNG for reproducible structure, useful in
  tests. Raises `ValueError` if `p` isn't strictly between 0 and 1, or if
  `max_level < 1`.
- `insert(key, value=None)` — inserts, or overwrites the value in place
  if `key` is already present (overwriting doesn't touch the node's
  level or grow `len()`).
- `search(key)` — raises `KeyError` if `key` isn't present.
- `delete(key)` — raises `KeyError` if `key` isn't present.
- `range(start, end)` — all `(key, value)` pairs with
  `start <= key <= end`, ascending. Raises `ValueError` if
  `start > end`.
- `__contains__`, `__getitem__`, `__setitem__`, `__delitem__`, `__len__`,
  `__iter__` (ascending keys) all follow the methods above.

## CLI usage

```
skiplist.py <entries-file | -> [--p 0.5] [--max-level 16] [--seed N]
            [--search KEY] [--range START END]
```

Reads one `key` or `key=value` per line from a file or stdin, builds the
skip list, then either prints size/level stats, looks up one key, or
lists a range — depending on which flag is given.

## Real example

```
$ printf "banana=yellow\napple=red\ncherry=dark red\n" | skiplist.py - --seed 1
entries: 3
top level: 1

$ printf "banana=yellow\napple=red\ncherry=dark red\n" | skiplist.py - --search apple
apple=red

$ printf "banana=yellow\napple=red\ncherry=dark red\ndate=brown\n" | skiplist.py - --range apple date
apple=red
banana=yellow
cherry=dark red
date=brown
```

## Design notes

- **Coin-flip promotion, not a fixed level per node.** `_random_level`
  keeps promoting a node one level at a time while `random() < p` keeps
  succeeding, capped at `max_level`. With the default `p=0.5` that means
  roughly half of nodes reach level 1, a quarter reach level 2, and so
  on — the same geometric falloff a balanced tree's depth gives you, but
  produced without knowing anything about the other nodes already in the
  structure.
- **One update-path scan serves search, insert, and delete.**
  `_find_update_path` walks from the top level down exactly once,
  recording the rightmost node at each level whose key is still less
  than the target. Insert splices the new node in after those pointers,
  delete splices it out through them, and search just checks whether the
  walk landed on the target key — no separate traversal logic per
  operation.
- **Deletion's per-level unlink stops as soon as a level doesn't have the
  node**, rather than checking all `max_level` levels unconditionally.
  Since a node's `forward` array only has entries up to its own level,
  once `update[i].forward[i]` isn't the node being deleted, no higher
  level will point to it either — verified directly by the
  `test_top_level_never_exceeds_max_level`-style construction, not just
  assumed.
- **Overwriting an existing key never changes its level.** Only a
  genuinely new key rolls the promotion dice; re-inserting a present key
  just updates `value` in place, so `len()` and the node's position in
  the level structure are untouched.

## Exit codes

`0` on success, `1` if the entries file/stdin is empty, or if `--search`
is given a key that isn't present.

## Running the tests

```
python -m unittest tests.test_skiplist -v
```

21 tests: rejecting `p` outside `(0, 1)` and `max_level < 1`, search on
an empty list raising `KeyError`, insert/search round-tripping,
re-inserting a key overwriting its value without growing `len()`,
`__contains__`/`__getitem__`/`__setitem__` behavior, delete on a missing
key raising `KeyError`, delete shrinking `len()` and removing the key,
`__delitem__` matching `delete`, deleting every key returning the
structure to empty, ascending iteration regardless of insert order, a
1000-key shuffled insert/search/iterate integration test, inclusive
range queries (including no-match and cover-everything cases) and
`range` rejecting `start > end`, and two skip lists built from the same
seed and insert order producing identical top levels and key order. All
passing. Also ran the CLI by hand against small piped `key=value` input
in stats, `--search`, `--range`, missing-key, and empty-input modes
before committing.
