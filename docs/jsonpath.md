# jsonpath.js

A small subset of JSONPath: dot keys, `['bracket keys']` for names that
aren't valid dotted identifiers, numeric array indices, and `*` wildcards
(`.*` or `[*]`) over both arrays and objects. No dependencies — a `jq`-lite
for querying JSON from a script without shelling out to a tool that might
not be installed (minimal containers, some CI images).

## API

```js
const { query, queryOne } = require("./jsonpath.js");

const data = {
  store: {
    books: [
      { title: "A", author: "Ada" },
      { title: "B", author: "Bob" },
    ],
  },
};

query(data, "$.store.books[*].title"); // ["A", "B"]
query(data, "$.store.books[0].title"); // ["A"]
query(data, "$.nope.nope");            // [] - a miss, not an error
queryOne(data, "$.store.books[1].author"); // "Bob"
```

- `query(obj, path) -> array` — every match, in document order. A wildcard
  can multiply matches; a missing key or out-of-range index just narrows
  the result set to nothing rather than throwing.
- `queryOne(obj, path) -> value | undefined` — the first match, or
  `undefined` if there isn't one.
- `parsePath(path) -> segments` — the parsed token list, exposed mostly
  for testing/debugging a path that isn't matching what you expect.
- An **invalid path** (missing the leading `$`, or a token the tokenizer
  doesn't recognize) throws synchronously — that's a bug in the path
  string itself, different from a valid path that simply finds nothing in
  this particular document.

## CLI usage

```
jsonpath.js <file.json> <path>
```

Prints each match as its own line of JSON. Exits `0` if there was at least
one match, `1` if there were none — so it composes in a shell pipeline
the way `grep` does.

## Real example

```
$ jsonpath.js data.json '$.store.books[*].title'
"A"
"B"
$ jsonpath.js data.json '$.nope'; echo $?
1
```

## Design notes

- **A wildcard over an object yields `Object.values()`, not keys** — for
  pulling out a field across every entry of a map-shaped object
  (`$.scores.*` over `{alice: 90, bob: 80}`), the values are almost always
  what you actually want; there's no separate key-listing operator, to
  keep the supported syntax small.
- **`['key']` bracket notation exists specifically for keys that aren't
  valid bare identifiers** — a name with a dash or a dot in it (`book-count`,
  a URL used as a map key) can't be written as `.book-count` without the
  tokenizer misreading it as a property access followed by more path, so
  the quoted-bracket form is the escape hatch.
- **Not full JSONPath** — no filter expressions (`[?(@.price<10)]`), no
  recursive descent (`..`), no slicing (`[1:3]`), no negative indices.
  Covers the common "walk into nested JSON and pull a field or a list of
  fields" case, which is most of what ad hoc JSON inspection actually
  needs.

## Exit codes

`0` if the query matched at least one value, `1` if it matched none,
non-zero (uncaught exception) for an invalid path or unreadable/malformed
JSON file.

## Running the tests

```
node --test tests/test_jsonpath.js
```

14 tests: the bare root path, a plain dotted key, a numeric index, an
array wildcard collecting a field across every element, a dot wildcard
collecting every value of an object, bracket-quoted access to a
dash-containing key, an out-of-range index and a missing key both
returning no matches rather than erroring, a wildcard over a nonexistent
path, `queryOne`'s first-match/`undefined` behavior, a path missing the
leading `$` and an unrecognized token both throwing, `parsePath`'s raw
segment output, and a wildcard chained into a key that's missing on some
elements correctly filtering those elements out instead of returning
`undefined` entries.
