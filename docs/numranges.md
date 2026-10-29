# numranges.py

Parses compact integer ranges like `1-3,5,8-10` into a list of numbers,
and formats a list of numbers back into that shorthand. Pure stdlib
(`argparse`, `sys`).

## Why

Print dialogs, cron fields and "which line numbers" flags all use this
notation, and I keep half-writing a parser for it. The fiddly parts are
the ones that bite later: whitespace, overlapping pieces, a backwards
range, and a typo like `1-999999999` that quietly builds a giant list.

## API

```python
import numranges

numranges.parse("1-3,5,8-10")             # [1, 2, 3, 5, 8, 9, 10]
numranges.parse("5,1-4,3-6")              # [1, 2, 3, 4, 5, 6]
numranges.parse("1-99", limit=50)         # ValueError
numranges.format_ranges([1, 2, 3, 5, 8, 9, 10])   # "1-3,5,8-10"
```

- `parse(text, limit=None)` - sorted, de-duplicated list of ints. Empty
  or blank input gives `[]`. Raises `ValueError` for anything it can't
  read, a range that goes backwards, or a number above `limit`.
- `format_ranges(numbers)` - accepts unsorted input and duplicates.

## CLI usage

```
python scripts/numranges.py SPEC [--limit N] [--compact]
```

## Real example

```
$ python scripts/numranges.py 3-5
3
4
5
$ python scripts/numranges.py "8-10, 1-3,5,2" --compact
1-3,5,8-10
$ python scripts/numranges.py 5-3; echo $?
numranges: range goes backwards: '5-3'
1
```

## Design notes

- **A backwards range is an error, not a reversal.** `5-3` is far more
  likely to be a typo than a request for 5, 4, 3, and silently guessing
  hides it.
- **`limit` is checked before expanding.** The end of each range is
  compared first, so `1-999999999 --limit 100` fails immediately instead
  of building a billion-item set and then complaining.
- **A run of two is written `4,5`, not `4-5`.** The range form is the same
  length or longer for two numbers and only starts paying off at three.
- **Negative numbers aren't supported.** The `-` is the range separator,
  so `-5` would be ambiguous; it's rejected rather than guessed at.
- **Output is always sorted and de-duplicated**, so `--compact` doubles as
  a normaliser for a hand-typed spec.

## Exit codes (CLI)

- `0` - success.
- `1` - the spec couldn't be parsed or exceeded `--limit`; message on stderr.

## Running the tests

```
python -m unittest tests/test_numranges.py
```

18 tests: mixed singles and ranges, a single number, ignored whitespace,
unsorted and overlapping input, empty input, zero, a backwards range,
a set of malformed specs, `limit` rejecting before expansion, formatting
runs of three or more, a run of two staying as two numbers, unsorted
duplicates, empty input, parse/format round-trips, and the CLI for
expansion, `--compact`, errors on stderr, and `--limit`.
