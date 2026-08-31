# asciitable.js

Renders an array of objects as a bordered ASCII table — the
`console.table`-style output you'd want from a CLI script that doesn't
have `console.table`'s formatting available (or needs it as a returned
string rather than a direct console print).

## Why

Different domain from [wordwrap.js](wordwrap.md) (wraps prose to a width)
and [jsondiff.js](jsondiff.md) (diffs JSON structurally) — this is purely
about tabular *layout*: computing per-column widths from real data and
padding consistently, the same problem every "pretty-print a report"
script eventually needs solved.

## Usage

```js
const { renderTable } = require("./asciitable.js");

renderTable([
  { name: "Ada", age: 36 },
  { name: "Grace", age: 85 },
]);
```

As a CLI, reading a JSON array from a file or stdin:

```
asciitable.js [file]
```

## Real example

```
$ asciitable.js data.json
+--------------+--------------------+------+
| name         | role               | year |
+--------------+--------------------+------+
| Ada Lovelace | Mathematician      | 1815 |
| Grace Hopper | Computer Scientist | 1906 |
| Alan Turing  | Mathematician      | 1912 |
+--------------+--------------------+------+
```

Also works piped through stdin: `cat data.json | asciitable.js`.

## API

- `renderTable(rows, columns?)` — `rows` is an array of objects.
  `columns` is optional and controls both which keys appear and their
  order/header text:
  - Omitted: columns are inferred from `Object.keys(rows[0])`, in
    insertion order.
  - An array of plain strings: those exact keys, in that order, header
    text equal to the key name.
  - An array of `{ key, header? }`: lets you rename a column's header
    independently of its data key, or pick a subset of keys while
    dropping the rest.
  - `null`/`undefined` cell values render as an empty string, not the
    literal text `"null"`/`"undefined"`.
- An empty `rows` array with no `columns` given returns the literal
  string `"(no rows)"` rather than an empty or malformed table (there's
  nothing to infer column names from).

## Exit codes (CLI)

- `0` — success.
- `1` — the input wasn't valid JSON, or wasn't a JSON array.

## Design notes

- Column width is `Math.max(header.length, ...every cell's String(value)
  .length)` — computed once per column before any row is rendered, so
  every row in that column pads to the same width regardless of which row
  happens to hold the longest value.
- Real bug caught while writing the tests: an empty `rows` array *with* an
  explicit `columns` list rendered a doubled closing border — the
  header-separator border and the "final" border were pushed
  unconditionally as two separate lines, and with zero data rows in
  between them they ended up identical and adjacent. Fixed by only
  pushing the closing border when there's at least one data row; the
  header-separator border already serves as the visual bottom edge for an
  otherwise-empty table.

## Running the tests

```
node --test tests/test_asciitable.js
```

10 tests: inferred columns from the first row rendering a correctly
bordered table, column width correctly taking the max of header and every
cell (verified against an exact expected string, not just "doesn't
crash"), an explicit column list controlling order independent of key
insertion order, header renaming via `{key, header}`, selecting a subset
of keys, `null`/`undefined` cells rendering as empty rather than literal
text, numeric cells stringifying correctly, an empty array with no
columns producing the placeholder string, an empty array *with* explicit
columns producing a clean 3-line header-only table (not the doubled
border), and border-row width matching the column width exactly.
