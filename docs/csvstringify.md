# csvstringify.js

An RFC 4180 CSV writer — the counterpart to `csvparse.js`. Quotes a field
only when it actually needs it, and doubles embedded quotes. No
dependencies.

## Why

The obvious `row.join(",")` approach breaks the moment any field contains a
comma, a quote, or a line break — which real data does constantly (a note
field, a free-text address, anything a user typed). Always quoting every
field works too, but produces noisy output and doesn't round-trip back
through a strict RFC 4180 reader identically. Quoting exactly when needed,
and doubling embedded quotes, is what makes `stringify(parseCsv(text))`
(and the reverse) actually idempotent.

## API

```js
const { stringify, stringifyObjects, quoteField } = require("./csvstringify.js");

stringify([["name", "note"], ["Ada", "hello, world"]]);
// 'name,note\r\nAda,"hello, world"\r\n'

stringifyObjects([{ name: "Ada", age: 30 }, { name: "Bob" }]);
// 'name,age\r\nAda,30\r\nBob,\r\n'  (missing keys become empty fields)

stringifyObjects([{ a: 1, b: 2 }], ["b", "a"]);
// 'b,a\r\n2,1\r\n'  (explicit header order/subset)
```

- `quoteField(value) -> string` — quotes only if the value contains `,`,
  `"`, `\r`, or `\n`; `null`/`undefined` become `""`.
- `stringifyRow(fields) -> string` — one CSV line, no line terminator.
- `stringify(rows, { lineTerminator = "\r\n" }) -> string` — full CSV text,
  each row (including the last) followed by `lineTerminator`.
- `fromObjects(records, headers?) -> rows` — turns an array of objects
  into `[headers, ...rows]`. Without an explicit `headers` list, columns
  are the union of every record's keys, in first-seen order.
- `stringifyObjects(records, headers?, options?) -> string` — `fromObjects`
  piped straight into `stringify`.

## CLI usage

```
csvstringify.js <file.json> [--headers=a,b,c]
```

Reads a JSON file. If it's an array of arrays, writes it straight out as
CSV. If it's an array of objects, infers headers from the union of keys
(or uses `--headers` to pick an explicit order/subset) and writes that.

## Real example

```
$ cat records.json
[{"name": "Ada", "note": "loves \"comma, and quote\""}, {"name": "Bob", "note": "plain"}]

$ csvstringify.js records.json
name,note
Ada,"loves ""comma, and quote"""
Bob,plain
```

## Design notes

- **CRLF, not LF, is the default line terminator** — RFC 4180 specifies
  `\r\n`, and `csvparse.js` (which this pairs with) already handles both,
  so writing the spec-correct default keeps output byte-compatible with
  strict external CSV readers rather than only this repo's own parser.
- **Quoting is minimal, not "quote everything."** A field only gets `"..."`
  wrapping when it contains the delimiter, a quote character, or a line
  break — matching what real-world CSV producers (spreadsheet exports,
  `COPY ... TO CSV`) do, so output looks normal to a human skimming it.
- `fromObjects` fills a missing key with `""` rather than `"undefined"` or
  throwing, since a set of records with slightly different shapes (some
  optional field present on some rows) is the common case, not an error.

## Exit codes

`0` on success. `1` if no input file path is given.

## Running the tests

```
node --test tests/test_csvstringify.js
```

12 tests: plain values passing through unquoted, `null`/`undefined`
becoming an empty field, quoting triggered by a comma, a quote (with
doubling), and a newline/CR, `stringifyRow` joining fields correctly,
`stringify`'s CRLF joining and trailing terminator, the empty-input case,
a full round-trip through `parseCsv` producing the exact original rows,
`fromObjects` inferring headers from the union of keys in first-seen
order, `fromObjects` with an explicit header order/subset, and
`stringifyObjects` round-tripping through `toObjects(parseCsv(...))`.
