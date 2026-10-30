# hexdump.py

Prints bytes as a canonical hex dump: an offset, the bytes in hex, then an
ASCII gutter, with runs of identical lines collapsed to a single `*`, in
the style of `hexdump -C`. Reads a file or stdin in chunks. Pure stdlib
(`argparse`, `sys`).

## Why

I want to look at the bytes of a file often enough (a file that won't parse,
a binary protocol, a stray BOM or CRLF in a text file), and `hexdump` and
`xxd` aren't installed on every machine I use, Windows included. I also
wanted the output usable from Python, so a test can compare a dump to the
expected text.

## API

```python
import hexdump

hexdump.format_line(0, b"Hello, World!\n\x00\x01")
# '00000000  48 65 6c 6c 6f 2c 20 57  6f 72 6c 64 21 0a 00 01  |Hello, World!...|'

with open("data.bin", "rb") as fh:
    for line in hexdump.iter_lines(fh, width=16, skip=0, length=None, squeeze=True):
        print(line)
```

- `format_line(offset, chunk, width=16)` - one dump line.
- `iter_lines(stream, width=16, skip=0, length=None, squeeze=True)` -
  yields lines from a binary stream, ending with the total offset.
  Raises `ValueError` for a width under 1 or a negative `skip`/`length`.

## CLI usage

```
python scripts/hexdump.py [FILE] [-s SKIP] [-n LENGTH] [-w WIDTH] [-v]
```

`FILE` defaults to stdin (`-`). Numbers accept `0x` hex, so `-s 0x10` works.
`-v` turns off the `*` collapsing.

## Real example

```
$ printf 'Hello, World!\n\x00\x01\xff' | python scripts/hexdump.py
00000000  48 65 6c 6c 6f 2c 20 57  6f 72 6c 64 21 0a 00 01  |Hello, World!...|
00000010  ff                                                |.|
00000011
$ python -c "import sys; sys.stdout.buffer.write(b'A'*80 + b'xyz')" | python scripts/hexdump.py
00000000  41 41 41 41 41 41 41 41  41 41 41 41 41 41 41 41  |AAAAAAAAAAAAAAAA|
*
00000050  78 79 7a                                          |xyz|
00000053
```

## Design notes

- **It streams.** The input is read in 64 KiB chunks and a partial line is
  carried into the next chunk, so a multi-gigabyte file doesn't have to fit
  in memory. A test re-runs the same data at read sizes from 1 to 1000 bytes
  and checks the output is identical, because the easy bug here is a line
  that changes depending on where the chunk boundary fell.
- **Squeezing works across chunks.** The previous full line is remembered
  between reads, so a run of identical lines that spans a chunk boundary
  still collapses to one `*`.
- **Offsets are true offsets.** With `-s 2` the first line is labelled
  `00000002`, not `00000000`, so offsets match what a debugger or `cmp`
  would say.
- **`-s` reads and discards.** stdin can't seek, so skipping works on pipes
  too, at the cost of reading the skipped bytes.
- **A short last line is never squeezed**, even if its bytes match the line
  before. A partial line isn't a repeat of a full one.
- **The last line is the total length**, so you can see the size of what
  you dumped.
- **ASCII gutter:** only `0x20`-`0x7e` are shown as themselves; everything
  else is `.`, which keeps terminal control bytes out of your output.

## Exit codes (CLI)

- `0` - success (including a closed pipe, e.g. `| head`).
- `1` - invalid width, skip or length.
- `2` - the file couldn't be opened.

## Running the tests

```
python -m unittest tests/test_hexdump.py
```

28 tests: line layout and padding, offset formatting, non-printable bytes
and the printable range edges, empty input, the closing offset, widths,
squeezing (basic, two lines, `-v`, separate runs, partial last line),
`skip`, `length` and both together, skipping past the end, invalid
arguments, identical output at every read size, squeezing across a chunk
boundary, skip/length across small chunks, and the CLI (stdin, file with
hex numbers, missing file, bad width, `-v`).
