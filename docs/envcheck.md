# envcheck.sh

Checks that a list of required environment variables are actually set —
and non-empty — before your real program starts, so a missing `DB_HOST`
fails fast with a clear message instead of three layers deeper with a
confusing connection error.

## Why

Different problem than [envdiff.sh](envdiff.md) (which diffs two `.env`
*files*): this checks the live shell environment a process is about to
inherit against a list of names it actually needs, which is exactly what
a deploy script or container entrypoint should do before `exec`'ing the
real command — fail fast with a clear list of what's missing, rather than
letting the app crash on its first DB query with a stack trace that
doesn't mention configuration at all.

## Usage

```
envcheck.sh VAR [VAR ...]
envcheck.sh --file <requirements-file>
```

- Positional args — one or more variable names to check directly.
- `--file` — a file listing one variable name per line. Blank lines and
  `#`-comments (including trailing `# comment` after a name) are skipped.

## Example

```
$ export DB_HOST=localhost DB_PORT=5432 DB_NAME=""
$ envcheck.sh DB_HOST DB_PORT DB_NAME DB_USER
MISSING: DB_USER
EMPTY:   DB_NAME

2 set, 1 missing, 1 empty (of 4 checked).

$ echo $?
1
```

With a requirements file:

```
$ cat required.env
# database config
DB_HOST
DB_PORT

$ envcheck.sh --file required.env
2 set, 0 missing, 0 empty (of 2 checked).
```

## Exit codes

- `0` — every checked variable is set and non-empty.
- `1` — at least one variable is missing or set-but-empty (both are
  listed separately, by name).
- `2` — usage error: no variable names given, an invalid variable name
  (must match `[A-Za-z_][A-Za-z0-9_]*`), a nonexistent `--file`, or
  `--file` combined with positional names.

## Design notes

- MISSING and EMPTY are reported separately, not lumped into one
  "problem" category — an unset variable and a variable deliberately set
  to `""` are different failure modes with different likely causes (a
  forgotten export vs. a config template that substituted nothing), and
  the fix for each is different too.
- Uses `${!name+set}` (indirect parameter expansion with the `+` test) to
  distinguish "variable is unset" from "variable is set to an empty
  string" — a plain `[ -z "${!name}" ]` alone can't tell those two cases
  apart, and they're exactly the distinction this tool exists to report.
- A requirements-file line is validated as a legal shell variable name
  before checking it, the same as a positional argument — a typo'd or
  malformed line in the file fails loudly with `exit 2` rather than
  silently being skipped or misinterpreted.

## Running the tests

```
bash tests/test_envcheck.sh
```

16 tests against a real shell environment (variables actually exported in
the test process, not mocked): a mix of set/empty/missing variables all
reported correctly with the right exit code, a fully-satisfied check
exiting 0 with no problem lines, `--file` correctly skipping comments and
blank lines while still checking the real names, and rejection of an
invalid variable name, a name starting with a digit, no arguments at all,
a nonexistent requirements file, and `--file` combined with positional
names.
