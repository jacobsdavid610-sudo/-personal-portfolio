# graph.py

An adjacency-list directed graph with two classic algorithms: BFS shortest
path (fewest edges, unweighted) and topological sort (Kahn's algorithm,
with cycle detection). Pure stdlib.

## API

```python
from graph import Graph

g = Graph()
g.add_edge("a", "b")
g.add_edge("b", "c")
g.add_node("isolated")  # a node with no edges is still valid

g.shortest_path("a", "c")     # ["a", "b", "c"]
g.shortest_path("a", "zzz")   # None - unknown node
g.topological_sort()          # ["a", "isolated", "b", "c"] (or similar valid order)
```

`shortest_path` returns `None` (not an exception) for an unreachable or
unknown node — "no path" is an expected, common outcome, not an error
condition. `topological_sort` raises `ValueError` on a cycle, since "give me
a valid dependency order" genuinely has no answer when there's a cycle —
that's a real error, not a normal outcome to silently swallow.

## Real example: dependency ordering

Given a "getting dressed" dependency graph as JSON:

```json
{
  "edges": [
    ["socks", "shoes"],
    ["underwear", "pants"],
    ["pants", "shoes"],
    ["shirt", "jacket"]
  ],
  "nodes": ["hat"]
}
```

```
$ python graph.py deps.json topo-sort
hat -> shirt -> socks -> underwear -> jacket -> pants -> shoes

$ python graph.py deps.json shortest-path underwear shoes
underwear -> pants -> shoes

$ python graph.py deps.json shortest-path hat shoes
No path found.
```

`hat` has no outgoing edges, so it's correctly unreachable to anything —
the CLI reports that cleanly instead of erroring.

## CLI usage

```
graph.py <graph-file.json> shortest-path <start> <end>
graph.py <graph-file.json> topo-sort
```

Graph file format: `{"edges": [["a", "b"], ...], "nodes": ["c", ...]}` —
`nodes` is optional, only needed for nodes with no edges at all.

## Design notes

- `shortest_path` is plain BFS over an unweighted graph — "shortest" means
  fewest edges, not lowest total weight. There's no edge-weight concept
  here at all; that'd be Dijkstra's algorithm, a different tool.
- Ties among nodes with the same in-degree during topological sort are
  broken by sorting node names, so output is deterministic given the same
  input rather than depending on dict insertion order in a way that'd be
  confusing to reason about.

## Running the tests

```
python -m unittest tests.test_graph -v
```

12 tests: direct edges, start==end, correctly picking the shortest of
several available paths (both a 1-vs-3-edge case and a 2-vs-3-edge case,
so it's not just checking "any path" but actually the shortest one),
unreachable and unknown-node cases, respecting edge direction (this is a
*directed* graph), a simple chain and a real multi-constraint DAG for
topological sort, an isolated node being included, cycle detection, and
the empty-graph edge case.
