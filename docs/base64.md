# base64.js

Base64 encode/decode, implemented from the actual algorithm — bit-shifting
3 bytes into 4 six-bit groups and back — not `Buffer.from(...).toString
("base64")` or `atob`/`btoa`.

## Why

Everyone uses base64 constantly (data URIs, JWT segments, email
attachments) but few people have actually implemented the bit-packing by
hand. It's a good small exercise in bitwise operators and off-by-one
padding logic, and unlike a lot of "reimplement X" exercises it's easy to
verify correctness against a trusted oracle, since every language ships a
real base64 implementation to check against.

## Honesty about scope

The base64 *algorithm itself* (byte-to-6-bit-group packing, padding with
`=`) is hand-written in `encode`/`decode`, operating on raw bytes
(`Uint8Array`). `encodeText`/`decodeText` use Node's `Buffer` only for the
UTF-8 text ⟷ bytes conversion step (turning a JS string into UTF-8 bytes
and back) — that's a distinct, unrelated problem from base64 itself, and
reimplementing UTF-8 encoding wasn't the point of this exercise.

## Usage

```
base64.js encode <text>
base64.js decode <text>
```

```
$ node base64.js encode "Hello, jacobsdavid610!"
SGVsbG8sIGphY29ic2RhdmlkNjEwIQ==

$ node base64.js decode "SGVsbG8sIGphY29ic2RhdmlkNjEwIQ=="
Hello, jacobsdavid610!
```

## Programmatic API

```js
const { encode, decode, encodeText, decodeText } = require("./base64.js");

encode(Uint8Array.from([77, 97, 110]));  // "TWFu" - operates on raw bytes
decode("TWFu");                          // Uint8Array [77, 97, 110]
encodeText("Man");                        // "TWFu" - convenience wrapper for text
decodeText("TWFu");                       // "Man"
```

## Testing strategy: an independent oracle, not just round-trips

Round-trip tests (`decode(encode(x)) === x`) can pass even if both
directions share the *same* bug and cancel out. To rule that out, the test
suite also checks `encodeText()` output directly against
`Buffer.from(s, "utf8").toString("base64")` — Node's real, independent
implementation — across several sample strings including the empty string
and edge-case lengths (1, 2, 3, 4 chars, to exercise both padding cases).

Also covered: all three padding cases (0/1/2 `=` characters, i.e. input
lengths divisible by 3, `%3==2`, and `%3==1`), round-tripping raw bytes
including `0x00` and `0xff`, and `decode` tolerating stray whitespace/
newlines mixed into the input (real base64 blobs are often line-wrapped).

## Running the tests

```
node --test tests/test_base64.js
```

8 tests, all passing.
