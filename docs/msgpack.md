# msgpack.js

MessagePack encoder and decoder: JSON-like data in a compact binary form. It
always picks the smallest encoding, handles 64-bit integers with `BigInt`, and
supports the timestamp extension. Decoding is strict. No dependencies.

## Why

MessagePack is small enough to read the whole spec in one sitting, and every
format byte is a decision about sizes: where does a fixed-size form stop and
the next one start? Writing both directions against the spec's own examples
made those boundaries concrete, and it gave me a tool to look inside a
`.msgpack` blob without installing anything.

## API

```js
const { encode, decode, Ext, MsgpackError } = require("./scripts/msgpack.js");

encode({ compact: true, schema: 0 });   // <Buffer 82 a7 63 6f ...>  (18 bytes; JSON is 27)
decode(encode([1, "two", null]));       // [1, 'two', null]
decode(buf, { map: true });             // maps come back as Map, so keys can be anything
encode(new Date(0));                    // timestamp extension, 6 bytes
encode(new Ext(5, Buffer.from("hi")));  // application-specific extension
```

| JS value | MessagePack |
| --- | --- |
| `null`, `undefined` | nil |
| `true` / `false` | bool |
| safe integers | smallest of fixint, uint8-64, int8-64 |
| `BigInt` | uint64 / int64 (error beyond 64 bits) |
| other numbers (`1.5`, `NaN`, `-0`, `2**53`) | float64 |
| string | fixstr, str8/16/32 (UTF-8) |
| `Buffer` / `Uint8Array` | bin8/16/32 |
| array, plain object, `Map` | fixarray/array16/32, fixmap/map16/32 |
| `Date` | timestamp32/64/96, ext type -1 |
| `Ext` | fixext 1/2/4/8/16 or ext8/16/32 |

Decoding gives numbers for any integer that fits in 53 bits, `BigInt` for the
rest, `Buffer` for bin, `Date` for timestamps and `Ext` for other extensions.
Plain-object maps need string keys; use `{ map: true }` otherwise.

## CLI usage

```
msgpack.js [-d] [--hex] [FILE]

  -d     decode
  --hex  read/write the MessagePack as hex text instead of raw bytes
```

Encodes JSON from `FILE` or stdin, or with `-d` decodes MessagePack and
prints JSON. Binary values print as `{"$bin": "<base64>"}`, extensions as
`{"$ext": TYPE, "data": "<base64>"}` and integers beyond 2^53 as strings.

## Real example

```
$ echo '{"compact":true,"schema":0}' | node scripts/msgpack.js --hex
82a7636f6d70616374c3a6736368656d6100

$ echo 82a7636f6d70616374c3a6736368656d6100 | node scripts/msgpack.js -d --hex
{"compact":true,"schema":0}

$ echo c1 | node scripts/msgpack.js -d --hex; echo "exit $?"
msgpack: invalid type byte 0xc1 at offset 0
exit 1
```

## Exit codes

- `0` - success.
- `1` - bad input (invalid JSON, hex or MessagePack) or an unreadable file.
- `2` - unknown option or bad arguments.

## Design notes

- **Smallest form, always.** Integers, lengths and timestamps each pick the
  tightest encoding that fits, so the same value always has the same bytes.
  Tests sit right on each boundary (127/128, 255/256, 31/32 chars, 15/16 items).
- **Numbers vs BigInt.** JS numbers are doubles, so only safe integers are sent
  as ints; `2**53` goes out as a float64 on purpose. 64-bit ints come back as
  `BigInt` only when they don't fit in 53 bits, so small values stay ordinary
  numbers.
- **Floats.** Always float64 on the way out (float32 decodes fine). `-0` stays
  a float so it survives the round trip.
- **Strict decoding.** Truncated input, trailing bytes, the reserved `0xc1`
  byte and invalid UTF-8 are all errors with an offset. A declared length is
  checked against the bytes that are actually there before anything is
  allocated, so `dbffffffff` can't be used to ask for 4 GB.
- **Nesting limit.** 512 levels, both ways; without one a short run of `0x91`
  bytes would overflow the stack.
- **`__proto__` is just a key.** Object keys are defined with
  `defineProperty`, so a hostile map can't change the result's prototype.
- **Timestamps.** The 4-byte form is used for whole seconds from 1970 to 2106,
  the 8-byte form packs nanoseconds with 34 bits of seconds, and the 12-byte
  form covers anything earlier or later.

## Running the tests

```
node --test tests/test_msgpack.js
```

63 tests: 42 byte-exact encodings on size boundaries (and every one decoded
back), 64-bit and BigInt edges, maps, a `__proto__` key, timestamps in all three
forms, extensions of every size, truncated/trailing/invalid input, the depth
limit, 400 random values round-tripping, and the CLI's output and exit codes.
