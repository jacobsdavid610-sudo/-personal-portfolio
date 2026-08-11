# Devlog

Notes on what I actually worked on, in the order I did it. New entries go on top.

## 2026-08-11

Added `scripts/base64.js` — base64 encode/decode implemented from the actual
bit-packing algorithm (3 bytes -> four 6-bit groups, `=` padding), not
`Buffer.toString("base64")`/`atob`. `Buffer` is only used for the unrelated
UTF-8 text<->bytes conversion step, noted explicitly in `docs/base64.md` so
the "from scratch" claim is precise about what's actually hand-written.
`tests/test_base64.js` checks all three padding cases, round-tripping raw
bytes including `0x00`/`0xff`, empty string, and `decode` tolerating stray
whitespace. Importantly also checks `encodeText()` output directly against
`Buffer.from(s, "utf8").toString("base64")` as an independent oracle, not
just round-trip tests against itself (round-trips can pass even with a
shared bug in both directions that cancels out). 8/8 passing. Real CLI
round-trip test on an actual string also confirmed correct.

## 2026-08-10

Added `scripts/portcheck.sh` — checks whether a TCP `host:port` is open
using bash's `/dev/tcp` builtin (no `nc` dependency, which turned out not to
be installed on this machine anyway), with `--wait`/`--interval` to retry
until a port comes up. `tests/test_portcheck.sh` runs a real
`python -m http.server` on a scratch port as the "open" fixture and an
adjacent unused port as "closed" - no mocked sockets. 7/7 passing. Also ran
it standalone outside the test suite and timed the `--wait 3 --interval 1`
retry case with `time`: real elapsed was ~9s, not the ~3-4s the interval
math suggests, because spawning `timeout` + a fresh `bash -c` subshell per
attempt has real process-spawn overhead on this machine. Logic's correct
either way (confirmed via the test's generous `>= 2s` bound), but wrote it
up in `docs/portcheck.md` since it's a genuine gotcha for anyone using this
in a tight retry loop, not something I'd have caught without actually timing
a real run.

Added `scripts/trie.py` — a Trie (prefix tree) with `insert`, `search`
(exact), `starts_with` (prefix check), and `autocomplete` (alphabetical,
optional limit). `tests/test_trie.py` covers exact search hit/miss, search
on an empty trie, `starts_with` on a real-but-unstored prefix, the case
where a word is also a prefix of longer words, alphabetical ordering,
`limit`, a nonexistent prefix, empty-prefix (returns everything), and
inserting a duplicate word being harmless. 10/10 passing. Ran the CLI
against a real word list (`apple`/`apply`/`apt`/`application`/`banana`/
`band`) — autocompleting `app` correctly returned exactly the three that
match and excluded `apt` (diverges at the third character). Wrote
`docs/trie.md` covering the `search()` vs `starts_with()` distinction,
which is the one subtlety worth calling out.

## 2026-08-07

Added `scripts/gitstats.sh` — commit counts per author in a git repo, via
`git log --format=%an | sort | uniq -c | sort -rn`, with `--since` and
`--top` filters. `tests/test_gitstats.sh` builds a real scratch git repo
with `--allow-empty` commits from two authors and asserts against actual
output (sort order, `--top` truncation, `--since` counting, rejecting a
non-repo directory). 7/7 passing — caught my own test-fixture miscount
along the way (wrote the test expecting 4 commits for Alice when the
fixture only actually made 3; the script was right, the assertion was
wrong). Also wrote `docs/gitstats.md`, a full README for it — starting
today, every project gets one of these instead of just a devlog blurb.

Added `scripts/template.js` — a small mustache-style templating engine:
`{{value}}` HTML-escapes by default, `{{{value}}}` opts into raw output,
dotted paths reach into nested objects, missing keys render as empty string
instead of `"undefined"`. `tests/test_template.js` covers escaping all five
HTML-significant characters, raw-vs-escaped in the same template, nested
paths, missing/null-partway paths, and non-string values. 9/9 passing. Real
smoke test: rendered a template with an attacker-controlled `bio` field
containing `<script>steal(document.cookie)</script>` next to an explicitly
trusted raw HTML field — the script tag came out as inert escaped text, the
trusted field rendered as real markup. Wrote `docs/template.md` covering the
escaping rationale and that exact example.

## 2026-08-06

Added `scripts/jsondiff.js` — deep-diffs two JSON values and reports
added/removed/changed paths (dotted for objects, indexed for arrays),
including type changes (e.g. a key going from object to array shows up as a
single `changed` entry rather than a confusing recursive mismatch).
`tests/test_jsondiff.js` covers no-diff, added/removed keys, changed
primitives, nested-object dotted paths, array index diffing with length
changes, type changes, and `deepEqual`. 8/8 passing. Smoke-tested against
two real JSON files with a mix of changed/added/nested-array differences —
output matched expectations.

Added `scripts/calc.py` — a real recursive-descent tokenizer/parser/evaluator
for arithmetic expressions (`+ - * / **`, parens, unary +/-), not just a
wrapper around `eval()`. Hit a genuine precedence bug while testing:
`-2 ** 2` evaluated to `4` instead of `-4` because the grammar had unary
minus wrapping `power()`, so it computed `(-2) ** 2` instead of
`-(2 ** 2)`. Standard math convention (and Python itself) has unary minus
bind *looser* than `**`. Fixed by restructuring the grammar so `factor`
(unary) sits above `power`, with `power`'s base going straight to `atom` -
and the exponent side of `**` still recurses through `factor` so `2 ** -2`
and right-associative chains like `2 ** 3 ** 2` keep working.
`tests/test_calc.py` covers precedence, right-associativity, unary
+/-, nested parens, float literals, division by zero, and several malformed-
input cases. 15/15 passing. Also noticed the CLI dumped a raw Python
traceback on a `ZeroDivisionError`/`ParseError` during smoke testing instead
of a clean message - wrapped `main()` in a try/except so it now prints
`Error: ...` to stderr and exits 1, matching the other scripts here.

## 2026-08-05

Added `scripts/retry.sh` — runs a command, retrying with exponential backoff
on failure up to `--max-attempts`, propagating the real exit code. Hit a real
bug writing the test for this: `if "$@"; then ...; fi` with no `else` clause
always returns exit status 0 on the false branch (that's correct POSIX
behavior for `if`, not a bug in bash) — so `status=$?` right after was always
reading 0 instead of the failing command's actual exit code. Fixed by
capturing `$?` immediately after running `"$@"` directly, before any `if`.
`tests/test_retry.sh` (assertion-based, no framework) covers immediate
success, eventual success after N failures, exhausting all attempts and
propagating the real exit code, and rejecting a non-numeric
`--max-attempts`. 9/9 passing after the fix. Also ran it for real against a
script that fails twice then succeeds, and watched the backoff delay
actually double between attempts (0.2s -> 0.4s).

Added `scripts/fuzzymatch.py` — Levenshtein edit distance (O(n*m) DP) plus a
`suggest()` "did you mean" helper that ranks candidates by normalized
similarity. `tests/test_fuzzymatch.py` covers the textbook
kitten/sitting=3 case, empty strings, symmetry, similarity bounds,
ranking, `limit`, and `min_similarity` filtering. 14/14 passing. Ran the CLI
against a real typo ("reciev" vs receive/receipt/recipe/recover) and the
ranking looked right.

## 2026-08-04

Added `scripts/lru_cache.py` — an actual LRU cache implementation (dict for
O(1) lookup + a doubly linked list with sentinel head/tail for O(1) recency
updates), not just a wrapper around `functools.lru_cache`.
`tests/test_lru_cache.py` covers eviction on overflow, `get()` refreshing
recency so a key survives eviction, `put()` on an existing key updating both
value and recency, `len()`, capacity-1 behavior, and invalid capacity. 9/9
passing. Ran the CLI demo for real and checked the recency order printed
after each `put()` by hand.

Added `scripts/debounce.js` — debounce and throttle utilities (throttle is
leading-edge, drops calls during cooldown rather than queuing them; debounce
has a `.cancel()`). `tests/test_debounce.js` uses Node's built-in mocked
timers (`node --test`, no sinon) to test debounce collapsing rapid calls into
one trailing call with the latest args, `cancel()` actually preventing the
call, and throttle's immediate-then-cooldown-then-allowed-again behavior.
6/6 passing. Also ran both against *real*, non-mocked timers in a scratch
script to make sure the mocked-timer tests weren't hiding something — same
behavior both ways.

## 2026-08-03

Added `scripts/ratelimiter.py` — a token-bucket rate limiter (`allow()` /
`wait_time()`), clock injectable so tests don't sleep in real time. Pure
stdlib. `tests/test_ratelimiter.py` covers capacity limits, refill over time,
never exceeding capacity after a long idle period, rejected calls not
consuming tokens, wait-time math, invalid constructor args, and calls with
cost > 1. 8/8 passing. Ran the CLI for real too, once with a fast refill rate
(everything allowed) and once with a slow one (to see it actually block and
report a sane retry time).

Added `scripts/csvparse.js` — an RFC 4180 CSV parser: quoted fields with
embedded commas, escaped `""` quotes, embedded newlines inside quoted fields,
and CRLF vs LF line endings. No dependencies. `tests/test_csvparse.js` (node's
built-in test runner) covers all of the above plus files with no trailing
newline and the `toObjects()` header-zip helper. 8/8 passing. Smoke-tested
against a real CSV with a quoted-comma field, escaped quotes, and a
multi-line quoted field — all parsed correctly.

## 2026-07-30

Added `scripts/prune_old_files.sh` — lists (or `--delete`s, with a confirmation
prompt unless `--yes`) files under a directory older than N days, using plain
`find -mtime` + coreutils, no dependencies. Added
`tests/test_prune_old_files.sh`, a small assertion-based runner (no bats/shunit2
dependency) covering dry-run listing, the no-matches case, actual deletion via
`--delete --yes`, and rejecting a non-numeric `--days`. 8/8 passing. Also ran it
for real against a scratch dir with an old and a new file, both in list and
delete mode.

Added `scripts/textsearch.py` — tiny TF-IDF document search over a directory of
`.txt`/`.md` files: term frequency weighted by inverse document frequency,
ranked by cosine similarity against a query. Pure Python, no numpy/sklearn.
`tests/test_textsearch.py` covers tokenizing, IDF weighting common vs. rare
terms correctly, cosine similarity edge cases (identical/disjoint/empty
vectors), ranking, top-n limiting, and the file-extension filter in doc
loading. 10/10 passing. Smoke-tested against three real short documents —
querying "sleeping cats" correctly ranked the cats document first.

## 2026-07-29

Added `scripts/mdtoc.js` — generates a GitHub-style table of contents for a
Markdown file: extracts ATX headings, skips anything inside fenced code blocks,
slugifies the way GitHub does (including de-duping repeated headings as
`-1`, `-2`, ...), and either prints the TOC or writes it in place between
`<!-- toc -->` / `<!-- tocstop -->` markers. No dependencies, plain Node.

Added `tests/test_mdtoc.js` using Node's built-in test runner (`node --test`,
no npm install needed) — heading extraction + slugifying, de-duplication,
code-fence skipping, min/max level filtering and nested indentation, and the
empty-range case. All 5 passing. Also ran it for real against this file in
both print mode and `--write` mode (on a scratch copy) before committing.

Added `scripts/dupefinder.py` — walks a directory, groups files by size, then by
sha256 hash, and reports duplicate groups (bytes reclaimable, which copy would be
kept). `--delete` removes all but the first copy in each group, with a confirmation
prompt unless `--yes` is passed. Pure stdlib, no dependencies.

Added `tests/test_dupefinder.py` (unittest, stdlib only) covering: no duplicates,
a duplicate pair across a subdirectory, same-size-but-different-content files not
being falsely flagged (the size-bucketing pre-filter has to actually hash before
deciding), a three-way duplicate group, and an empty directory. All passing.

Also ran it for real against a scratch directory with two identical files and one
unique file to confirm the CLI output looks right before committing.

## 2026-07-26

Added `scripts/summarize.py` — a small extractive text summarizer, pure Python, no
external dependencies. Scores sentences by word frequency and returns the top N.
Tested against a sample paragraph via both file input and stdin, works as expected.

## 2026-07-23

Set up this repo and the devlog workflow. Idea: instead of trying to backfill history or
automate meaningless commits, just write a short note here whenever I genuinely work on
something, then commit it that day. Real dates, real work, no scripting.
