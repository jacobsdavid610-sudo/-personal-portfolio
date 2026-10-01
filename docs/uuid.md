# uuid.js

Generates and parses UUIDs per RFC 9562: random **v4**, and
time-ordered **v7**. No dependencies beyond `node:crypto`.

## Why

`crypto.randomUUID()` already covers v4, but v4 is a bad primary key
for a B-tree index: every insert lands on a random page. v7 puts a
48-bit Unix millisecond timestamp in the first 6 bytes, so ids sort by
creation time and inserts stay at the right-hand edge of the index -
while still being unguessable enough and generated without any
coordination. Node doesn't ship v7, so this does.

## API

```js
const { v4, v7, createV7Generator, parse, isValid } = require("./uuid.js");

v4();                 // "150f5c41-8eec-4ab6-a4e7-5e31bd6eab31"
v7();                 // "01a0f76a-c87a-770f-a46d-7cab453eae2f"
isValid("nope");      // false
parse(v7()).date;     // Date the id was generated
```

- `v4({ random? })` — random UUID; `random(n)` defaults to
  `crypto.randomBytes`.
- `v7()` — uses a shared module-level generator.
- `createV7Generator({ clock?, random? })` — a generator with its own
  monotonic state. `clock` defaults to `Date.now`, injectable for tests
  (same pattern as `memoize.js` and `jwtverify.js`).
- `parse(str)` — returns `{ version, variant, bytes }`, plus
  `{ timestamp, date }` for v7. Throws `TypeError` on anything that
  isn't 8-4-4-4-12 hex. Case-insensitive.
- `isValid(str)` — shape check only, never throws.

## CLI usage

```
node scripts/uuid.js              # one v4
node scripts/uuid.js v7 -n 3      # three v7s
node scripts/uuid.js parse <uuid> # version, variant, created time (v7)
```

## Real example

```
$ node scripts/uuid.js v7 -n 3
01a0f76a-c87a-770f-a46d-7cab453eae2f
01a0f76a-c87f-74d2-9316-f3bd124a9f16
01a0f76a-c880-732a-aacf-048536b3ad79

$ node scripts/uuid.js parse 01a0f76a-c87a-770f-a46d-7cab453eae2f
version: 7
variant: rfc9562
created: 2026-10-01T12:22:48.519Z
```

## Design notes

- **Monotonic within a millisecond.** Two v7s generated in the same ms
  with purely random tails would sort in a random order relative to
  each other. The 12-bit `rand_a` field is used as a counter instead
  (RFC 9562 section 6.2, method 1), seeded from random bits in the lower
  half of its range so there's at least 2048 increments of headroom
  before it overflows.
- **Overflow and clock rollback both move time forward, never back.**
  If the counter runs out inside one ms, or the system clock jumps
  backwards (NTP correction), the generator reuses the last issued
  timestamp + counter and bumps the timestamp by 1ms on overflow. The
  embedded time can drift slightly ahead of real time under heavy
  load; that's the trade for never emitting an id that sorts before
  the previous one.
- **The 48-bit timestamp is split by hand.** JS bitwise operators work
  on 32-bit ints, and current ms timestamps are ~2^40, so
  `ts >>> 40` would silently produce garbage. The high bytes go
  through `Math.floor(ts / 2 ** 16)` first; there's a test with a
  timestamp above 2^47 specifically for this.
- **Version/variant bits always overwrite random bits.** Tested by
  feeding all-`0xff` random bytes and checking the exact output.
- **Out-of-range clocks throw** rather than silently wrapping the
  timestamp into a wrong date.

## Exit codes

`0` success, `1` `parse` given something that isn't a UUID, `2` usage
error (unknown command, bad `-n`).

## Running the tests

```
node --test tests/test_uuid.js
```

13 tests: v4 shape/version/variant over 200 samples, agreement with
`crypto.randomUUID()`, version/variant bits overriding all-`0xff`
random input, v7 timestamp round-trip through `parse`, timestamps above
2^32 not being truncated, lexicographic sort order across
milliseconds, strict ordering of 1000 ids within one millisecond,
counter overflow bumping the timestamp forward, a backwards clock not
producing a smaller id, out-of-range/NaN clocks throwing, parse handling
uppercase and the ncs/rfc9562/microsoft variants, no timestamp exposed
for v4, and a batch of malformed strings being rejected by both
`isValid` and `parse`.
