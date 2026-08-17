#!/usr/bin/env python3
"""Huffman coding: compress/decompress a file with a canonical binary-tree
codec built from byte frequencies. Pure stdlib, no dependencies."""

import argparse
import heapq
import itertools
import struct
import sys

MAGIC = b"HUF1"


class _Node:
    __slots__ = ("freq", "symbol", "left", "right")

    def __init__(self, freq, symbol=None, left=None, right=None):
        self.freq = freq
        self.symbol = symbol
        self.left = left
        self.right = right

    def is_leaf(self):
        return self.left is None and self.right is None


def build_tree(freqs):
    """freqs: dict[int byte -> int count], at least one entry."""
    counter = itertools.count()
    heap = [(freq, next(counter), _Node(freq, symbol=sym)) for sym, freq in freqs.items()]
    heapq.heapify(heap)

    if len(heap) == 1:
        # Single distinct symbol: give it a real code (length 1) instead of
        # a degenerate zero-length one, by pairing it with an empty node.
        freq, _, node = heap[0]
        return _Node(freq, left=node, right=_Node(0))

    while len(heap) > 1:
        f1, _, n1 = heapq.heappop(heap)
        f2, _, n2 = heapq.heappop(heap)
        merged = _Node(f1 + f2, left=n1, right=n2)
        heapq.heappush(heap, (merged.freq, next(counter), merged))

    return heap[0][2]


def build_codes(root):
    codes = {}
    stack = [(root, "")]
    while stack:
        node, prefix = stack.pop()
        if node.is_leaf():
            if node.symbol is not None:
                codes[node.symbol] = prefix or "0"
            continue
        if node.left is not None:
            stack.append((node.left, prefix + "0"))
        if node.right is not None:
            stack.append((node.right, prefix + "1"))
    return codes


def _pack_bits(bits):
    """Pack a string of '0'/'1' chars into bytes, MSB first, zero-padded."""
    pad = (-len(bits)) % 8
    bits += "0" * pad
    out = bytearray(len(bits) // 8)
    for i in range(0, len(bits), 8):
        out[i // 8] = int(bits[i:i + 8], 2)
    return bytes(out), pad


def _unpack_bits(data, nbits):
    bits = []
    for byte in data:
        bits.append(f"{byte:08b}")
    return "".join(bits)[:nbits]


def compress(data):
    if not data:
        return MAGIC + struct.pack(">IH", 0, 0)

    freqs = {}
    for b in data:
        freqs[b] = freqs.get(b, 0) + 1

    tree = build_tree(freqs)
    codes = build_codes(tree)

    bits = "".join(codes[b] for b in data)
    packed, _pad = _pack_bits(bits)

    header = MAGIC + struct.pack(">IH", len(data), len(freqs))
    table = b"".join(struct.pack(">BI", sym, freq) for sym, freq in freqs.items())
    return header + table + packed


def decompress(blob):
    if blob[:4] != MAGIC:
        raise ValueError("not a huffman-compressed stream (bad magic)")

    orig_len, num_symbols = struct.unpack(">IH", blob[4:10])
    if orig_len == 0:
        return b""

    offset = 10
    freqs = {}
    for _ in range(num_symbols):
        sym, freq = struct.unpack(">BI", blob[offset:offset + 5])
        freqs[sym] = freq
        offset += 5

    tree = build_tree(freqs)

    if len(freqs) == 1:
        (only_symbol,) = freqs.keys()
        return bytes([only_symbol]) * orig_len

    bits = _unpack_bits(blob[offset:], (len(blob) - offset) * 8)

    out = bytearray()
    node = tree
    for bit in bits:
        node = node.left if bit == "0" else node.right
        if node.is_leaf():
            out.append(node.symbol)
            if len(out) == orig_len:
                break
            node = tree

    return bytes(out)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("-c", "--compress", action="store_true")
    group.add_argument("-d", "--decompress", action="store_true")
    parser.add_argument("infile", help="Input file")
    parser.add_argument("-o", "--output", help="Output file (default: stdout)")
    args = parser.parse_args()

    with open(args.infile, "rb") as f:
        data = f.read()

    if args.compress:
        result = compress(data)
        ratio = (len(result) / len(data) * 100) if data else 100.0
        print(f"{len(data)} -> {len(result)} bytes ({ratio:.1f}%)", file=sys.stderr)
    else:
        result = decompress(data)

    if args.output:
        with open(args.output, "wb") as f:
            f.write(result)
    else:
        sys.stdout.buffer.write(result)


if __name__ == "__main__":
    main()
