# loc.sh

Counts lines of code per file extension under a directory — a tiny
`cloc`-alike. No dependencies beyond coreutils (`find`/`wc`/`awk`/`sort`).

## Usage

```
loc.sh <directory> [--no-blank] [--exclude NAME]...
```

- `--no-blank` — count only non-blank lines instead of every line.
- `--exclude NAME` — additionally prune any directory named `NAME` at any
  depth. Repeatable. `.git`, `node_modules`, `__pycache__`, and `.venv`
  are excluded by default.

## Real example

```
$ loc.sh . --exclude .venv --exclude __pycache__
py                     1785
sh                     1182
md                     1065
js                     1045
(no extension)            2

62 file(s), 5079 line(s) total under .
```

## Design notes

- **Extension detection treats a leading dot as not an extension.**
  `.gitignore` has no extension (it's a dotfile, not a file with an empty
  name and a `.gitignore` suffix); `.env.local` does — its extension is
  `local`. This matches how people actually talk about these files.
- **Default excludes are directory *names*, matched at any depth**, via
  `find`'s `-prune` — so `some/deep/path/node_modules` gets skipped just
  like a top-level one, without needing `--exclude` for the common cases.

## Exit codes

- `0` — ran successfully (including the "no files found" case).
- `1` — the given path doesn't exist or isn't a directory.
- `2` — usage error (missing directory argument).

## Running the tests

```
bash tests/test_loc.sh
```

10 tests: per-extension totals across files in nested directories, the
"(no extension)" bucket counting real no-extension files but *not*
`.git/config` (whose own basename also has no extension — the sensitive
case that would silently inflate the count if pruning were broken),
`--no-blank` producing the correct non-blank-only totals, `--exclude`
correctly pruning an extra directory beyond the defaults, an empty
directory, and a missing path being a clean error.
