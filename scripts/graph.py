#!/usr/bin/env python3
"""Adjacency-list directed graph with BFS shortest path (unweighted) and
topological sort (Kahn's algorithm, with cycle detection). Pure stdlib."""

import argparse
import json
from collections import deque


class Graph:
    def __init__(self):
        self._adj = {}

    def add_node(self, node):
        self._adj.setdefault(node, [])

    def add_edge(self, src, dst):
        self.add_node(src)
        self.add_node(dst)
        self._adj[src].append(dst)

    def neighbors(self, node):
        return list(self._adj.get(node, []))

    def nodes(self):
        return list(self._adj.keys())

    def shortest_path(self, start, end):
        """BFS shortest path (fewest edges) from start to end. Returns the
        path as a list of nodes, or None if unreachable."""
        if start not in self._adj or end not in self._adj:
            return None
        if start == end:
            return [start]

        visited = {start}
        queue = deque([[start]])

        while queue:
            path = queue.popleft()
            for neighbor in self._adj[path[-1]]:
                if neighbor == end:
                    return path + [neighbor]
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(path + [neighbor])

        return None

    def topological_sort(self):
        """Kahn's algorithm. Raises ValueError if the graph has a cycle."""
        in_degree = {node: 0 for node in self._adj}
        for node in self._adj:
            for neighbor in self._adj[node]:
                in_degree[neighbor] += 1

        queue = deque(sorted(node for node, deg in in_degree.items() if deg == 0))
        order = []

        while queue:
            node = queue.popleft()
            order.append(node)
            for neighbor in sorted(self._adj[node]):
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        if len(order) != len(self._adj):
            raise ValueError("Graph has at least one cycle; no valid topological order")

        return order


def load_from_json(path):
    """JSON format: {"edges": [["a", "b"], ["b", "c"]], "nodes": ["d"]}
    ("nodes" is optional, for isolated nodes with no edges)."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    graph = Graph()
    for node in data.get("nodes", []):
        graph.add_node(node)
    for src, dst in data.get("edges", []):
        graph.add_edge(src, dst)
    return graph


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("graph_file", help="JSON file: {'edges': [[a,b], ...]}")
    subparsers = parser.add_subparsers(dest="command", required=True)

    path_parser = subparsers.add_parser("shortest-path")
    path_parser.add_argument("start")
    path_parser.add_argument("end")

    subparsers.add_parser("topo-sort")

    args = parser.parse_args()
    graph = load_from_json(args.graph_file)

    if args.command == "shortest-path":
        result = graph.shortest_path(args.start, args.end)
        print(" -> ".join(result) if result else "No path found.")
    elif args.command == "topo-sort":
        try:
            print(" -> ".join(graph.topological_sort()))
        except ValueError as e:
            print(f"Error: {e}")


if __name__ == "__main__":
    main()
