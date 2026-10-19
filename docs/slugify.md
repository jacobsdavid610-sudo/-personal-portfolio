# slugify.js

Turns arbitrary text into a URL- and filename-safe slug:
`Crème Brûlée & Co.` becomes `creme-brulee-co`. No dependencies.

## Why

I keep writing the same three lines whenever a title has to become a
filename or a URL path: lowercase it, swap the junk for dashes, trim the
ends. Each time I forget something (accents, two titles that collapse to
the same slug, a length limit that cuts a word in half). This is that
snippet written once and tested.

## API

```js
const { slugify, uniqueSlugs } = require("./scripts/slugify.js");

slugify("Crème Brûlée & Co.");                       // "creme-brulee-co"
slugify("My Great File", { separator: "_" });        // "my_great_file"
slugify("the quick brown fox", { maxLength: 12 });   // "the-quick"
uniqueSlugs(["Hello World", "hello, world"]);        // ["hello-world", "hello-world-2"]
```

- `slugify(text, { separator, maxLength })` - `separator` is one of
  `-`, `_` or `.` (default `-`). `maxLength` defaults to no limit.
  Returns `""` if nothing usable is left. Throws `RangeError` for a bad
  separator or a `maxLength` below 1.
- `uniqueSlugs(titles, opts)` - slugifies each title and numbers later
  duplicates `-2`, `-3`. Takes the same options.

## CLI usage

```
node scripts/slugify.js [-s SEP] [-m MAX] [-u] [TITLE ...]
```

With no titles it reads one per line from stdin. `-u` makes the output
unique.

## Real example

```
$ node scripts/slugify.js "Crème Brûlée & Co." "Straße Ölfeld"
creme-brulee-co
strasse-olfeld
$ printf 'Hello World\nhello, world\nHello World!\n' | node scripts/slugify.js -u
hello-world
hello-world-2
hello-world-3
$ node scripts/slugify.js -s x a; echo $?
slugify: separator must be one of: - _ .
1
```

## Design notes

- **Accents are stripped with NFKD, then a small table covers the rest.**
  `é` decomposes into `e` plus a combining mark, which gets removed.
  `ß`, `ø`, `ł` and a few others don't decompose, so without the table
  they'd silently disappear and `Straße` would become `strae`.
- **Non-Latin text produces an empty slug.** I didn't try to transliterate
  Japanese or Arabic; guessing wrong is worse than saying nothing.
  `uniqueSlugs` falls back to `untitled` so callers still get a name.
- **`maxLength` cuts on a word boundary** when it can, and only hard-cuts
  a single word that is longer than the limit by itself. It never leaves
  a trailing separator.
- **The separator is limited to `- _ .`.** Anything else (a `/`, say)
  could turn a slug into a path, so it's rejected.
- **Duplicate numbering is checked against everything already issued.**
  `["a", "a", "a 2"]` gives `a`, `a-2`, `a-2-2`, not two `a-2`s. When a
  suffix would push past `maxLength`, the slug is trimmed to make room.

## Exit codes (CLI)

- `0` - success.
- `1` - bad separator or max length, message on stderr.

## Running the tests

```
node --test tests/test_slugify.js
```

20 tests: lowercasing, accent stripping, the non-decomposing letters,
punctuation runs collapsing, trimmed ends, digits, input with nothing
usable, custom and invalid separators, `maxLength` on a word boundary,
a single over-long word, no trailing separator, invalid `maxLength`,
duplicate numbering, the `untitled` fallback, suffixes fitting inside
`maxLength`, suffix collisions, and the CLI with arguments, stdin and a
bad flag.
