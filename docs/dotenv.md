# dotenv.py

Parses `.env` files: `KEY=VALUE` lines with comments, an optional
`export` prefix, single and double quotes, and `${VAR}` expansion. Pure
stdlib (`argparse`, `json`, `os`, `re`, `sys`).

## Why

`envcheck.sh`, `envdiff.sh` and `envtemplate.sh` all treat a `.env` file
as lines of text, which is fine until a value is `"a # b"` or refers to
another variable. I wanted one parser that gets those cases right and
that other scripts can import, instead of a different `grep | cut` each
time.

## API

```python
import dotenv

dotenv.parse('HOST=db\nURL="pg://${HOST}/app"')
# {"HOST": "db", "URL": "pg://db/app"}

dotenv.parse("A=${B:-fallback}")                  # {"A": "fallback"}
dotenv.parse("A=${B}", {"B": "from base"})        # {"A": "from base"}
```

- `parse(text, base_env=None)` - returns a dict in file order. Raises
  `dotenv.ParseError` (a `ValueError` with a `.lineno`) on a bad line.

## CLI usage

```
python scripts/dotenv.py FILE [--json] [--no-env]
```

`FILE` can be `-` for stdin. By default `${VAR}` can also fall back to
the process environment; `--no-env` turns that off.

## Real example

```
$ cat .env
export HOST=db.local   # primary
PORT=5432
URL="postgres://${HOST}:${PORT}/app"
RAW='${HOST}'
MISSING=${NOPE:-fallback}
$ python scripts/dotenv.py .env --no-env
HOST="db.local"
PORT="5432"
URL="postgres://db.local:5432/app"
RAW="${HOST}"
MISSING="fallback"
```

Output values are JSON-quoted so a value with a space or newline stays
on one line and can't be mistaken for another variable.

## Rules

- `#` starts a comment at the start of a line, or after whitespace in an
  unquoted value. `A=a#b` keeps the `#`.
- Double quotes allow `\n`, `\t`, `\r`, `\"`, `\` and `\$`. Any other
  backslash is kept as written, so `"C:\Users"` survives.
- Single quotes are fully literal: no escapes, no expansion.
- `${NAME}` and `${NAME:-default}` expand from variables defined
  *earlier* in the file, then from `base_env`. The default applies when
  the variable is missing or empty. An unknown variable with no default
  becomes an empty string.
- A later definition of the same key wins.

## Design notes

- **Expansion only looks backwards.** `A=${B}` before `B=1` gives an
  empty `A`. Letting later lines count would need dependency ordering and
  cycle detection, and the shell doesn't do it either.
- **File beats environment.** Variables set in the file shadow the process
  environment during expansion, so the result doesn't depend on what
  happened to be exported when you ran it.
- **Errors are strict.** A line with no `=`, a bad name, an unterminated
  quote, or stray text after a closing quote is an error with a line
  number, not something to skip. A silently dropped line in a `.env` is
  how a service starts with the wrong database.
- **`export` is only a prefix when followed by whitespace**, so a variable
  actually named `exported` still works.

## Exit codes (CLI)

- `0` - success.
- `1` - parse error, with the line number on stderr.
- `2` - the file couldn't be read.

## Running the tests

```
python -m unittest tests/test_dotenv.py
```

31 tests: plain pairs, comments, the `export` prefix and a key that only
starts with it, trailing comments, empty values, `=` inside values,
double-quote escapes and unknown escapes, literal single quotes, comments
after a closing quote, duplicate keys, key order, expansion from earlier
lines, from the base environment, file-over-environment precedence,
defaults, undefined names and forward references, every parse error
with its line number, and the CLI (plain output, `--json`, `--no-env`,
exit codes 1 and 2).
