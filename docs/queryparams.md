# queryparams.js

Parses/stringifies `application/x-www-form-urlencoded` query strings into
a plain object, where a repeated key (`a=1&a=2`) or bracket notation
(`a[]=1&a[]=2`) collapses into an array — rather than staying a flat list
of pairs the way the built-in `URLSearchParams` deliberately keeps them.
No dependencies.

## Why

`URLSearchParams` already handles percent-decoding correctly, so this
isn't reinventing that. What it doesn't do is give you back a normal
object where `?tag=a&tag=b` becomes `{ tag: ["a", "b"] }` — you'd still
have to call `.getAll("tag")` yourself, and know in advance which keys
might repeat. Most backend frameworks (Rails, PHP, Express with `qs`)
already collapse repeated/bracketed keys into arrays automatically; this
is that behavior, self-contained.

## API

```js
const { parse, stringify } = require("./queryparams.js");

parse("a=1&a=2");           // { a: ["1", "2"] }
parse("a[]=1&a[]=2");       // { a: ["1", "2"] }  - same result, bracket form
parse("name=John%20Doe");   // { name: "John Doe" }
parse("q=a+b");             // { q: "a b" }  - '+' decodes to a space
parse("flag");               // { flag: "" }  - a key with no '=' is an empty value

stringify({ name: "Ada Lovelace", tag: ["a", "b"] });
// "name=Ada+Lovelace&tag=a&tag=b"

stringify({ tag: ["a", "b"] }, { arrayFormat: "brackets" });
// "tag%5B%5D=a&tag%5B%5D=b"
```

- `parse(qs) -> object` — a leading `?` is stripped if present. Every
  value is a string, except a key that appears more than once (or uses
  `[]`), which becomes an array of strings in encounter order.
- `stringify(obj, { arrayFormat = "repeat" }) -> string` — `"repeat"`
  writes an array value as the same key repeated once per element (the
  form `parse` reads back into an array without needing `[]`); `"brackets"`
  appends `[]` to the key instead.
- `parse(stringify(obj))` round-trips exactly for any object of strings
  and/or string arrays.

## CLI usage

```
queryparams.js parse '<query-string>'
queryparams.js stringify '<json-object>'
```

## Real example

```
$ queryparams.js parse 'name=Ada+Lovelace&tag=a&tag=b'
{"name":"Ada Lovelace","tag":["a","b"]}

$ queryparams.js stringify '{"name":"Ada Lovelace","tag":["a","b"]}'
name=Ada+Lovelace&tag=a&tag=b
```

## Design notes

- **`+` decodes to a space, and a space encodes back to `+`** — that's
  `application/x-www-form-urlencoded`'s convention (what an HTML form
  actually sends), not the `%20` that plain `encodeURIComponent`/
  `decodeURIComponent` produce on their own; `stringify` post-processes
  `encodeURIComponent`'s output to match.
- **Bracket notation (`a[]=`) and plain repetition (`a=...&a=...`) parse
  to the exact same result.** Both are common in the wild depending on
  which framework produced the query string, and a consumer shouldn't
  have to care which one a given API used.
- **Only flat scalars and arrays of scalars are supported** — no
  `a[b]=c` nested-object notation. That's a substantially bigger feature
  (the `qs` npm package's main complexity), and flat key/array-of-values
  covers the overwhelming majority of real query strings.
- `stringify`'s default (`arrayFormat: "repeat"`) was chosen over
  `"brackets"` because it's what `parse` needs zero special-casing to
  read back — a plain repeated key is valid with or without brackets, so
  producing the simpler form by default keeps output maximally
  compatible with other parsers that only understand plain repetition.

## Exit codes

`0` on success. `1` for a usage error (missing subcommand or argument).

## Running the tests

```
node --test tests/test_queryparams.js
```

15 tests: plain scalar parsing, a repeated key collapsing into an array
(twice, and three-plus times), bracket notation producing the identical
result, a value-less key becoming an empty string, percent-decoding,
`+`-as-space decoding, a leading `?` being stripped, the empty-string
case, `stringify`'s plain-pair output, the default repeat array format,
the `brackets` array format, `+`-as-space encoding, percent-encoding of
delimiter characters (`&`, `=`) inside a value, and a full round-trip of a
mixed scalar/array object through `parse(stringify(...))`.
