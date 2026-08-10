#!/usr/bin/env python3
"""Trie (prefix tree) for exact lookup, prefix checks, and autocomplete.
Pure stdlib. O(len(word)) insert/search, independent of how many words
are stored."""

import argparse


class _Node:
    __slots__ = ("children", "is_word")

    def __init__(self):
        self.children = {}
        self.is_word = False


class Trie:
    def __init__(self):
        self._root = _Node()

    def insert(self, word):
        node = self._root
        for ch in word:
            node = node.children.setdefault(ch, _Node())
        node.is_word = True

    def _find_node(self, prefix):
        node = self._root
        for ch in prefix:
            node = node.children.get(ch)
            if node is None:
                return None
        return node

    def search(self, word):
        """Exact match: word was inserted and is a complete entry."""
        node = self._find_node(word)
        return node is not None and node.is_word

    def starts_with(self, prefix):
        """True if any inserted word starts with `prefix` (prefix itself
        need not have been inserted as a word)."""
        return self._find_node(prefix) is not None

    def _collect(self, node, prefix, out, limit):
        if limit is not None and len(out) >= limit:
            return
        if node.is_word:
            out.append(prefix)
        for ch in sorted(node.children):
            if limit is not None and len(out) >= limit:
                return
            self._collect(node.children[ch], prefix + ch, out, limit)

    def autocomplete(self, prefix, limit=None):
        """All inserted words starting with `prefix`, alphabetical order."""
        node = self._find_node(prefix)
        if node is None:
            return []
        out = []
        self._collect(node, prefix, out, limit)
        return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("wordlist", help="Path to a newline-delimited word list")
    parser.add_argument("prefix", help="Prefix to autocomplete")
    parser.add_argument("-n", "--limit", type=int, default=10)
    args = parser.parse_args()

    trie = Trie()
    with open(args.wordlist, encoding="utf-8") as f:
        for line in f:
            word = line.strip()
            if word:
                trie.insert(word)

    for match in trie.autocomplete(args.prefix, args.limit):
        print(match)


if __name__ == "__main__":
    main()
