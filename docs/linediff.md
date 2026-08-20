# linediff.js

Line-based diff between two files, computed via longest common subsequence
(LCS) and printed unified-diff style (`-`/`+`/` ` prefixes, like `diff -u`).

## Why

A from-scratch diff algorithm is a genuinely different exercise from
[jsondiff.js](jsondiff.md) (structural key/value diffing) — it's about
finding the longest common subsequence between two line arrays and turning
that into a minimal, readable edit script, which is the same core idea
behind `diff`/`git diff` (real implementations use the smarter Myers
algorithm for speed; this uses a plain LCS dynamic-programming table, which
is easier to verify correct and fine for reasonably sized files).

## Usage

```js
const { diffLines, formatUnified, hasChanges } = require("./linediff.js");

const ops = diffLines(["a", "b"], ["a", "c"]);
// [{ type: "same", line: "a" }, { type: "del", line: "b" }, { type: "add", line: "c" }]

formatUnified(ops); // [" a", "-b", "+c"]
```

As a CLI:

```
linediff.js <fileA> <fileB>
```

## Real example

```
$ linediff.js a.txt b.txt
--- a.txt
+++ b.txt
 line one
 line two
-line three
+line THREE
 line four
-line five
+line six
$ echo $?
1
```

Identical files print nothing and exit `0`.

## API

- `diffLines(a, b)` — arrays of strings in, array of `{ type, line }` out,
  where `type` is `"same"`, `"add"`, or `"del"`, in the order needed to
  transform `a` into `b`.
- `formatUnified(ops, contextLines = 3)` — turns ops into unified-diff-style
  lines, collapsing runs of unchanged lines down to `contextLines` of
  padding around each change (matching `diff -u`'s default of 3).
- `hasChanges(ops)` — `true` if `ops` contains any `add`/`del`.

## Exit codes (CLI)

- `0` — files are identical (no output).
- `1` — files differ (diff printed to stdout).
- `2` — missing arguments (usage error, printed to stderr).

## Design notes

- The DP table is `(n+1) x (m+1)` and the edit script is recovered by
  walking it once — `O(n*m)` time and space, the standard trade-off for an
  LCS-based diff. Fine for files up to a few thousand lines; a production
  diff tool would use a different algorithm for very large inputs.
- A trailing newline at the end of a file produces a phantom empty final
  "line" when naively splitting on `"\n"`; the CLI strips exactly one such
  trailing empty element so a normally-newline-terminated file doesn't show
  a spurious extra blank line in the diff. The `diffLines`/`formatUnified`
  functions themselves are line-array-in, line-array-out and don't do this
  stripping — that's a file-reading concern, not a diffing one.
- Ties in the DP recurrence (`dp[i+1][j] >= dp[i][j+1]`) are broken toward
  deletion-before-addition, which is why a same-position replacement always
  renders as a `-` line immediately followed by a `+` line rather than the
  reverse.

## Running the tests

```
node --test tests/test_linediff.js
```

13 tests: identical inputs, single add/delete in the middle, a replaced
line rendering as delete-then-add, fully disjoint inputs, empty-vs-non-empty
in both directions, both-empty, `hasChanges` accuracy, `formatUnified` with
default and zero context, no-changes producing no output, and a longer
realistic diff confirming unchanged lines around a single-line change stay
intact.
