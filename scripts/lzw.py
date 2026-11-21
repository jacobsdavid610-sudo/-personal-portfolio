#!/usr/bin/env python3
"""LZW compression with variable-width codes, written to be read.

Codes are packed most significant bit first. 0-255 are the bytes
themselves, 256 is CLEAR (reset the table), 257 is END, and new entries
start at 258. Codes begin 9 bits wide and grow to 12; when the table is
full the encoder emits CLEAR and starts over. The stream always ends with
END and is padded with zero bits to a whole byte.

The width rule is the part that is easy to get wrong: the decoder is one
table entry behind the encoder, so both sides take the width from the
encoder's table size, which the decoder works out as its own size plus
one. The decoder refuses anything the encoder would not have written.
Pure stdlib."""

import argparse
import sys

CLEAR = 256
END = 257
FIRST = 258
MIN_WIDTH = 9
MAX_WIDTH = 12
FULL = (1 << MAX_WIDTH) - 1  # 4095: reset before the table needs 13 bits


class LZWError(ValueError):
    """Raised for a stream that is not valid LZW as this module writes it."""


def _width(table_size):
    return max(MIN_WIDTH, table_size.bit_length())


class _BitWriter:
    def __init__(self):
        self.out = bytearray()
        self.acc = 0
        self.nbits = 0

    def write(self, code, width):
        self.acc = (self.acc << width) | code
        self.nbits += width
        while self.nbits >= 8:
            self.nbits -= 8
            self.out.append((self.acc >> self.nbits) & 0xFF)
        self.acc &= (1 << self.nbits) - 1

    def finish(self):
        if self.nbits:
            self.out.append((self.acc << (8 - self.nbits)) & 0xFF)
        return bytes(self.out)


def compress(data):
    data = bytes(data)
    bits = _BitWriter()
    table = {bytes([i]): i for i in range(256)}
    size = FIRST  # the code the next new entry will get
    w = b""
    for byte in data:
        wc = w + bytes([byte])
        if wc in table:
            w = wc
            continue
        bits.write(table[w], _width(size))
        table[wc] = size
        size += 1
        w = bytes([byte])
        if size == FULL:
            bits.write(CLEAR, _width(size))
            table = {bytes([i]): i for i in range(256)}
            size = FIRST
    if w:
        bits.write(table[w], _width(size))
        size += 1  # the decoder adds an entry for this code too
    bits.write(END, _width(size))
    return bits.finish()


def decompress(data):
    data = bytes(data)
    out = bytearray()
    table = [bytes([i]) for i in range(256)] + [b"", b""]  # 256, 257 are placeholders
    prev = None
    pos = 0  # bit position
    total = len(data) * 8
    while True:
        # the encoder's table is one entry ahead of ours once we have a prev
        width = _width(len(table) + (prev is not None))
        if pos + width > total:
            raise LZWError("stream ends before the END code")
        code = 0
        for _ in range(width):
            code = (code << 1) | ((data[pos >> 3] >> (7 - (pos & 7))) & 1)
            pos += 1
        if code == END:
            break
        if code == CLEAR:
            table = table[:FIRST]
            prev = None
            continue
        if code < len(table):
            entry = table[code]
        elif code == len(table) and prev is not None:
            entry = prev + prev[:1]  # the code that is being defined right now
        else:
            raise LZWError(f"invalid code {code} at bit {pos - width}")
        if prev is not None:
            if len(table) >= FULL:
                raise LZWError("table overflow: CLEAR expected")
            table.append(prev + entry[:1])
        out += entry
        prev = entry
    # whatever is left must be the zero padding of the last byte
    if total - pos >= 8:
        raise LZWError(f"{(total - pos) // 8} unexpected bytes after END")
    if pos < total and (data[-1] & ((1 << (total - pos)) - 1)):
        raise LZWError("non-zero padding bits after END")
    return bytes(out)


def main(argv=None, stdin=None, stdout=None, stderr=None):
    stdin = stdin or sys.stdin.buffer
    stdout = stdout or sys.stdout.buffer
    stderr = stderr or sys.stderr
    p = argparse.ArgumentParser(description="LZW-compress stdin or FILE to stdout (-d to decompress).")
    p.add_argument("file", nargs="?")
    p.add_argument("-d", "--decompress", action="store_true")
    args = p.parse_args(argv)
    try:
        if args.file and args.file != "-":
            with open(args.file, "rb") as f:
                data = f.read()
        else:
            data = stdin.read()
    except OSError as err:
        print(f"lzw: {err}", file=stderr)
        return 2
    try:
        result = decompress(data) if args.decompress else compress(data)
    except LZWError as err:
        print(f"lzw: {err}", file=stderr)
        return 1
    stdout.write(result)
    stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
