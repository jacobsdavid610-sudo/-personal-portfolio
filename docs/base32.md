# base32.js

Base32 (RFC 4648): binary data as 32 characters that survive being read
aloud, typed by hand or stored on a case-insensitive filesystem. Both
alphabets from the RFC are here, the usual `A-Z2-7` and the "extended hex"
`0-9A-V`. No dependencies.

## Why

Base32 is what TOTP secrets, onion addresses and a lot of file-name-safe IDs
are written in, and I keep wanting to look at one without reaching for a
library or `base32` from coreutils (which isn't on every machine, and isn't
on this one). It's also a good small exercise: 5 bytes are 40 bits and
8 characters, so every partial group at the end needs its own length,
padding and leftover-bit rules, and the interesting part is how strictly a
decoder should treat them.

## API

```js
const { encode, decode, Base32Error } = require("./scripts/base32.js");

encode("foobar");                          // "MZXW6YTBOI======"
encode("foobar", { pad: false });          // "MZXW6YTBOI"
encode("foobar", { variant: "hex" });      // "CPNMUOJ1E8======"
decode("MZXW6YTBOI======");                // <Buffer 66 6f 6f 62 61 72>
decode("mzxw6ytboi");                      // same: lower case and missing padding are fine
decode("MZ");                              // throws Base32Error: non-zero trailing bits in the last character
```

`encode` takes a string (UTF-8) or a `Uint8Array` and returns a string;
`decode` takes a string and returns a `Buffer`. Bad input throws
`Base32Error`; an argument of the wrong type, or an unknown `variant`,
throws `TypeError`.

## CLI usage

```
base32.js [-d] [--hex] [--no-pad] [-w COLS] [FILE]

  -d        decode
  --hex     use the "extended hex" alphabet (0-9A-V) instead of A-Z2-7
  --no-pad  leave off the trailing = when encoding
  -w COLS   wrap encoded output at COLS characters (0 = never; default 0)
```

Reads `FILE`, or stdin if there is none (or it is `-`). Decoding ignores
line breaks, so wrapped output goes straight back in. Data is handled as
bytes, so binary files round-trip.

## Real example

```
$ printf foobar | node scripts/base32.js
MZXW6YTBOI======

$ printf foobar | node scripts/base32.js --hex --no-pad
CPNMUOJ1E8

$ printf 'The quick brown fox' | node scripts/base32.js -w 16
KRUGKIDROVUWG2ZA
MJZG653OEBTYB===

$ printf 'MZXW6YTBOI======' | node scripts/base32.js -d
foobar

$ printf 'MZXW1YTB' | node scripts/base32.js -d; echo "exit $?"
base32: invalid character "1" at position 4
exit 1
```

## Exit codes

- `0` - success.
- `1` - the input could not be decoded, or the file could not be read.
- `2` - unknown option or bad arguments.

## Design notes

- **Groups of five bytes.** Each group of up to 5 bytes is built as a
  40-bit number (a `BigInt`, since JavaScript's bit operators stop at 32 bits)
  and cut into 5-bit pieces. A final group of 1, 2, 3 or 4 bytes gives 2, 4,
  5 or 7 characters, then `=` up to 8.
- **Only lengths an encoder can produce.** A body of 1, 3 or 6 characters
  (mod 8) can't come from whole bytes and is refused outright, rather than
  being quietly rounded.
- **Padding is optional but never wrong.** `MY` and `MY======` both decode,
  `MY=====` and `MY=======` don't, and an `=` anywhere but the end doesn't.
- **Leftover bits must be zero.** `MY` is `f`. `MZ` has the same first byte
  but different spare bits, and a lenient decoder would call both `f`, which
  gives one value two spellings (a problem for anything that hashes or
  de-duplicates the text). With one kept byte only `A`, `I`, `Q` and `Y` are
  accepted as the second character.
- **Lower case is accepted, other things aren't.** The RFC alphabet is upper
  case, but people type lower case. Only ASCII `a-z` is folded; a
  `toUpperCase()` on everything would turn the Turkish dotless `ı` into `I`
  and accept it.
- **No whitespace skipping in `decode()`.** The CLI strips line breaks
  because it wrote them; the library function treats a space as the error it
  is.
- Not covered: Crockford's variant (which drops I, L, O and U and takes a
  check digit) and z-base-32. Different alphabets, same machinery, if I
  ever need them.

## Running the tests

```
node --test tests/test_base32.js
```

15 tests: all seven RFC 4648 vectors (section 10) in both alphabets and both
directions, padding on and off, case handling, characters from the wrong
alphabet, impossible lengths, every wrong padding length, every non-zero
trailing-bits case after one kept byte, round trips for every length from 0 to
40 in all four option combinations, all 256 byte values, UTF-8 input, type
errors, a comparison with the system `base32` when one exists (skipped
otherwise), and the CLI including wrapping, binary data and exit codes.
