#!/usr/bin/env python3
"""Print bytes as a canonical hex dump: offset, hex columns, then an ASCII
gutter, with runs of identical lines collapsed to a single "*" like
`hexdump -C`. Reads a file or stdin in chunks, so large files are fine.
Pure stdlib (argparse, sys)."""

import argparse
import sys

CHUNK = 1 << 16


def format_line(offset, chunk, width=16):
    """One dump line for `chunk` (at most `width` bytes) starting at `offset`."""
    cells = []
    for i in range(width):
        if i == width // 2:
            cells.append("")  # extra gap in the middle, as hexdump -C does
        cells.append("%02x" % chunk[i] if i < len(chunk) else "  ")
    ascii_part = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
    return "%08x  %s  |%s|" % (offset, " ".join(cells), ascii_part)


def iter_lines(stream, width=16, skip=0, length=None, squeeze=True):
    """Yield dump lines for a binary stream.

    `skip` bytes are discarded first (offsets still count from the true
    start of the data), `length` caps how many bytes are dumped, and with
    `squeeze` a run of identical full lines becomes one "*". The final line
    is the total offset reached, as in `hexdump -C`.
    """
    if width < 1:
        raise ValueError("width must be at least 1")
    if skip < 0 or (length is not None and length < 0):
        raise ValueError("skip and length must not be negative")

    _discard(stream, skip)
    offset = skip
    remaining = length
    previous = None
    squeezing = False
    pending = b""

    def lines_from(data, final):
        nonlocal offset, previous, squeezing
        pos = 0
        while len(data) - pos >= width or (final and pos < len(data)):
            chunk = data[pos:pos + width]
            pos += len(chunk)
            if squeeze and len(chunk) == width and chunk == previous:
                if not squeezing:
                    squeezing = True
                    yield "*"
            else:
                squeezing = False
                yield format_line(offset, chunk, width)
            previous = chunk if len(chunk) == width else None
            offset += len(chunk)
        return data[pos:]

    while True:
        want = CHUNK if remaining is None else min(CHUNK, remaining)
        if want == 0:
            break
        block = stream.read(want)
        if not block:
            break
        if remaining is not None:
            remaining -= len(block)
        pending = yield from lines_from(pending + block, final=False)
    yield from lines_from(pending, final=True)
    yield "%08x" % offset


def _discard(stream, count):
    # Streams like stdin can't seek, so read and throw away instead.
    while count > 0:
        got = stream.read(min(count, CHUNK))
        if not got:
            return
        count -= len(got)


def parse_int(text):
    return int(text, 0)  # accepts 4096, 0x1000, 0o10


def main(argv=None):
    parser = argparse.ArgumentParser(description="Canonical hex dump.")
    parser.add_argument("file", nargs="?", default="-", help="file to dump, or - for stdin")
    parser.add_argument("-n", "--length", type=parse_int, help="dump only this many bytes")
    parser.add_argument("-s", "--skip", type=parse_int, default=0, help="skip this many bytes first")
    parser.add_argument("-w", "--width", type=parse_int, default=16, help="bytes per line (default 16)")
    parser.add_argument("-v", "--no-squeeze", action="store_true",
                        help="show every line instead of collapsing repeats to *")
    args = parser.parse_args(argv)

    try:
        stream = sys.stdin.buffer if args.file == "-" else open(args.file, "rb")
    except OSError as err:
        print("hexdump: %s" % err, file=sys.stderr)
        return 2
    try:
        for line in iter_lines(stream, args.width, args.skip, args.length, not args.no_squeeze):
            print(line)
    except ValueError as err:
        print("hexdump: %s" % err, file=sys.stderr)
        return 1
    except BrokenPipeError:
        return 0  # e.g. piped into `head`
    finally:
        if stream is not sys.stdin.buffer:
            stream.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
