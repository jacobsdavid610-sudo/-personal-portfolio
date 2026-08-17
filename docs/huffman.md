# huffman.py

Compresses and decompresses a file using Huffman coding: a variable-length,
prefix-free binary code built from byte frequencies, where common bytes get
shorter codes and rare bytes get longer ones.

## Why

The classic "build a real compressor" exercise — it's a good test of getting
a binary tree, a min-heap, and bit-packing all correct at once, and unlike a
lot of toy implementations this one actually round-trips arbitrary binary
data (not just ASCII text) and produces a self-contained file you can decode
without re-supplying the original.

## Usage

```
huffman.py -c INFILE [-o OUTFILE]   # compress
huffman.py -d INFILE [-o OUTFILE]   # decompress
```

- `-c, --compress` / `-d, --decompress` — mutually exclusive, one is required.
- `-o, --output` — where to write the result. Defaults to stdout (compressed
  or decompressed bytes are written raw, so redirect to a file when using
  stdout on a terminal).
- Compression also prints a size summary to stderr: `9000 -> 5175 bytes (57.5%)`.

## Example

```
$ python huffman.py -c report.txt -o report.huf
9000 -> 5175 bytes (57.5%)
$ python huffman.py -d report.huf -o report.decoded.txt
$ diff report.txt report.decoded.txt && echo identical
identical
```

## File format

```
"HUF1"                              4 bytes, magic
original length                     4 bytes, big-endian uint32
number of distinct byte values      2 bytes, big-endian uint16
for each distinct byte value:
    symbol                          1 byte
    frequency                       4 bytes, big-endian uint32
packed code bits                    remaining bytes, MSB-first, zero-padded
```

The frequency table (not the tree or the codes themselves) is what's stored;
the decoder rebuilds the exact same tree from the frequencies, since the
tree-building algorithm is deterministic. Storing frequencies is more compact
than storing the tree shape for typical inputs, and the two are equivalent —
same frequencies always produce the same tree.

## Exit codes

- `0` — success.
- non-zero (via a raised exception) — malformed compressed input (bad magic
  bytes), or the CLI's own file-not-found / bad-argument errors.

## Design notes

- A single distinct byte value (or an empty file) is a degenerate case for
  Huffman coding, since a "tree" with one leaf would need a zero-length code.
  Handled explicitly: one distinct symbol always gets code `"0"`, and an
  empty input skips the tree entirely (header alone decodes back to `b""`).
- The final byte of packed bits is zero-padded; decoding stops once
  `original length` symbols have been emitted, so trailing pad bits are never
  misread as a spurious extra symbol.
- Pure stdlib (`heapq`, `struct`, `itertools`) — no external compression
  library involved, so the ratio reflects this implementation, not zlib.

## Running the tests

```
python -m unittest tests.test_huffman -v
```

Covers round-tripping empty input, a single repeated byte, two symbols,
ordinary text, all 256 possible byte values, random binary data, and that a
skewed distribution actually compresses smaller than the input. A second
group asserts the Huffman *prefix property* directly (no code is a prefix of
another) and that more frequent symbols never get longer codes than rarer
ones.
