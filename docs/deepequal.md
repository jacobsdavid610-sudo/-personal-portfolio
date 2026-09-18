# deepequal.js

Deep structural equality for JS values: objects, arrays, `Date`,
`RegExp`, `Map`, `Set`, and values containing circular references. No
dependencies.

## Why

The two obvious ways to compare two values for "are these the same
data" both have sharp edges. `a === b` only ever says yes for primitives
or the exact same object reference - it can't tell you `{a:1}` and
`{a:1}` hold the same data. `JSON.stringify(a) === JSON.stringify(b)`
gets further but is order-sensitive on object keys (`{a:1,b:2}` and
`{b:2,a:1}` stringify differently), can't represent `NaN`/`undefined`/
`Map`/`Set`/`Date` correctly, and throws outright on a circular
reference. Walking both values in parallel and comparing primitives with
`Object.is` (so `NaN` equals `NaN`, but `+0` and `-0` don't - the same
`SameValue` rule Node's own `assert.deepStrictEqual` uses) fixes all of
that at once, at the cost of writing the recursion once instead of
getting it from a one-liner.

## API

```js
const { deepEqual } = require("./deepequal.js");

deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 }); // true - key order doesn't matter
deepEqual([1, 2, 3], [3, 2, 1]);            // false - array order does
deepEqual(NaN, NaN);                         // true
deepEqual(0, -0);                             // false
deepEqual(new Date(2020, 0, 1), new Date(2020, 0, 1)); // true
deepEqual(new Set([1, 2]), new Set([2, 1]));            // true
```

- `deepEqual(a, b)` — returns a boolean. Objects are compared by their
  own enumerable keys (order-independent); arrays by index and length
  (order-sensitive); `Date`s by `getTime()`; `RegExp`s by `source` +
  `flags`; `Map`s and `Set`s by their entries/values, matched by deep
  equality rather than reference so two different-but-equal-shaped
  object keys/elements still count as a match. A value containing a
  circular reference is compared safely instead of overflowing the
  stack.

## CLI usage

```
deepequal.js <a.json | -> <b.json | ->
```

Reads two JSON documents (one may come from stdin as `-`) and prints
`equal` or `not equal`. Since `Date`/`RegExp`/`Map`/`Set`/`NaN`/circular
references can't round-trip through JSON, the CLI only exercises the
plain object/array/primitive path - the richer type handling is there
for programmatic use of `deepEqual` directly.

## Real example

```
$ echo '{"a":1,"b":[1,2,3]}' > a.json
$ echo '{"b":[1,2,3],"a":1}' > b.json
$ deepequal.js a.json b.json
equal

$ echo '{"a":1,"b":[1,2,4]}' > c.json
$ deepequal.js a.json c.json
not equal
```

## Design notes

- **`Object.is`, not `===`, for the primitive base case.** `===` treats
  `NaN !== NaN` and `+0 === -0`, which is almost never what you want when
  asking "do these two values represent the same data" - `Object.is`
  flips both of those, matching how `assert.deepStrictEqual` already
  behaves in Node.
- **Cycle guard via a `seen` map of in-progress `(a, b)` pairs, not a
  depth limit.** Before recursing into a pair of objects, the pair is
  recorded; if the same pair is encountered again further down the
  recursion (because one or both sides looped back on themselves), it's
  assumed equal rather than re-compared - the standard coinductive rule
  for structural equality on graphs that may contain cycles. Verified
  directly against a self-referencing object, two objects that
  reference each other, and a value containing itself inside an array,
  not just asserted to work.
- **`Map`/`Set` comparison matches by deep equality with consumption,
  not `Map.get`/`Set.has`.** `Map.has(key)` and `Set.has(value)` use
  reference equality (well, `SameValueZero`) under the hood, so two
  different objects with identical contents used as a key or stored as
  an element would never match through the built-in lookup. Instead each
  entry/value from `a` searches the remaining pool from `b` for a deep
  match and removes it once matched, which also stops one `b` entry from
  satisfying two different `a` entries. This is O(n^2) in the number of
  entries, which is a fine trade for a comparison utility and worth
  knowing if it's ever pointed at very large maps/sets.
- **An array and a plain object are never equal, even with matching
  numeric keys** (`[1, 2]` vs `{0: 1, 1: 2}`) - `Array.isArray` is
  checked before falling into either comparison branch, so the two
  shapes are kept distinct instead of numeric-keyed objects silently
  passing as arrays.

## Exit codes

`0` if the two inputs are deeply equal, `1` if they aren't, `2` if
either file is missing or isn't valid JSON, or if the CLI wasn't given
exactly two arguments.

## Running the tests

```
node --test tests/test_deepequal.js
```

20 tests: primitive equality and cross-type inequality (`1` vs `"1"`,
`null` vs `undefined`, `0` vs `false`), `NaN` equaling `NaN` and `+0`
not equaling `-0`, object key-order independence, a missing key not
equaling an explicit `undefined`, an extra key breaking equality, deep
nested-structure comparison catching a change three levels down, array
order-sensitivity and length mismatches, an array never equaling a
same-shaped plain object, `Date` comparison by timestamp, `RegExp`
comparison by source and flags, `Set`/`Map` equality regardless of
insertion order and with object elements/keys matched structurally
rather than by reference, and three circular-reference cases (self-
reference, mutual cross-reference, and a value nested inside an array
that loops back to itself) all resolving without throwing. All passing.
Also ran the CLI by hand against small piped and file-based JSON pairs
in both the equal and not-equal cases, plus a missing-file error case,
before committing.
