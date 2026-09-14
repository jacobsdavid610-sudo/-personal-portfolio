# consistenthash.py

A consistent hashing ring: maps keys onto nodes placed on a hash ring, so
adding or removing a node only reshuffles the keys near it on the ring -
not the whole keyspace. Virtual replicas per node spread each node around
the ring for a more even distribution. Pure stdlib (`hashlib` + `bisect`).

## Why

`hash(key) % num_nodes` is the obvious way to shard keys across N nodes,
and it falls apart the moment N changes: adding or removing even one node
remaps nearly every key, because the modulus itself changed. That's fine
for a fixed cluster, but exactly what you don't want for a cache or
shard map where nodes come and go — a full remap means every client's
cached routing goes stale and every shard gets hit with a wave of
now-misplaced keys at once. Placing nodes and keys on the same hash ring
and walking clockwise to the nearest node fixes that: only the keys that
actually fell in the range now owned by the added/removed node move at
all.

## API

```python
from consistenthash import ConsistentHashRing

ring = ConsistentHashRing(["node-a", "node-b", "node-c"], replicas=100)
ring.get_node("user:42")   # "node-b" - deterministic for this key
ring.add_node("node-d")    # only ~1/4 of keys now remap to node-d
ring.remove_node("node-d")  # exactly those keys move back, nothing else does
len(ring)                    # 3
"node-a" in ring              # True
```

- `ConsistentHashRing(nodes=(), replicas=100)` — `replicas` is how many
  points each node gets placed at around the ring; more replicas means
  smoother key distribution at the cost of more ring entries. Raises
  `ValueError` if `replicas <= 0`.
- `add_node(node)` — idempotent: adding an already-present node is a
  no-op rather than doubling its replicas.
- `remove_node(node)` — raises `KeyError` if `node` was never added.
- `get_node(key)` — the node owning `key`: whichever replica hash is next
  clockwise from `key`'s own hash, wrapping around past the top of the
  ring. Raises `LookupError` if the ring has no nodes at all.
- `len(ring)`, `node in ring` — real node count and membership (replicas
  are an implementation detail, not counted here).

## CLI usage

```
consistenthash.py <nodes-file | -> [--replicas 100] [--keys KEY [KEY ...]]
```

Reads one node name per line from a file or stdin, builds the ring, then
either prints ring stats or, with `--keys`, which node each given key maps
to.

## Real example

```
$ printf "node-a\nnode-b\nnode-c\n" | consistenthash.py -
nodes: 3
replicas per node: 100
ring size: 300 points

$ printf "node-a\nnode-b\nnode-c\n" | consistenthash.py - --keys user:42 user:99 session:abc
user:42: node-b
user:99: node-a
session:abc: node-c
```

## Design notes

- **Virtual replicas, not one hash per node.** Hashing a node once and
  placing it at that single ring position gives wildly uneven key
  distribution if a couple of nodes happen to land close together — with
  only 3-4 real nodes that's not a rare edge case, it's the typical
  outcome. Hashing `f"{node}#{i}"` for `i` in `range(replicas)` spreads
  each node across 100 (by default) ring positions instead, so the law of
  large numbers evens things out even with very few real nodes.
- **`bisect` on a sorted hash list, not a sorted-dict library.** The ring
  only needs "smallest stored hash >= this key's hash," which is exactly
  what `bisect.bisect` gives on a plain sorted list — no need for a
  balanced-tree structure just to answer one kind of query.
- **Two separately-constructed rings with the same nodes agree on every
  key**, regardless of the order nodes were added in — verified directly
  in the tests, not just assumed — because placement only depends on
  `hash(node, replica_index)`, never on insertion order.

## Exit codes

`0` on success, `1` if the nodes file/stdin is empty (nothing to add).

## Running the tests

```
python -m unittest tests.test_consistenthash -v
```

13 tests: rejecting non-positive `replicas`, an empty ring's `get_node`
raising `LookupError`, `len`/`in` reflecting added nodes, adding an
existing node being a no-op, removing an unknown node raising `KeyError`,
a single-node ring owning every key, the same key always mapping to the
same node, two rings built with the same nodes in different orders
agreeing on every key, adding a 4th node to a 3-node ring remapping
roughly a quarter of 2000 keys (comfortably bounded between 10% and 40%,
wide enough to only fail on a real regression), removing that node moving
back exactly the keys that were on it and no others, and unrelated keys
staying on their original node across an unrelated node's removal. All
passing. Also ran the CLI by hand against a small piped node list in both
stats mode and `--keys` mode before committing.
