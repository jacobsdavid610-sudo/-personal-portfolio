# envdiff.sh

Compares two `.env`-style (`KEY=VALUE`) files and reports added, removed,
and changed keys. **Values are masked by default** — this is a secrets file
comparison tool, so the safe default is not printing secret values to a
terminal, log, or CI output unless you explicitly ask for them.

## Usage

```
envdiff.sh <file-a> <file-b> [--show-values]
```

Comments (`#...`) and blank lines are ignored. Only lines matching
`KEY=VALUE` (key starting with a letter or underscore) are compared.

## Real example

```
$ cat env_a
DATABASE_URL=postgres://old-host/db
LOG_LEVEL=info
API_KEY=sk-abc123

$ cat env_b
DATABASE_URL=postgres://new-host/db
LOG_LEVEL=info
API_KEY=sk-xyz789
FEATURE_FLAG_BETA=1

$ envdiff.sh env_a env_b
+ FEATURE_FLAG_BETA=***
~ DATABASE_URL: *** -> ***
~ API_KEY: *** -> ***

1 added, 0 removed, 2 changed.
```

`LOG_LEVEL` is unchanged, so it's correctly omitted from the diff entirely
— this tool reports *differences*, not every key.

With `--show-values` (only use this against output you already trust the
audience for — a shared terminal, CI log, or Slack post is not that):

```
$ envdiff.sh env_a env_b --show-values
+ FEATURE_FLAG_BETA=1
~ DATABASE_URL: postgres://old-host/db -> postgres://new-host/db
~ API_KEY: sk-abc123 -> sk-xyz789

1 added, 0 removed, 2 changed.
```

## Why masking is the default, not opt-in

It would have been easier to write this the other way around (show values,
add a `--mask` flag) but that puts the unsafe behavior on the path of least
resistance — the exact pattern that leads to a secret ending up in a CI log
or a pasted terminal output because nobody remembered the flag. Defaulting
to masked and making value-revealing an explicit, named opt-in
(`--show-values`) means the safe path is also the short path, same
reasoning as the HTML-escaping-by-default choice in [`template.js`](template.md).

## Exit codes

- `0` — ran successfully (including the "no differences" case).
- `1` — one of the given files doesn't exist.
- `2` — usage error (missing arguments).

## Running the tests

```
bash tests/test_envdiff.sh
```

10 tests: added/removed/changed keys all correctly masked by default,
unchanged keys correctly omitted, the raw secret value never appearing
anywhere in default output, `--show-values` actually revealing real values,
identical files reporting no differences, and a missing file being a clean
error rather than a crash.
