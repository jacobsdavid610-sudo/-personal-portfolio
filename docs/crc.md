# crc.js

Table-driven CRCs from the Rocksoft parameter model, with a catalogue of
13 common ones built in (CRC-32, CRC-32C, CRC-16/MODBUS, CRC-64/XZ ...) and
support for any width from 8 to 64 bits. No dependencies.

## Why

"CRC-32" names a family, not an algorithm: the polynomial, the starting
value, whether bytes and the result are bit-reversed and what the output is
XORed with all vary, and two CRCs that differ in one setting give unrelated
numbers. The Rocksoft model writes those five choices down, so one small
engine covers all of them. I wanted to see that engine, and to check it
against something stronger than the handful of check values everyone quotes.

## API

```js
const { CRC, crc } = require("./scripts/crc.js");

crc("crc-32", "123456789");                       // 0xcbf43926n (a BigInt)
new CRC("crc-32c").update("1234").update("56789").hex();   // "e3069283"

const c = new CRC({ width: 16, poly: 0x8005, init: 0, refin: true, refout: true, xorout: 0 });
c.update(Buffer.from("123456789")).hex();         // "bb3d" (that's CRC-16/ARC)
c.value;                                          // 0xbb3dn; reading doesn't disturb the state
c.reset();                                        // start again
```

`update` takes a string (UTF-8) or a `Uint8Array` and chains. `value` is
always a `BigInt` (64-bit CRCs don't fit a number); `hex()` is zero-padded to
the width. An unknown algorithm name, a width outside 8-64, or a polynomial,
init or xorout that doesn't fit the width throws `CRCError`; the wrong data
type throws `TypeError`. `selfTest()` returns a list of algorithms that
don't match their published check value (empty when all is well).

## CLI usage

```
crc.js [-a NAME] [FILE...]
crc.js --list | --check

  -a NAME  algorithm, default crc-32 (case-insensitive; see --list)
  --list   show the built-in algorithms
  --check  verify every algorithm against its published check value
```

With no FILE (or `-`) it reads stdin. Files are read in 64 KiB chunks, so
size doesn't matter. Output is `HEX  NAME`, one line per input.

## Real example

```
$ printf 'The quick brown fox jumps over the lazy dog' | node scripts/crc.js
414fa339  -

$ printf 123456789 | node scripts/crc.js -a crc-16/modbus
4b37  -

$ printf 123456789 | node scripts/crc.js -a crc-64/xz
995dc9bbdf1939fa  -

$ node scripts/crc.js notes.txt missing.bin; echo "exit $?"
363a3020  notes.txt
crc: missing.bin: no such file
exit 1

$ node scripts/crc.js --check
all 13 algorithms match their check values
```

## Exit codes

- `0` - success.
- `1` - a file couldn't be read (the others are still done), or `--check` failed.
- `2` - unknown algorithm or option.

## Design notes

- **One engine, five knobs.** `width`, `poly`, `init`, `refin`, `refout`
  and `xorout`. Bytes are fed in as the model says: with `refin` the table
  shifts right and uses the bit-reversed polynomial; without it, it shifts
  left. If `refin` and `refout` disagree the register is reversed once at the
  end.
- **BigInt tables, number loops.** Tables are built in `BigInt` so a
  64-bit polynomial is exact. For widths up to 32 the hot loop converts them
  to plain numbers (several times faster); 33-64 bits use `BigInt` throughout.
- **Check values are tests, not decoration.** Each catalogue entry carries
  the CRC of `"123456789"` from the public catalogue and `selfTest()` verifies
  all of them. It is how I noticed my table code was right, not just plausible.
- **A slow reference as a second opinion.** The tests contain a
  bit-at-a-time CRC written straight from the model's definition, show it
  reproduces the catalogue, then compare it with the table engine on random
  models: widths of 8, 9, 10, 12, 15, 16, 17, 24, 31, 32, 33, 40, 63 and 64, random
  polynomial, init, xorout, and both reflection flags. That is the only thing
  that exercises odd widths and `refin != refout`, since no published
  algorithm uses them.
- **Also checked against zlib.** `crc-32` of 100 KB of random bytes
  equals Node's own `zlib.crc32`, and a 300 KB file goes through the CLI's
  chunked reader to the same answer.
- Not covered: slice-by-8 or hardware (SSE4.2 / PCLMUL) speed-ups, CRCs
  with a width under 8 (the byte-at-a-time table can't express them), and
  combining two CRCs without the data.

## Running the tests

```
node --test tests/test_crc.js
```

15 tests: all 13 published check values, zlib agreement, the iSCSI
CRC-32C vectors (32 zero bytes, 32 `0xff` bytes), name handling, streaming
in random splits for every algorithm, mid-stream reads and reset, UTF-8 and
type errors, zero-padded hex, custom parameters and their validation, 84
random models against the bit-at-a-time reference, that reference against the
catalogue, single-bit-flip detection over every bit of a 64-byte message for
three algorithms, and the CLI (stdin, files, a large file, `--list`,
`--check`, exit codes).
