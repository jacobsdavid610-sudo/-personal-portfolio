# Devlog

Notes on what I actually worked on, in the order I did it. New entries go on top.

## 2026-09-03

Added `scripts/diskalert.sh` — checks filesystem usage percentage for one
or more paths against `--warn`/`--critical` thresholds and exits
Nagios/Icinga-plugin-style: `0` OK, `1` WARNING, `2` CRITICAL, `3` UNKNOWN,
using the worst status across all paths given as the overall exit code.
Uses `df -P` specifically (not plain `df`) because the POSIX format
guarantees one line of output per filesystem, where the default format can
wrap a long device name onto a second line and break column parsing —
found that the hard way by testing against this machine's real, unusually
long Git-for-Windows mount path before settling on `-P`. A non-numeric
`Capacity` column (some virtual/network filesystems report one) is treated
as UNKNOWN rather than silently coerced to 0 or crashing on the integer
comparison. `tests/test_diskalert.sh` (14 tests) stubs `df` via a fake
executable prepended onto `PATH` so percentages are fully controlled
instead of depending on the test machine's actual disk usage: each status
bucket, custom thresholds shifting a percentage between buckets, multiple
paths reporting the worst one as the overall exit code, a nonexistent path
failing fast before any `df` call, and both a non-numeric threshold and
`--warn` > `--critical` being rejected. All passing. Also ran it for real
(unstubbed) against `.` and against `/no/such/path` before writing the
mocked tests, to make sure the real `df -P` output actually parses the way
I assumed.

## 2026-09-02

Added `scripts/csvstringify.js` — the writer counterpart to `csvparse.js`:
an RFC 4180 CSV serializer that quotes a field only when it actually needs
it (contains a comma, a double quote, or a line break) and doubles
embedded quotes, instead of either a naive `join(",")` that breaks on real
data or quoting every field unconditionally. Defaults to CRLF line endings
per spec, matching what `csvparse.js` already reads. `fromObjects`/
`stringifyObjects` take an array of objects and infer the header row from
the union of every record's keys (first-seen order), filling a missing key
with an empty field rather than `"undefined"`; an explicit `headers` array
overrides the order/subset. `tests/test_csvstringify.js` (12 tests) covers
quoting for each of the three trigger characters, `null`/`undefined`
becoming an empty field, plain values staying unquoted, row/full-text
joining, the empty-input case, header inference and explicit ordering, and
two full round-trips through `parseCsv`/`toObjects` to confirm the two
scripts actually interoperate rather than just each passing their own
tests in isolation. All passing. Smoke-tested the CLI against a real JSON
file with a field containing both a comma and an embedded quote, and
against array-of-arrays input, before committing.

## 2026-09-01

Added `scripts/jsonschema_lite.py` — a minimal JSON-Schema-style validator:
`type`, `enum`, `required`, `properties`, `items`, `minLength`/`maxLength`,
`minimum`/`maximum`, `pattern`, `additionalProperties`. Pure stdlib, no
`jsonschema` dependency. The annoying detail I made sure to actually handle:
Python's `bool` is a subclass of `int`, so a naive `isinstance(x, int)` type
check would silently accept `True`/`False` in an `integer` or `number`
field — `_check_type` explicitly excludes `bool` from both. `type` checks
also short-circuit the rest of that node's checks, so a wrong-type value
doesn't also spam `minimum`/`pattern` errors that are meaningless against
it. `tests/test_jsonschema_lite.py` (20 tests) covers every type passing
and failing, the bool-vs-integer/number distinction, union types, an
unknown type raising `SchemaError` instead of silently no-op'ing, enum,
string/array length limits, numeric bounds, regex patterns, array `items`
with the index threaded into the error path, required/missing properties,
`additionalProperties: false` rejecting extras (and the default allowing
them), multiple errors collected together instead of stopping at the
first, and a nested array-of-objects case. All passing. Smoke-tested for
real via the CLI against a sample JSON file and schema — correctly caught
an extra property not in the schema and exited 1.

## 2026-08-31

Added `scripts/asciitable.js` — renders an array of objects as a bordered
ASCII table, with optional explicit column selection/ordering/renaming.
`tests/test_asciitable.js` (10 tests) covers inferred vs. explicit
columns, column width taking the max of header and every cell, header
renaming, subset selection, null/undefined rendering as empty rather than
literal text, and the empty-input cases. All passing. Caught a real bug
while writing the tests, not just a miscounted expectation (though there
was also one of those, fixed alongside it): an empty `rows` array with an
explicit `columns` list rendered a doubled closing border, since the
header-separator border and the final border were pushed unconditionally
as two separate lines that become identical and adjacent when there are
zero rows between them. Fixed by only pushing the closing border when at
least one data row exists. Smoke-tested for real against actual JSON data
via the CLI, both from a file and piped through stdin.

Added `scripts/tarbackup.sh` — creates a timestamped `.tar.gz` backup of a
directory, pruning old backups beyond `--keep`. Hit a real, classic
gotcha immediately while smoke-testing: GNU tar treats an archive path
starting with a drive letter and colon (`C:\Users\...` - every absolute
path on this platform) as a remote `host:file` spec and tries to shell
out over SSH, failing with `Cannot connect to C: resolve failed` instead
of just writing the file. Fixed with `--force-local` on every tar
invocation. `tests/test_tarbackup.sh` (15 tests) covers a real backup
producing a non-empty archive that genuinely contains the source's files
(verified by listing the archive's actual contents), the retention logic
correctly pruning the 2 oldest of 5 fabricated backups with controlled
timestamps, `--dry-run` provably not creating or deleting anything while
still reporting what it would do, and three argument-validation
rejections. All passing.

## 2026-08-29

Added `scripts/polynomial.py` — single-variable polynomial arithmetic:
add, subtract, multiply, Horner's-method evaluation, and differentiation.
Trims trailing zero coefficients on every construction so degree always
reflects the true highest non-zero term. `tests/test_polynomial.py`
(26 tests) covers construction edge cases (trailing zeros, all-zero,
empty input, degree tracking), all four arithmetic operations including a
resulting zero leading term getting trimmed and a polynomial minus itself
being zero, Horner evaluation against hand-computed values, derivatives
including a constant's derivative and a second derivative, string
formatting (multi-term, negative middle terms, the zero polynomial,
coefficient-1 omission), and coefficient-string parsing. All passing.
Smoke-tested for real via the CLI across formatting, evaluation, and
derivative modes, checked by hand against the math.

Added `scripts/urlcheck.sh` — checks a URL's HTTP status code and response
time via curl, reporting OK/WARN/FAIL against an expected status and an
optional latency threshold; distinct exit codes for "wrong status/too
slow" (1) vs. "couldn't connect at all" (2). `tests/test_urlcheck.sh`
(17 tests) runs against real live requests to example.com (IANA-reserved
for exactly this use, so it's a stable target) — a real 200 reporting OK,
a genuine 404 path matching an `--expect-status 404` check, a status
mismatch reporting FAIL, an impossibly tight 1ms latency threshold
reliably triggering WARN against a real network round trip, a generous
threshold not triggering it, an unreachable host hitting the hard-failure
exit code, and three argument-validation rejections. All passing. Skips
cleanly instead of failing outright if there's no network access.
Smoke-tested by hand against example.com first (correct/wrong status,
tight/loose latency thresholds, and a genuinely unreachable host) before
the millisecond-parsing logic (dodging bc/awk float math by exploiting
curl's fixed 6-decimal-digit time_total format) went into the test suite.

## 2026-08-28

Added `scripts/statemachine.js` — a small finite state machine: named
states, named events with optional guards, and onEnter/onExit hooks
around each transition. `tests/test_statemachine.js` (13 tests) covers
starting state, an unknown-initial-state throw, a defined event
transitioning and returning true, an undefined event being a no-op
returning false, a full cycle, `can()`, `history` recording every state
(including the initial one) and returning a mutation-safe copy,
onEnter/onExit firing in the correct order, a failing guard blocking the
transition, a passing guard letting it through, shared mutable context,
and an undefined transition target throwing. All passing. Smoke-tested
for real by modeling a small order-processing workflow (pending -> paid
-> shipped, with a guard on payment amount) and confirming the guard
correctly blocked/allowed the transition and hooks fired in order.

Added `scripts/processwatch.sh` — checks whether a process is alive by
PID/pidfile or a best-effort name pattern, optionally running a restart
command and re-checking if it isn't. Hit two real, non-obvious bugs while
building and smoke-testing this one, both fixed before writing the test
suite: (1) this platform's `ps -W` fallback (used since neither `pgrep`
nor POSIX `ps -eo` exist here) only exposes a process's executable path,
never its actual arguments, meaning `--pattern` against a script name can
never match here — discovered by testing against a real launched script
and getting a false NOT-RUNNING result, then confirmed by inspecting raw
`ps -W` output directly; documented as a platform-dependent limitation
rather than silently left broken, with `--pid`/pidfile promoted to the
primary, reliable mode (`kill -0`, portable everywhere) instead.
(2) the resolved PID from a pidfile was being cached once at startup, so
after `--restart-cmd` rewrote the pidfile with a new PID, the
restart-confirmation retry loop kept checking the stale PID and always
reported failure even when the restart genuinely worked; fixed by
re-reading the pidfile fresh on every liveness check.
`tests/test_processwatch.sh` (16 tests) runs entirely against real
backgrounded processes and real PIDs, including the full restart path
against an actual pidfile-rewriting restart command. All passing.

## 2026-08-27

Added `scripts/colorconvert.js` — converts colors between hex, RGB, and
HSL, implementing the real max/min/delta-based conversion formulas rather
than an approximation. `tests/test_colorconvert.js` (17 tests) covers hex
parsing (6-digit, no-`#`, 3-digit shorthand expansion, case-insensitivity,
invalid-input rejection), hex formatting and its range/integer validation,
RGB->HSL for pure red/white/black/neutral-gray (each a known,
hand-verifiable value) plus a real-world color's exact conversion,
HSL->RGB round-tripping the same known colors, out-of-0-360 hues wrapping
correctly, and a full hex->RGB->hex round trip landing on the exact
original string. All passing. Smoke-tested for real across all three
input formats via the CLI, including confirming that hex->HSL->RGB
rounding drift (52 vs. 51 on one channel) is harmless: converting the
drifted RGB back to HSL still lands on the identical HSL value.

Added `scripts/envcheck.sh` — checks that a list of required environment
variables are set and non-empty in the current shell, reporting MISSING
and EMPTY separately (an unset var and a var deliberately set to ""
usually mean different things went wrong). Takes variable names directly
or via a `--file` list that skips comments and blank lines.
`tests/test_envcheck.sh` (16 tests) runs against a real shell environment
with actually-exported variables (not mocked) — a mixed set/empty/missing
case reported correctly with the right exit code, a fully-satisfied check
exiting 0, `--file` correctly skipping comments/blanks while checking the
real names, and five distinct rejection cases (invalid name, digit-leading
name, no arguments, missing requirements file, `--file` combined with
positional args). All passing. Smoke-tested for real by exporting actual
environment variables in the shell first and running the script directly
against them before writing any of the formal tests.

## 2026-08-26

Added `scripts/checksum-verify.sh` — generates or verifies a manifest of
SHA-256 checksums for every file under a directory, reporting MISMATCH,
MISSING, and EXTRA files separately instead of a flat pass/fail like plain
`sha256sum -c`. `tests/test_checksum-verify.sh` (18 tests) covers
well-formed hash generation checked directly against `sha256sum`'s own
output, `--out` writing a real manifest, a clean verify, a dirty tree
catching one of each failure mode simultaneously with the correct exit
code, an empty directory, and four argument-validation error cases. All
passing. Hit a real bug while smoke-testing on this platform before
writing the tests: GNU `sha256sum` prefixes its output line with a literal
backslash whenever the given path contains a backslash — true of every
path here — and that marker was leaking into the stored hash via a naive
`cut -d' ' -f1`, silently corrupting every checksum in the manifest. Fixed
by stripping the leading backslash before extracting the hash field.

Added `scripts/sudoku_solver.py` — solves a 9x9 Sudoku via backtracking
with row/column/box constraint checking. Validates the input isn't
already contradictory before attempting to solve, so an already-broken
puzzle fails immediately with a clear message instead of searching a
space that can never succeed. `tests/test_sudoku_solver.py` (15 tests)
covers both accepted input formats, malformed-input rejection,
placement-validity checks for each of the three constraint types
individually, solving a known puzzle to its known solution, confirming
the solved grid is a fully valid Sudoku (every row/column/box a genuine
permutation of 1-9, not just non-empty), an already-solved grid passing
through unchanged, a contradictory grid correctly failing, and the
formatted output's box separators. All passing. Smoke-tested for real
against an actual puzzle file (solved correctly, verified by eye) and via
stdin, plus a deliberately broken puzzle to confirm it's rejected before
the solver even starts searching.

## 2026-08-25

Added `scripts/ipcalc.py` — IPv4 subnet calculator: given an address in
CIDR notation, reports the network/broadcast address, netmask, wildcard
mask, usable host range, and host counts, built on stdlib `ipaddress`.
Handles `/31` (RFC 3021 point-to-point, both addresses usable) and `/32`
(single host) as explicit special cases rather than letting the normal
"first and last address reserved" math silently produce zero or negative
usable hosts. `tests/test_ipcalc.py` (11 tests) covers a typical `/24`, a
small `/30`, the `/31` and `/32` edge cases, a large `/8`, the
entire-address-space `/0`, host bits being masked out of the reported
network while preserved in the original address, the wildcard mask being
the netmask's inverse, and rejection of an unparseable address and an
out-of-range prefix. All passing. Smoke-tested for real against `/24`,
`/30`, and `/32` inputs and checked the output by hand against known
subnet math.

Added `scripts/jwtdecode.js` — decodes a JWT's header and payload for
inspection (base64url decode + JSON pretty-print, plus a human-readable
summary of `iat`/`nbf`/`exp`), with signature verification explicitly and
deliberately out of scope — the CLI prints a reminder of that on every run
so it can't be mistaken for an auth check. `tests/test_jwtdecode.js`
(10 tests) covers decoding a well-formed token, round-tripping data whose
base64 form would need `+`/`/`/padding characters (proving the base64url
substitution is correct in both directions), all three padding-length
cases directly, rejecting a wrong segment count and invalid-JSON header/
payload separately, rejecting a non-string input, claim-description
formatting including a correctly-flagged expired token, and the
no-standard-claims-present case. All passing. Smoke-tested for real by
constructing an actual signed-shaped JWT (fake signature, real header/
payload) and decoding it via the CLI — timestamps and claims all printed
correctly.

## 2026-08-24

Added `scripts/sslcheck.sh` — reports how many days remain before a TLS
certificate expires (live `host:port` via `openssl s_client`, or a local
cert file), exiting 0/1/2 for OK/WARN/EXPIRED so it can be used directly
as a monitoring check. `tests/test_sslcheck.sh` (13 tests) runs entirely
against real `openssl`-generated certificates in a scratch dir — a
far-future cert, a ~4-day cert crossing the default warn threshold, the
same cert flipping back to OK under a tighter `--warn-days`, and a cert
with an explicit past validity window reporting EXPIRED — plus rejection
of a missing file, host+file given together, no arguments, and a
non-numeric `--warn-days`. All passing. Hit a real MSYS/Git-Bash gotcha
while building the test fixtures: a single leading slash in `-subj
"/CN=test"` gets silently path-converted to a Windows path before
reaching the native `openssl.exe`, corrupting the subject; fixed by using
`"//CN=test"` (the standard MSYS escape) instead of reaching for
`MSYS_NO_PATHCONV=1`, which broke resolving `mktemp -d`'s `/tmp/...` paths
instead. Also smoke-tested for real against a live host (`github.com`,
correctly reported 37 days remaining) in addition to the local fixtures.

Added `scripts/wordwrap.js` — wraps plain text to a fixed column width,
breaking at word boundaries, preserving blank-line paragraph breaks, and
hard-breaking any single word longer than the width instead of letting it
overflow. Takes an optional `indent` that counts against the requested
width rather than pushing lines past it. `tests/test_wordwrap.js`
(11 tests) covers text that already fits, breaking only at word
boundaries, whitespace collapsing, empty input, a long word hard-breaking
into exact-width chunks (both standalone and mid-paragraph after topping
off the current line), paragraph preservation, internal-newline
collapsing, indent behavior, a non-positive width throwing, and
independent wrapping of multiple paragraphs. All passing. Smoke-tested for
real against an actual two-paragraph text file at several widths and with
an indent, plus piped through stdin — output matched expectations in
every case.

## 2026-08-21

Added `scripts/logrotate.sh` — rotates a log file past a size threshold
(`app.log` -> `app.log.1.gz`, shifting older generations up to `.2.gz`,
`.3.gz`, ... and dropping anything beyond `--keep`), gzip-compressed by
default with a `--no-compress` plain-text option. `tests/test_logrotate.sh`
(18 tests) covers the no-op-under-threshold case, a first rotation
preserving content and truncating the original, a second rotation
correctly shifting `.1.gz` to `.2.gz`, `--no-compress` output, `--keep 0`,
the retention cap actually dropping older content on a third rotation, and
rejection of a missing file and a non-numeric `--max-size`. All passing.
Smoke-tested for real against scratch files first and caught a real bug in
the process: with `--keep 0` the completion message claimed the content
was rotated to a `.1.gz` file that was never actually created (content was
silently discarded instead) — fixed the message to honestly say
"discarded" before writing the test suite around the corrected behavior.

Added `scripts/promisepool.js` — runs an array of async tasks with a
concurrency cap, resolving with results in original task order regardless
of completion order. Takes a `stopOnError` option: fail-fast (default,
matching `Promise.all`) or collect every result `allSettled`-style even
after failures. `tests/test_promisepool.js` (9 tests) covers order
preservation, the concurrency cap never being exceeded (checked via a live
counter, not inferred from timing), concurrency exceeding the task count,
an empty task list, strictly-sequential behavior at concurrency 1, both
`stopOnError` modes, a synchronous throw being treated as a rejection, and
`concurrency < 1` throwing. All passing. Smoke-tested for real with six
simulated randomized-duration fetches at a concurrency cap of 2 — max
concurrent tasks observed live via a counter never exceeded 2, and results
came back in the original `a..f` order despite finishing out of order.

## 2026-08-20

Added `scripts/cronparse.sh` — validates a 5-field cron expression and
describes it in plain English (e.g. `*/15 * * * *` -> "Runs every 15
minutes."). Supports `*`, `*/N` steps, single values, `A-B` ranges, and
plain-number comma lists per field, with real bounds checking (minute
0-59, hour 0-23, day-of-month 1-31, month 1-12, day-of-week 0-7 with both
0 and 7 meaning Sunday) and specific error messages for backwards ranges,
zero/negative steps, and non-numeric values. `tests/test_cronparse.sh`
(14 tests) checks exact output strings for each field-syntax variant, all
five fields combining into one sentence, the Sunday alias, and seven
distinct rejection cases. All passing. Smoke-tested for real against a
dozen expressions before writing the tests, including a mixed-list-item
rejection and a backwards-range rejection, to lock down the exact wording
the tests now check.

Added `scripts/linediff.js` — a from-scratch line diff via longest common
subsequence, printed unified-diff style (`-`/`+`/` ` prefixes, collapsible
context like `diff -u`). `tests/test_linediff.js` (13 tests) covers
identical inputs, single add/delete, a replaced line rendering as
delete-then-add, fully disjoint inputs, both empty-vs-non-empty
directions, `hasChanges` accuracy, both default and zero-context
formatting, and a longer diff confirming unchanged lines stay intact
around a single change. All passing. Smoke-tested for real as a CLI
against two actual files — caught and fixed a real bug in the process:
naively splitting a file's content on `"\n"` produces a phantom empty
trailing line when the file ends in a newline (which almost all text files
do), showing up as a spurious extra blank diff line; fixed by stripping
exactly one trailing empty element after the split.

## 2026-08-19

Added `scripts/heap.js` — an array-backed binary min-heap / priority queue:
`push`/`pop`/`peek` in `O(log n)` (`O(1)` for `peek`), plus a static
`heapify()` that builds a heap from an existing array in `O(n)` via the
standard bottom-up sift-down construction, instead of `O(n log n)` from
individual pushes. Takes an optional comparator so it doubles as a max-heap
or a priority queue over objects. `tests/test_heap.js` (12 tests, Node's
built-in test runner) covers ascending pop order, peek without removal,
size tracking, both empty-heap error cases, duplicate values, a custom
max-heap comparator, an object priority queue, `heapify` correctness, and a
500-element randomized input checked against `Array.prototype.sort`. All
passing. Smoke-tested for real as a task priority queue — pushed four
`{task, priority}` objects out of order and popped them back out in
priority order.

Added `scripts/logparse.py` — parses Apache/Nginx "combined" access log
lines via a single regex and reports status code counts, top client IPs,
top request paths, and total bytes transferred. Non-conforming lines are
counted as `skipped` rather than raising, and a `-` byte count is treated
as `0`, both real cases in production log files. `tests/test_logparse.py`
(12 tests) covers field parsing, the `-` byte case, malformed/empty lines
returning `None` instead of raising, full `analyze()` totals across a mixed
sample (matched/skipped counts, per-status, per-IP, per-path, byte sum), an
empty input, and `format_report()`'s `--top` truncation. All passing.
Smoke-tested for real against a 7-line sample log (including one deliberately
malformed line) both as a file argument and piped through stdin — output
matched expectations both ways.

## 2026-08-17

Added `scripts/huffman.py` — a real Huffman coding compressor/decompressor:
builds a binary tree from byte frequencies via a min-heap, generates
prefix-free codes, and packs them into a small self-contained binary format
(magic + original length + frequency table + packed bits). Handles the
degenerate single-symbol and empty-input cases explicitly instead of
crashing on a zero-length code. `tests/test_huffman.py` (12 tests) covers
round-tripping empty input, a single repeated byte, ordinary text, all 256
byte values, random binary data, and that a skewed distribution actually
compresses smaller than the input — plus a direct check of the Huffman
prefix property (no code is a prefix of another) and that more frequent
symbols never get longer codes than rarer ones. All passing. Smoke-tested
for real: compressed a 9000-byte sample text to 5175 bytes (57.5%) and
diffed the decompressed output against the original — identical.

Added `scripts/gitprune.sh` — lists (or `--delete`s, with a confirmation
prompt unless `--yes`) local git branches already merged into a base branch
(auto-detects `main`/`master`, or takes `--base`), always excluding the base
branch and whichever branch is currently checked out. Uses `git branch -d`
(never `-D`) so it can't discard unmerged work. `tests/test_gitprune.sh`
(11 tests) builds a real scratch repo with a merged branch and an unmerged
branch with its own commit, and asserts the merged one gets listed and
deleted while the unmerged one and the base branch are never touched, plus
rejection of a bad `--base` and a non-repo directory. All passing. Also ran
it for real against a scratch repo with two merged branches and one
unmerged branch — dry run and `--delete --yes` both behaved exactly as
expected.

## 2026-08-15

Added `scripts/loc.sh` — a tiny `cloc`-alike: counts lines of code per
file extension under a directory, `.git`/`node_modules`/`__pycache__`/
`.venv` pruned by default, `--exclude` for more, `--no-blank` to count
only non-blank lines. `tests/test_loc.sh` (10 tests) covers per-extension
totals across nested directories, the "(no extension)" bucket counting
real no-extension files but specifically *not* a pruned `.git/config`
(whose own basename also lacks an extension — the case that would
silently inflate the count if pruning were broken), `--no-blank`'s
non-blank-only totals, `--exclude` pruning an extra directory beyond the
defaults, an empty directory, and a missing path. All passing (after
fixing two arithmetic mistakes in my own fixture's expected counts — I'd
mentally logged `b.py`'s "0 blank lines" as "0 non-blank lines", which
are opposites). Real smoke test against this repo itself
(`loc.sh . --exclude .venv --exclude __pycache__`) — correctly broke down
py/sh/md/js/no-extension across all 62 tracked files.

Added `scripts/ini_parser.py` — parses and serializes simple INI-style
config (`[section]` headers, `key = value` or `key: value`, `;`/`#`
comments, optionally quoted values) into `{section: {key: value}}` and
back. `tests/test_ini_parser.py` (16 tests) covers basic section/key
parsing, keys before any section landing in the `""` section, full-line
and trailing comments being stripped, a comment marker mid-value with no
preceding whitespace correctly surviving (so a URL fragment doesn't get
truncated), quoted values being unquoted, blank lines, a later key
overwriting an earlier one, a repeated section header merging into the
same dict, the empty-input case, a malformed line raising with the
correct line number, `:` as an alternate separator, and `dump()`'s
ordering, empty-input, and round-trip behavior. All passing. Real smoke
test against a sample config with a full-line comment, a trailing
comment, a quoted value with spaces, and a URL containing `#` — the
trailing comment was correctly stripped while the URL's `#replica-1`
correctly survived untouched, exactly the distinction the parser is
supposed to make.

## 2026-08-13

Added `scripts/eventemitter.js` — a minimal pub/sub event emitter:
`on`/`once`/`off`/`emit`, a wildcard `"*"` listener that hears every event
(with the event name prefixed to its args), and error isolation — a
listener that throws doesn't stop its siblings in the same `emit()` call.
The error goes to `emitter.lastError` and is forwarded to `"error"`
listeners instead, with a recursion guard so an `"error"` listener itself
throwing doesn't loop forever. `tests/test_eventemitter.js` (13 tests,
Node's built-in `node:test`) covers basic dispatch, multiple listeners
firing in registration order, `once()` auto-removal, both forms of
`off()`, the wildcard behavior, both error-isolation paths, `emit()`'s
boolean return value, `listenerCount()`, method chaining, and the
non-function-listener TypeError. All passing. Real smoke test: a small
"login" event bus with a regular listener, a wildcard logger, and a
`once()` bonus handler — confirmed the bonus fires only on the first
`emit()`, everything else fires on both.

Added `scripts/dirsize.sh` — reports the largest immediate entries (files
and directories, directories sized recursively via `du -sb`) under a
path, sorted descending, human-readable by default, with `-n` to limit
how many print, `--threshold SIZE` to flag entries at or above a cutoff,
and `--bytes` for raw counts. `tests/test_dirsize.sh` (19 tests) covers
sort order across genuinely far-apart sizes (3M/500K/100K/20B, so no
rounding could put two entries in striking distance of each other),
correct human-readable formatting, `--bytes` exact counts, `-n` limiting
output while the summary still counts every entry, `--threshold` flagging
correctly, an empty directory, a missing path, and a non-numeric `-n`.
All passing. Real smoke test against this repo itself
(`dirsize.sh . -n 5 --threshold 50K`) — `.git`, `tests`, and `scripts`
correctly flagged over the 50K threshold, `docs` and `devlog.md` correctly
left unmarked.

## 2026-08-12

Starting today, changes land via a feature branch + PR instead of a direct
push to `main` — same daily commit structure as before, just opened as a PR
first. First branch: `daily/2026-08-12`.

Added `scripts/envdiff.sh` — compares two `.env`-style files and reports
added/removed/changed keys, with values **masked by default** (`***`) since
this is explicitly a secrets-file comparison tool; `--show-values` opts into
real values. Same "safe default, explicit opt-in for the unsafe path"
reasoning as `template.js`'s HTML-escaping. `tests/test_envdiff.sh` (10
tests) covers added/removed/changed detection, unchanged keys correctly
omitted from the diff, the raw secret value never appearing anywhere in
default output, `--show-values` actually revealing values, identical files,
and a missing file being a clean error. All passing. Real smoke test against
two actual env files with a changed DB host, a rotated API key, and one
added flag - masked by default, values visible with `--show-values`.

Added `scripts/graph.py` — adjacency-list directed graph with BFS shortest
path (unweighted, fewest edges) and topological sort (Kahn's algorithm,
raises on a cycle). `tests/test_graph.py` (12 tests) covers direct edges,
start==end, correctly picking the actual shortest path among multiple
candidates (not just "a" path), unreachable/unknown nodes, that edge
direction is respected (it's a directed graph, so b->a must not exist just
because a->b does), a simple chain and a real multi-constraint DAG for
topo-sort, an isolated node being included, cycle detection, and an empty
graph. All passing. Ran the CLI for real against a JSON "getting dressed"
dependency graph - topo-sort produced a valid order respecting every
constraint (socks-before-shoes, underwear-before-pants-before-shoes,
shirt-before-jacket), shortest-path found the 2-edge underwear->pants->shoes
route, and a genuinely unreachable node (a hat with no edges) correctly
reported "No path found." instead of erroring.

## 2026-08-11

Added `scripts/markov.py` — a Markov chain text generator: n-gram
transition table built from counting what token follows what in a corpus,
then weighted-random sampling to generate new text. Documented honestly in
`docs/markov.md` that this is frequency counting + sampling, not a neural
net or anything ML-model-shaped, since it'd be easy to oversell given the
"text generation" framing. `tests/test_markov.py` (11 tests) covers the
transition table for a known corpus (including that repeated transitions
are kept as repeats, not deduped - that's what makes sampling weighted),
order-3 keys, a corpus too short for the requested order, reproducibility
via a seeded RNG (same seed -> byte-identical output), different seeds
being able to diverge, every generated token coming from the corpus
vocabulary, stopping cleanly when a key has no recorded continuation, and
`max_tokens` capping length. All passing. Ran it for real against a
3-sentence corpus about a fox and a dog and confirmed `--seed 1` gave
identical output on two separate runs.

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
