#!/usr/bin/env python3
"""LFU cache with O(1) get/put: evicts the least-frequently-used key,
breaking ties by least-recently-used, without ever scanning all entries to
find the eviction candidate. Uses the classic frequency-bucket structure -
a dict of key->node plus one doubly linked list per hit-count, and a
tracked minimum frequency - rather than a heap (O(log n) per op) or a
plain frequency dict (O(n) scan to find the minimum). Pure stdlib."""


class _Node:
    __slots__ = ("key", "value", "freq", "prev", "next")

    def __init__(self, key=None, value=None):
        self.key = key
        self.value = value
        self.freq = 1
        self.prev = None
        self.next = None


class _FreqList:
    """Doubly linked list of nodes that currently share one frequency,
    sentinel-headed so add/remove never need null checks. Most-recently-
    touched-at-this-frequency sits at the front, so popping from the back
    gives the least-recently-used node as the tie-break within a frequency."""

    __slots__ = ("head", "tail")

    def __init__(self):
        self.head = _Node()
        self.tail = _Node()
        self.head.next = self.tail
        self.tail.prev = self.head

    def is_empty(self):
        return self.head.next is self.tail

    def push_front(self, node):
        node.next = self.head.next
        node.prev = self.head
        self.head.next.prev = node
        self.head.next = node

    def remove(self, node):
        node.prev.next = node.next
        node.next.prev = node.prev

    def pop_back(self):
        node = self.tail.prev
        self.remove(node)
        return node


class LFUCache:
    def __init__(self, capacity):
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        self.capacity = capacity
        self._map = {}
        self._freq_lists = {}
        self._min_freq = 0

    def _bump(self, node):
        """Move node from its current frequency bucket to the next one up,
        advancing _min_freq if that emptied out the bucket it was tracking."""
        old_freq = node.freq
        bucket = self._freq_lists[old_freq]
        bucket.remove(node)
        if bucket.is_empty():
            del self._freq_lists[old_freq]
            if self._min_freq == old_freq:
                self._min_freq += 1

        node.freq += 1
        self._freq_lists.setdefault(node.freq, _FreqList()).push_front(node)

    def get(self, key, default=None):
        node = self._map.get(key)
        if node is None:
            return default
        self._bump(node)
        return node.value

    def __contains__(self, key):
        return key in self._map

    def put(self, key, value):
        existing = self._map.get(key)
        if existing is not None:
            existing.value = value
            self._bump(existing)
            return

        if len(self._map) >= self.capacity:
            evict_bucket = self._freq_lists[self._min_freq]
            evicted = evict_bucket.pop_back()
            del self._map[evicted.key]
            if evict_bucket.is_empty():
                del self._freq_lists[self._min_freq]

        node = _Node(key, value)
        self._map[key] = node
        self._freq_lists.setdefault(1, _FreqList()).push_front(node)
        self._min_freq = 1

    def __len__(self):
        return len(self._map)

    def frequency_of(self, key):
        """Current hit-count for key, or None if it isn't cached. For
        debugging/tests, not part of the hot path."""
        node = self._map.get(key)
        return node.freq if node else None


def main():
    cache = LFUCache(2)
    for key in ["a", "b", "a", "c", "a", "b"]:
        cache.put(key, key.upper())
        print(f"put {key!r} -> size={len(cache)}, freq({key!r})={cache.frequency_of(key)}")


if __name__ == "__main__":
    main()
