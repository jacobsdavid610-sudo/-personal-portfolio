# duration.js

Parses and formats human durations: `"1h30m"` becomes `5400000`
(milliseconds) and back to `"1h 30m"`. Units are `w`, `d`, `h`, `m`
(minutes), `s` and `ms`. No dependencies.

## Why

Timeouts, cache lifetimes and retry delays end up as bare numbers in
config (`timeout: 5400000`) and nobody can read them. They are also easy to
get wrong by a factor of 1000 or 60. Writing `1h30m` in config and printing
`1h 30m` in logs removes both problems, and I wanted the two directions to
agree exactly.

## API

```js
const { parse, format } = require("./scripts/duration.js");

parse("1h30m");              // 5400000
parse("1.5h");               // 5400000
parse("-2d 3h");             // -183600000

format(93784000);            // "1d 2h 3m 4s"
format(93784000, { maxUnits: 2 });   // "1d 2h"
format(-1500);               // "-1s 500ms"
format(0);                   // "0ms"
```

## CLI usage

```
duration.js [-n MAXUNITS] DURATION          print milliseconds
duration.js [-n MAXUNITS] -f MILLISECONDS   print a readable duration
```

## Real example

```
$ node scripts/duration.js 1h30m
5400000
$ node scripts/duration.js -f 93784000
1d 2h 3m 4s
$ node scripts/duration.js -n 2 -f 93784000
1d 2h
$ node scripts/duration.js 90
duration: not a duration: "90"
```

## Exit codes

- `0` - success.
- `1` - the input is not a duration or number, or the value is too large.
- `2` - usage error (wrong number of arguments, bad `-n`).

## Design notes

- **A bare number is an error.** `parse("90")` could mean 90 ms or 90
  seconds, and guessing is how the factor-of-1000 mistakes happen. A unit is
  always required.
- **`m` is minutes, `ms` is milliseconds.** The pattern tries `ms` first, so
  `1m1ms` is 60001. Units are case sensitive, which means `1M` is rejected
  instead of being read as minutes or months.
- **A repeated unit is an error.** `1h1h` is nearly always a typo, so it is
  refused rather than added up.
- **Order is free.** `30m1h` is the same as `1h30m`.
- **Fractions are rounded once, at the end.** `0.1s` is `0.1 * 1000`, which is
  `100.00000000000001` in floating point; the sum is rounded to whole
  milliseconds so that noise never reaches the caller.
- **No negative zero.** `-0s` and `-0.4ms` are `0`, not `-0`, which would
  otherwise fail a strict equality check.
- **Too-large values are refused.** Anything that would not be an exact
  integer in a double throws a `RangeError` rather than returning a number
  that has silently lost precision.
- **`maxUnits` truncates.** `1d 2h 3m` with `maxUnits: 2` is `1d 2h`, not a
  rounded `1d 2h`. That is what you want for a log line, and it never
  claims more time than has passed.
- **No months or years.** They are not a fixed length, so there is no honest
  number of milliseconds to give them. Weeks are the largest unit.

## Running the tests

```
node --test tests/test_duration.js
```

36 tests: each unit, `m` versus `ms`, combined units in any order,
whitespace, fractions and floating-point noise, rounding, negatives and
negative zero, repeated units, thirteen kinds of invalid text, non-strings,
overflow and the largest exact value, formatting (single units, combined,
weeks, zero, negatives, rounding, `maxUnits`), a format-then-parse round
trip, and the CLI including its exit codes.
