# secretscan.sh

Scans files under a directory for patterns that look like leaked
credentials, and reports `file:line:rule` with the matched secret
redacted in the output — never printed in full, even in the scanner's
own findings. Meant for a pre-commit hook or CI gate: exit `1` means
something was found. Wraps `grep`; no other dependencies.

## Why

A secrets scanner that reprints the secret it found, in a CI log
everyone on the team can read, has fixed one leak by creating a second
one — often a more durable one, since CI logs tend to stick around and
get indexed longer than the original commit does. So redaction here
isn't a nice-to-have on top of detection, it's a real requirement: the
tool's own output has to be safe to paste into a Slack message or a PR
comment without re-leaking what it found.

## Rules

| Rule | Catches |
|---|---|
| `AWS_ACCESS_KEY_ID` | `AKIA` + 16 alphanumeric characters |
| `PRIVATE_KEY_BLOCK` | a PEM `-----BEGIN ... PRIVATE KEY-----` header |
| `GITHUB_TOKEN` | `ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_` + 36 characters |
| `SLACK_TOKEN` | `xoxb-`/`xoxa-`/`xoxp-`/`xoxr-`/`xoxs-` tokens |
| `GENERIC_ASSIGNMENT` | `api_key`/`secret`/`token`/`password` assigned a quoted 12+ character value |

Deliberately a short, specific list rather than a large "catch
everything vaguely secret-shaped" pattern set — a scanner with a high
false-positive rate is one people learn to ignore, which defeats the
purpose more thoroughly than missing a rarer credential format would.

## CLI usage

```
secretscan.sh <path> [--ignore GLOB]...
```

Recurses `<path>`, skipping `.git/` and `node_modules/` always, plus any
`--ignore` glob(s) given (matched against the full path, repeatable).
Binary files are skipped automatically (`grep -I`).

## Real example

```
$ secretscan.sh . --ignore '*/fixtures/*'
config.py:1: AWS_ACCESS_KEY_ID: AKIA…redacted…
deploy/creds.txt:1: GITHUB_TOKEN: ghp_…redacted…

Scanned 214 file(s), 2 finding(s).
$ echo $?
1
```

```
$ secretscan.sh . && echo "clean"

Scanned 214 file(s), 0 finding(s).
clean
```

## Design notes

- **Redaction shows a fixed placeholder, not a length-preserving mask.**
  Replacing a secret with `AKIA…redacted…` rather than
  `AKIA****************` avoids leaking the secret's exact length too —
  a minor thing on its own, but length is one more piece of information
  a real credential scanner shouldn't be handing out for free.
- **Found the hard way: `--` has to come before the pattern, not just
  before the filename.** The first version called `grep -InE "$pattern"
  -- "$file"`. That's the usual `--` placement for protecting a
  filename that might start with `-`, but grep stops parsing *all*
  subsequent arguments as options only once it's seen `--` — and
  `PRIVATE_KEY_BLOCK`'s own pattern, `-----BEGIN [A-Z ]*PRIVATE
  KEY-----`, starts with `-----`. With `--` after the pattern, grep
  read the pattern itself as a string of bogus short options and
  errored out, silently producing zero matches for every rule on every
  file, not just that one — the loop's `2>/dev/null` swallowed the
  error, so the whole thing looked like "no secrets found" instead of
  "broken." Caught only by testing the private-key rule specifically,
  not just the rules with alphanumeric-only patterns. Fixed by moving
  `--` immediately after the flags, before the pattern, on both grep
  calls (`grep -InE -- "$pattern" "$file"` and `grep -oE -- "$pattern"`
  for the extraction step) — now nothing after `--` can be
  misinterpreted as an option, regardless of what the pattern itself
  looks like. A dedicated fixture for the private-key rule stayed in
  the test suite specifically so this can't regress silently again.
- **Multiple rules can each report the same line.** A line like
  `token = "ghp_..."` matches both `GITHUB_TOKEN` and
  `GENERIC_ASSIGNMENT`. That's left as two findings rather than
  deduplicated, since each rule identifies a different *kind* of
  problem and collapsing them would hide which specific pattern(s)
  matched.
- **The redact function's short-match branch is defensive, not
  exercised by any current rule.** Every existing pattern's minimum
  match length is well over 4 characters, so the "match is too short to
  show a prefix safely" path can't currently be hit through the CLI —
  kept anyway since it costs nothing and a future shorter-pattern rule
  would otherwise silently print a token-length string.

## Exit codes

`0` if nothing was found, `1` if at least one finding was reported, `2`
on a usage error or a path that doesn't exist.

## Running the tests

```
bash tests/test_secretscan.sh
```

22 assertions against real fixture files covering: each of the five
rules firing on its own dedicated fixture (including the private-key
regression case above), full secrets never appearing anywhere in the
tool's own output, a clean line not being falsely flagged, `.git/` and
`node_modules/` being excluded from the scan (checked by absence in the
findings, not just by not crashing), an embedded key inside a binary
file never being reported, the exit code being `1` when findings exist
and `0` for a clean directory, the summary line's finding count being
exactly right (6, not 5 — one line legitimately matches two separate
rules), `--ignore` excluding matching paths while leaving everything
else scanned, and both a bare invocation and a nonexistent path being
rejected. All passing.
