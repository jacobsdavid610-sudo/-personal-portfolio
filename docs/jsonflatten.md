# jsonflatten.js

Flattens nested JSON into one level of path keys and back:
`{"a": {"b": [1, 2]}}` becomes `{"a.b[0]": 1, "a.b[1]": 2}`. Round-trips
exactly, including empty objects and arrays and keys with dots or
brackets in them. No dependencies.

## Why

Config files, API responses and log records are nested, but `diff`,
`grep`, spreadsheets and environment variables are flat. One line per
leaf makes a nested document greppable and diffable. The part I wanted
right is the way back: flattening is easy, but a flatten that can't be
reversed exactly isn't much use for editing a value and writing it out
again.

## API

```js
const { flatten, unflatten, parsePath } = require("./scripts/jsonflatten.js");

flatten({ a: { b: [1, { c: null }] }, d: {} });
// { "a.b[0]": 1, "a.b[1].c": null, d: {} }

unflatten({ "a.b[0]": 1, "a.b[1].c": null, d: {} });
// { a: { b: [1, { c: null }] }, d: {} }

parsePath("a.b[2].c");   // ["a", "b", 2, "c"]
```

- `flatten(value)` - plain object of path to leaf. Throws `RangeError`
  for an empty object key.
- `unflatten(flat)` - throws `TypeError` for non-object input, `Error`
  for contradictory paths or a gap in an array, and `SyntaxError` for a
  malformed path.
- `parsePath(path)` - keys come back as strings, array indexes as numbers.

## CLI usage

```
node scripts/jsonflatten.js [--unflatten] [FILE]
```

Reads `FILE`, or stdin if it's omitted or `-`, and prints JSON.

## Real example

```
$ echo '{"a":{"b":[1,{"c":null}],"d.e":{},"k[0]":2},"x":[]}' | node scripts/jsonflatten.js
{
  "a.b[0]": 1,
  "a.b[1].c": null,
  "a.d\\.e": {},
  "a.k\\[0\\]": 2,
  "x": []
}
$ echo '{"a":1,"a.b":2}' | node scripts/jsonflatten.js -u; echo $?
jsonflatten: "a.b" conflicts with another path
1
```

The doubled backslashes are JSON escaping; the actual keys are `a.d\.e`
and `a.k\[0\]`.

## Design notes

- **Array indexes are `[n]`, object keys are `.key`.** Writing both as
  `a.0` would make the object `{"0": "x"}` and the array `["x"]` flatten
  to the same thing, and `unflatten` would have to guess.
- **Empty `{}` and `[]` are leaves.** Otherwise they flatten to nothing
  and vanish on the way back.
- **`.`, `[`, `]` and `\` in a key are escaped with a backslash.** So
  `{"a.b": 1}` and `{"a": {"b": 1}}` give different keys.
- **Empty keys are refused.** The path of a top-level scalar is `""`, so
  `{"": 1}` would look identical to the value `1`. Throwing is better
  than writing something that reads back as the wrong thing.
- **Contradictions are errors.** `a` as a leaf plus `a.b` can't both be
  true. `unflatten` only descends into containers it built itself, so a
  literal `{}` leaf at `a` followed by `a.b` is caught too.
- **`__proto__` is an ordinary key.** Values are set with
  `Object.defineProperty`, so `{"__proto__.polluted": true}` can't
  change `Object.prototype`.
- **A gap in array indexes is an error**, rather than a sparse array
  that serialises as `null` and quietly changes the data.

## Exit codes (CLI)

- `0` - success.
- `1` - invalid JSON, a malformed or conflicting path, or an empty key.
- `2` - the file couldn't be read.

## Running the tests

```
node --test tests/test_jsonflatten.js
```

21 tests: nested objects, arrays, a top-level array, `null`/`false`/`0`/`""`
kept as leaves, empty containers, a top-level scalar, key escaping,
numeric keys versus array indexes, empty keys throwing, `parsePath` on
good and malformed paths, rebuilding, round trips on awkward structures,
each kind of conflict, array gaps, `__proto__` not polluting the
prototype, non-object input, and the CLI (stdin, `--unflatten`, exit
codes 1 and 2).
