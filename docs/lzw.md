# lzw.py

LZW compression with variable-width codes (the family GIF, TIFF and
`compress` belong to), written to be read in one go. Compresses and
decompresses stdin or a file. Pure stdlib.

## Why

LZW is the first compressor most people meet, and the textbook version
(a dictionary growing by one entry per code) hides the two details that
make real implementations go wrong: the decoder always lags the encoder by
one table entry, so the width of the codes can't be worked out naively, and
a code can refer to the entry being defined right now. I wanted to get both
right, then check them hard enough that I'd believe it.

## API

```python
from lzw import compress, decompress, LZWError

packed = compress(b"TOBEORNOTTOBEORTOBEORNOT")   # 20 bytes for 24
decompress(packed)                               # b"TOBEORNOTTOBEORTOBEORNOT"
decompress(b"\x00")                              # raises LZWError: stream ends before the END code
```

Both take bytes-like objects and return `bytes`. `decompress` raises
`LZWError` (a `ValueError`) for anything `compress` could not have written.

## CLI usage

```
lzw.py [-d] [FILE]

  -d    decompress instead of compress
```

Reads `FILE` or stdin, writes stdout (binary).

## Real example

```
$ python scripts/lzw.py scripts/lzw.py > lzw.py.lzw
$ wc -c < scripts/lzw.py; wc -c < lzw.py.lzw
5012
2541
$ python scripts/lzw.py -d lzw.py.lzw | cmp - scripts/lzw.py && echo identical
identical

$ printf 'TOBEORNOTTOBEORTOBEORNOT' | python scripts/lzw.py | xxd
00000000: 2a13 c844 5279 489c 4f2a 40a0 9068 5c16  *..DRyH.O*@..h\.
00000010: 0f09 8080                                ....

$ printf 'not lzw' | python scripts/lzw.py -d; echo "exit $?"
lzw: stream ends before the END code
exit 1
```

## Exit codes

- `0` - success.
- `1` - the input isn't a valid stream (decompress only).
- `2` - the file could not be read.

## Design notes

- **Format.** Codes are packed most significant bit first. 0-255 are
  bytes, 256 is CLEAR, 257 is END, new entries start at 258. Widths start at
  9 bits and reach 12. The table is full at 4095 entries, where the encoder
  writes CLEAR and starts again. The stream ends with END and zero padding
  to a byte.
- **The width rule.** Both sides take the width from the *encoder's*
  table size, `max(9, size.bit_length())`. The decoder is one entry behind
  (it can't add an entry until it has seen the next code), so it uses its own
  size plus one, except right after a CLEAR when there is nothing to lag. After
  the last data code the encoder bumps its size once more before writing END,
  because the decoder will add that entry too; leaving that out only goes
  wrong when the final table size lands exactly on a power of two (511,
  1023...), so there is a test that walks prefixes through each boundary.
- **The code that isn't there yet.** `aaaa` produces a code for an entry the
  decoder hasn't built (it's the previous string plus its own first byte). The
  decoder handles it, and only when there *is* a previous string.
- **Strict decoder.** Refused: truncation or a missing END, a code beyond
  the table, a first code after CLEAR that isn't a byte, a table that grows
  past 4095 without CLEAR, bytes after END, and non-zero padding bits. Each
  stream then has one valid reading.
- **Not a file format.** There's no header, length or checksum; `-d` on
  the wrong file is detected only when it fails to parse, and a corrupted
  stream that still happens to parse gives the wrong output silently.
- **Speed.** The encoder keys a dict by `bytes`, which copies on every
  step, so it's quadratic-ish on long matches. Fine for files of a few MB,
  not a replacement for `zlib`.

## Running the tests

```
python -m unittest tests.test_lzw
```

25 tests: the classic `TOBEORNOT...` code sequence (shifted for our code
numbers), exact bytes for small inputs, the `aaaa` case, round trips of
edge cases, random data over 1, 2, 4, 16 and 256-symbol alphabets, 200 KB with
many table resets, prefixes on either side of every code-width boundary, a
check that widths and CLEAR really occur, every kind of bad stream (truncated,
no END, bad code, bad first code, trailing bytes, padding, overflow, 500
random garbage inputs that must never crash), and the CLI.
