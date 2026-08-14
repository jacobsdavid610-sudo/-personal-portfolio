# logparse.py

Parses simple leveled log lines, filters by minimum severity and/or an
inclusive time range, and summarizes counts per level. Pure stdlib.

Expected line format: `<ISO8601 timestamp> <LEVEL> <message>`, e.g.
`2026-08-14T10:15:32 ERROR Database connection failed`. Levels are the
standard Python `logging` set: `DEBUG`, `INFO`, `WARNING`, `ERROR`,
`CRITICAL`.

## CLI usage

```
logparse.py <logfile> [--level LEVEL] [--since TIMESTAMP] [--until TIMESTAMP] [--summary]
```

- `--level LEVEL` — keep only lines at or above that severity (e.g.
  `--level ERROR` keeps `ERROR` and `CRITICAL`, drops everything lower).
- `--since` / `--until` — ISO8601 timestamps, inclusive bounds.
- `--summary` — print per-level counts instead of the matching lines
  themselves.

## Real example

```
$ logparse.py sample.log --level ERROR
2026-08-14T09:20:45 ERROR failed to connect to upstream db
2026-08-14T09:21:12 CRITICAL upstream db unreachable, shutting down

2 matching line(s), 1 unparsed line(s) skipped.

$ logparse.py sample.log --summary
DEBUG    1
INFO     2
WARNING  1
ERROR    1
CRITICAL 1

6 matching line(s), 1 unparsed line(s) skipped.
```

The one stray non-log line in the sample file (`not a log line, should be
skipped`) is silently excluded from both the matches and the summary, but
still counted in the trailing "unparsed" tally so a genuinely malformed
line never disappears without a trace.

## API

```python
from logparse import parse_line, parse_lines, filter_entries, summarize

entries, unparsed = parse_lines(open("sample.log"))
errors = filter_entries(entries, level="ERROR")
counts = summarize(errors)  # {"ERROR": 1, "CRITICAL": 1}
```

- `parse_line(line)` — one line -> a `LogEntry`, or `None` if it's blank,
  malformed, or has an unrecognized level.
- `parse_lines(lines)` — `(entries, unparsed_count)`. Blank lines are
  ignored entirely (not counted as unparsed); non-blank lines that fail
  to parse are counted but dropped.
- `filter_entries(entries, level=None, since=None, until=None)`.
- `summarize(entries)` — `{level: count}` in ascending severity order,
  omitting levels with zero occurrences.

## Design notes

- Blank lines are excluded from the "unparsed" count on purpose — an
  empty line in a log file is normal noise, not a line someone should
  have to go investigate. A line with actual content that still doesn't
  match the expected shape is a different, worth-flagging case.
- `summarize()`'s output order is fixed severity order, not
  first-seen-in-the-file order, so the same log always summarizes the
  same way regardless of which level happened to appear first.

## Exit codes

Standard Python behavior: `0` on success, non-zero (via an uncaught
exception / argparse) if the log file doesn't exist or an argument is
invalid.

## Running the tests

```
python -m unittest tests.test_logparse -v
```

18 tests: well-formed line parsing (including multi-word messages),
unrecognized level, malformed line, bad timestamp, and blank line all
correctly returning `None`; `parse_lines` correctly separating real
entries from the unparsed count and not counting blank lines against it;
`filter_entries` for minimum severity, inclusive `since`, inclusive
`until`, and all three combined; `summarize`'s counts, its omission of
zero-count levels, its severity-order (not first-seen-order) output, and
the empty-input case; and a sanity check that `LEVELS` itself is in
ascending severity order.
