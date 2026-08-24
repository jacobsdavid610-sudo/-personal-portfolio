# wordwrap.js

Wraps plain text to a fixed column width — breaking at word boundaries,
preserving blank-line paragraph breaks, and hard-breaking any single word
longer than the width instead of letting it overflow.

## Why

The "reflow this text to 72 columns for a commit message / terminal / plain
text email" utility, written from scratch instead of reaching for a
`fold`/`fmt` pipeline (which don't handle paragraph-aware wrapping or
per-line indentation as directly) or a library.

## Usage

```js
const { wrap } = require("./wordwrap.js");

wrap("some long text...", 40);
wrap("some long text...", 40, "> "); // quoted, like an email reply
```

As a CLI:

```
wordwrap.js [file] [-w WIDTH] [--indent STR]
```

- `file` — text file to wrap. Defaults to stdin if omitted.
- `-w, --width` — column width (default: 80).
- `--indent` — string prepended to every output line (default: none).

## Real example

```
$ wordwrap.js prose.txt -w 40
The quick brown fox jumps over the lazy
dog. This sentence is intentionally long
enough to require wrapping across
several lines when a narrow column width
is used.

Here is a second paragraph, separated by
a blank line, which should wrap
independently of the first one and
remain its own block in the output.

$ wordwrap.js prose.txt -w 30 --indent "> "
> The quick brown fox jumps
> over the lazy dog. This
> sentence is intentionally
...
```

Also works piped through stdin: `cat prose.txt | wordwrap.js -w 50`.

## API

- `wrap(text, width, indent = "")` — the full paragraph-aware wrapper.
  Blank lines in `text` are treated as paragraph separators and preserved
  exactly as one blank line between wrapped paragraphs; a paragraph's own
  internal newlines are collapsed (treated as regular whitespace) before
  wrapping, matching how most "reflow" tools treat soft-wrapped source
  text. Throws `RangeError` if `width <= 0`.
- `wrapParagraph(text, width)` — wraps a single already-blank-line-free
  string, returning an array of lines with no width applied (no indent
  parameter — that's `wrap`'s job, applied uniformly afterward).

## Exit codes (CLI)

- `0` — success.
- `1` — a `RangeError` from `wrap` (e.g. `-w 0` or a negative width),
  message printed to stderr.

## Design notes

- `--indent` counts against the width: an `--indent` of 2 characters at
  `-w 14` wraps the *text* to 12 columns so the indented line still fits
  in 14 total, rather than blowing past the requested width.
- A word longer than the available width is hard-broken in-place: first it
  tops off whatever's left on the current line (if any), then continues in
  full-width chunks. This is the same reason `wrap()` needs `width - indent
  .length` to never bottom out below 1 — `Math.max(1, ...)` guards against
  an indent as wide as (or wider than) the requested total width producing
  a zero/negative effective width.

## Running the tests

```
node --test tests/test_wordwrap.js
```

11 tests: text that already fits on one line, breaking only at word
boundaries while never exceeding the width, collapsing irregular
whitespace, empty input, a single word longer than the width being
hard-broken into exact-width chunks, a long word appearing mid-paragraph
correctly topping off the current line before hard-breaking, blank-line
paragraph preservation, a paragraph's internal newlines collapsing before
wrapping, `--indent` prefixing every line without exceeding the total
width, a non-positive width throwing `RangeError`, and multiple paragraphs
wrapping independently of each other.
