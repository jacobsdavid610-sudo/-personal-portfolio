# mdhtml.js

A small Markdown-to-HTML converter for the part of CommonMark that most notes
and READMEs use. Raw HTML in the input is escaped, never passed through, and
link targets that could run script are dropped. No dependencies.

## Why

Markdown converters are easy to write and easy to make unsafe: the usual bug
is an `href="javascript:..."` or an attribute that a quote can break out of.
I wanted a converter small enough to read end to end where "can this output
ever contain a live tag?" has a short, testable answer.

## Supported

- **Blocks:** ATX headings (`#` to `######`), paragraphs (with hard breaks),
  fenced code (backticks or `~~~`, optional language), block quotes (nested),
  bullet lists (`-` `*` `+`), numbered lists (`1.` or `1)`, with a start
  number), nested lists, tight and loose lists, horizontal rules.
- **Inline:** `` `code` ``, `*em*` / `_em_`, `**strong**` / `__strong__`,
  `***both***`, `[text](url "title")`, `![alt](url)`, `<https://autolinks>`,
  `<me@example.com>`, backslash escapes, trailing double-space or backslash
  line breaks.
- **Not supported:** setext headings, indented code blocks, reference links,
  tables, HTML blocks, and the full CommonMark emphasis-nesting rules (simple
  nesting works; pathological `*a **b* c**` input is not resolved the way the
  spec says). An escaped quote inside a link title isn't supported either, in
  which case the text is left as plain, escaped text.

## API

```js
const { render, inline, safeUrl } = require("./scripts/mdhtml.js");

render("# Hi\n\nSome *text* and a [link](https://example.com).\n");
// "<h1>Hi</h1>\n<p>Some <em>text</em> and a <a href=\"https://example.com\">link</a>.</p>\n"

inline("a < b & **c**");        // "a &lt; b &amp; <strong>c</strong>"
safeUrl("javascript:alert(1)"); // ""
safeUrl("/docs/page.html");     // "/docs/page.html"
```

`render` returns a fragment ending in a newline (an empty string for empty
input) and throws `TypeError` for a non-string.

## CLI usage

```
mdhtml.js [FILE]
```

Reads Markdown from `FILE` or stdin and writes the HTML fragment to stdout.

## Real example

```
$ printf '# Notes\n\n- one\n- two *new*\n\n```js\nif (a < b) {}\n```\n' | node scripts/mdhtml.js
<h1>Notes</h1>
<ul>
<li>one</li>
<li>two <em>new</em></li>
</ul>
<pre><code class="language-js">if (a &lt; b) {}
</code></pre>

$ printf '[x](javascript:alert(1)) <script>x</script>' | node scripts/mdhtml.js
<p><a href="">x</a> &lt;script&gt;x&lt;/script&gt;</p>
```

## Exit codes

- `0` - success.
- `1` - the file could not be read.
- `2` - usage error.

## Design notes

- **Escape everything, allow nothing.** Every character of text goes through
  one escape function (`& < > " '`). The only tags in the output are ones the
  converter itself writes, and attribute values are escaped too, so a quote
  can't end an attribute.
- **Scheme allow-list.** A link or image target keeps its value only if it is
  relative or uses `http`, `https`, `mailto`, `ftp` or `tel`. Whitespace and
  control characters are stripped before the check, because browsers ignore
  them inside a scheme (`java<TAB>script:`). Everything else (`javascript:`,
  `data:`, `vbscript:`, `file:`) becomes an empty target.
- **Code language.** The word after a fence becomes a CSS class, so it is cut
  down to word characters and `+ # . -`; it can't carry a quote.
- **Inline parsing is a single left-to-right scan.** Code spans and escapes
  are recognised first, so `` `**` `` never opens emphasis. Underscores only
  open or close emphasis at word edges, which is why `snake_case_name` stays
  plain.
- **Lists.** Items continue while lines are indented to the item's content
  column (or are a lazy paragraph continuation); a blank line followed by
  indented content keeps the item going and makes the list loose. Tight lists
  drop the `<p>` wrappers.
- **Alt text.** It is built from the rendered label with tags removed, and
  escaped once. (My first version escaped it twice, so `"` came out as
  `&amp;quot;`; a test caught it.)

## Running the tests

```
node --test tests/test_mdhtml.js
```

27 tests: each block and inline form with its exact HTML, edge cases
(unclosed spans, snake_case, `2 * 3 * 4`, nested fences, nested lists, loose
lists), CRLF and tab handling, a table of dangerous URL schemes and nasty
payloads, attribute-breakout attempts, and a fuzz of 1,500 random strings made
of Markdown punctuation that checks every tag in the output is one the
converter is meant to write. The CLI is covered for files, stdin and exit
codes.
