# unionfind.py

Disjoint-set union (union-find) over arbitrary hashable elements, with
path compression and union by rank: near-constant-time "are these two
connected" queries and connected-component grouping. Pure stdlib.

## Why

Kruskal's MST, cycle detection in an undirected graph, and "group these
into friend circles / connected clusters" problems all reduce to the same
question asked over and over: are X and Y in the same component yet? Doing
that with a fresh BFS/DFS every time is O(n) per query; union-find answers
it in very close to O(1) amortized, which is the whole reason the
structure exists rather than everyone just reusing `graph.py`'s BFS.

## API

```python
from unionfind import UnionFind

uf = UnionFind()
uf.union("alice", "bob")
uf.union("bob", "carol")
uf.connected("alice", "carol")  # True - transitive through bob
uf.union("dave", "erin")
uf.connected("alice", "dave")   # False
uf.groups()
# {"alice": ["alice", "bob", "carol"], "dave": ["dave", "erin"]}
uf.size("alice")   # 3
uf.num_components()  # 2
```

- `UnionFind(elements=())` — optionally seed with a starting collection of
  singletons.
- `add(x)` — registers `x` as its own set if it isn't already known.
  Idempotent: re-adding a known element is a no-op, it doesn't reset its
  set.
- `union(x, y) -> bool` — merges `x`'s and `y`'s sets, `add()`-ing either
  one that's new. Returns `True` if they were previously separate sets,
  `False` if they were already connected (a genuine no-op, useful for
  Kruskal's "does this edge create a cycle" check for free).
- `find(x)` — the set's representative element. **Raises `KeyError` if `x`
  was never `add()`-ed or `union()`-ed in** — see Design notes.
- `connected(x, y) -> bool`, `size(x) -> int` (the size of `x`'s whole
  component), `groups() -> {representative: [members]}`,
  `num_components() -> int`, `len(uf)` (total elements registered).

## CLI usage

```
unionfind.py <edges-file | -> [--connected A B]
```

Reads `a b` pairs (one per line, whitespace-separated) from a file or
stdin, unions each pair, and prints the resulting components — one line
per group, `representative: sorted members`. `--connected A B` instead
prints just `true`/`false` for whether those two ended up in the same
component (auto-registering them first, so querying a name that never
appeared in an edge still works rather than erroring).

## Real example

```
$ cat edges.txt
alice bob
bob carol
dave erin

$ unionfind.py edges.txt
alice: alice bob carol
dave: dave erin

$ unionfind.py edges.txt --connected alice carol
true
```

## Design notes

- **`find()` raises `KeyError` on an element that was never registered**,
  instead of silently treating it as a fresh singleton. `union()` and the
  CLI's `--connected` flag both auto-`add()` first, since union-find is
  usually built incrementally straight from a stream of edges — but a bare
  connectivity *query* against a name that's never appeared anywhere is
  much more likely a typo than a deliberate new element, so `find`/
  `connected`/`size` fail loudly on it rather than returning a
  misleadingly confident `False`.
- **Path compression is iterative, not recursive** (two `while` loops:
  walk to the root, then walk again re-pointing every node straight at
  it) — a recursive version blows Python's default recursion limit on a
  long enough chain before union by rank has a chance to keep the tree
  shallow, which is exactly the "great in theory, breaks on real input"
  bug this data structure is supposed to avoid.
- **Union by rank always attaches the shorter tree under the taller one**,
  and only increments rank when the two trees were equally tall — the
  standard trick that keeps the tree close to flat even before path
  compression kicks in, which is what gives near-`O(1)` `find()` instead
  of degrading to a linked list under repeated one-sided unions.

## Exit codes

`0` on success (uncaught `KeyError`/usage error otherwise).

## Running the tests

```
python -m unittest tests.test_unionfind -v
```

16 tests: a fresh singleton being connected only to itself, union
connecting two new elements, union auto-registering unadded elements,
unrelated elements staying disconnected, transitivity across a chain,
`union()`'s `True`/`False` return distinguishing an actual merge from a
no-op, `find`/`connected` raising `KeyError` on an unregistered element,
`add()` being idempotent (doesn't reset an existing set), singleton and
merged-component `size()`, `groups()` correctly partitioning every added
element, `num_components()` decreasing with each real merge, re-unioning
an already-connected pair not double-counting size, and a 1000-element
chain unioned one link at a time to confirm path compression doesn't
break correctness (or blow the recursion limit) on a genuinely long chain.
