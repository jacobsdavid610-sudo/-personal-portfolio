#!/usr/bin/env python3
"""LRU cache with O(1) get/put: a dict for lookup plus a doubly linked
list for recency order. Pure stdlib, no functools.lru_cache shortcut -
this is the actual data structure, not a wrapper around it."""


class _Node:
    __slots__ = ("key", "value", "prev", "next")

    def __init__(self, key=None, value=None):
        self.key = key
        self.value = value
        self.prev = None
        self.next = None


class LRUCache:
    def __init__(self, capacity):
        if capacity <= 0:
            raise ValueError("capacity must be positive")

        self.capacity = capacity
        self._map = {}

        # Sentinel head/tail so add/remove never need null checks.
        # head.next ... most recently used ... tail.prev is least recently used.
        self._head = _Node()
        self._tail = _Node()
        self._head.next = self._tail
        self._tail.prev = self._head

    def _remove(self, node):
        node.prev.next = node.next
        node.next.prev = node.prev

    def _push_front(self, node):
        node.next = self._head.next
        node.prev = self._head
        self._head.next.prev = node
        self._head.next = node

    def get(self, key, default=None):
        node = self._map.get(key)
        if node is None:
            return default
        self._remove(node)
        self._push_front(node)
        return node.value

    def __contains__(self, key):
        return key in self._map

    def put(self, key, value):
        existing = self._map.get(key)
        if existing is not None:
            existing.value = value
            self._remove(existing)
            self._push_front(existing)
            return

        if len(self._map) >= self.capacity:
            lru = self._tail.prev
            self._remove(lru)
            del self._map[lru.key]

        node = _Node(key, value)
        self._map[key] = node
        self._push_front(node)

    def __len__(self):
        return len(self._map)

    def keys_by_recency(self):
        """Most recently used first. For debugging/tests, not the hot path."""
        keys = []
        node = self._head.next
        while node is not self._tail:
            keys.append(node.key)
            node = node.next
        return keys


def main():
    cache = LRUCache(3)
    for key in ["a", "b", "c", "a", "d"]:
        cache.put(key, key.upper())
        print(f"put {key!r}  -> order (most recent first): {cache.keys_by_recency()}")


if __name__ == "__main__":
    main()
