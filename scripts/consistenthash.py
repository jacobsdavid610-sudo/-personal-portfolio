#!/usr/bin/env python3
"""Consistent hashing ring: maps keys onto nodes placed on a hash ring, so
adding or removing a node only reshuffles the keys near it on the ring -
not the whole keyspace. That's the whole point versus `hash(key) %
num_nodes`, where changing the node count remaps nearly every key.
Virtual replicas per node spread each node around the ring instead of
relying on one hash landing somewhere reasonable. Pure stdlib (hashlib +
bisect)."""

import argparse
import bisect
import hashlib
import sys


class ConsistentHashRing:
    def __init__(self, nodes=(), replicas=100):
        if replicas <= 0:
            raise ValueError("replicas must be positive")
        self.replicas = replicas
        self._ring = {}
        self._sorted_hashes = []
        self._nodes = set()
        for node in nodes:
            self.add_node(node)

    @staticmethod
    def _hash(key):
        return int.from_bytes(hashlib.sha256(str(key).encode("utf-8")).digest()[:8], "big")

    def add_node(self, node):
        """Idempotent: adding a node that's already on the ring is a no-op."""
        if node in self._nodes:
            return
        self._nodes.add(node)
        for i in range(self.replicas):
            h = self._hash(f"{node}#{i}")
            self._ring[h] = node
            bisect.insort(self._sorted_hashes, h)

    def remove_node(self, node):
        """Raises KeyError if node was never added."""
        if node not in self._nodes:
            raise KeyError(node)
        self._nodes.discard(node)
        for i in range(self.replicas):
            h = self._hash(f"{node}#{i}")
            del self._ring[h]
            idx = bisect.bisect_left(self._sorted_hashes, h)
            del self._sorted_hashes[idx]

    def get_node(self, key):
        """The node owning key: whichever replica hash is next clockwise
        from key's hash on the ring, wrapping around to the first replica
        past the top. Raises LookupError if the ring has no nodes."""
        if not self._sorted_hashes:
            raise LookupError("ring has no nodes")
        h = self._hash(key)
        idx = bisect.bisect(self._sorted_hashes, h)
        if idx == len(self._sorted_hashes):
            idx = 0
        return self._ring[self._sorted_hashes[idx]]

    def __len__(self):
        return len(self._nodes)

    def __contains__(self, node):
        return node in self._nodes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("nodes_file", help="one node name per line, or '-' for stdin")
    parser.add_argument("--replicas", type=int, default=100, help="virtual replicas per node (default 100)")
    parser.add_argument("--keys", nargs="+", metavar="KEY", help="print which node each KEY maps to, instead of ring stats")
    args = parser.parse_args()

    text = sys.stdin.read() if args.nodes_file == "-" else open(args.nodes_file).read()
    nodes = [line.strip() for line in text.splitlines() if line.strip()]
    if not nodes:
        print("no nodes to add", file=sys.stderr)
        sys.exit(1)

    ring = ConsistentHashRing(nodes=nodes, replicas=args.replicas)

    if args.keys:
        for key in args.keys:
            print(f"{key}: {ring.get_node(key)}")
        return

    print(f"nodes: {len(ring)}")
    print(f"replicas per node: {ring.replicas}")
    print(f"ring size: {len(ring._sorted_hashes)} points")


if __name__ == "__main__":
    main()
