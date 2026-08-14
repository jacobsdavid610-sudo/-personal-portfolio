# querystring.js

URL query string `parse`/`stringify`, built from scratch — no
`URLSearchParams`. Follows the classic `application/x-www-form-urlencoded`
convention: spaces encode as `+`, not `%20`.

## Usage

```js
const { parse, stringify } = require("./querystring.js");

parse("?name=Kaja+Obinna&tag=js&tag=node");
// { name: "Kaja Obinna", tag: ["js", "node"] }

stringify({ q: "hello world", tag: ["a", "b"] });
// "q=hello+world&tag=a&tag=b"
```

## Real example

```
$ node -e "
const { parse, stringify } = require('./scripts/querystring.js');
const url = '?name=Kaja+Obinna&role=engineer&tag=js&tag=node&empty';
console.log('parsed:', parse(url));
const built = stringify({ q: 'hello world', tag: ['a', 'b'], skip: null });
console.log('built:', built);
console.log('round-trip:', parse(built));
"
parsed: {
  name: 'Kaja Obinna',
  role: 'engineer',
  tag: [ 'js', 'node' ],
  empty: ''
}
built: q=hello+world&tag=a&tag=b
round-trip: { q: 'hello world', tag: [ 'a', 'b' ] }
```

`skip: null` in the input to `stringify` produces no `skip=` in the
output at all — see the design note below.

## API

- `parse(qs)` — query string (leading `?` optional) -> plain object. A
  key that appears more than once collects into an array, in the order
  it appeared; a key with no `=` (e.g. `empty` above) is present with an
  empty string value.
- `stringify(obj)` — plain object -> query string (no leading `?`). An
  array value becomes repeated `key=value` pairs in array order.

## Design notes

- **`null`/`undefined` values are skipped entirely by `stringify`, not
  emitted as `key=`.** A query string has no way to represent "the key
  is present but the value is null" as distinct from "the key is present
  with an empty string" — collapsing that would be misleading, so instead
  the key just doesn't appear, which is at least unambiguous.
- **Repeated keys become arrays instead of the last one silently
  overwriting the others**, since arbitrarily dropping data on a
  duplicate key is the kind of bug that only shows up once someone
  actually sends `?tag=a&tag=b` and wonders where `a` went.
- Space encodes as `+` (not `%20`), matching how HTML forms and most
  server frameworks read `application/x-www-form-urlencoded` bodies —
  built deliberately as that convention rather than delegating to
  `URLSearchParams`, which is also close to this but not identical
  (e.g. its handling of `+` on the parse side differs slightly by
  spec version).

## Exit codes

Not a CLI — it's a module (`module.exports = { parse, stringify }`), so
no process exit codes apply.

## Running the tests

```
node --test tests/test_querystring.js
```

14 tests: single and multiple key=value pairs, repeated keys collecting
into an ordered array, a leading `?` being stripped, a key with no `=`
producing an empty string value, percent-encoding and `+` both decoding
correctly, an empty string parsing to `{}`, a non-string `parse()` input
throwing, `stringify`'s basic object case, its array-to-repeated-keys
behavior, `null`/`undefined` values being skipped, special-character
encoding (including `+` for spaces), non-plain-object `stringify()`
inputs (`null`, a string, an array) throwing, and a full
`parse(stringify(x))` round-trip.
