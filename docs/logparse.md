# logparse.py

Parses Apache/Nginx "combined" access log lines and reports summary stats:
status code counts, top client IPs, top request paths, and total bytes
transferred.

## Why

The quick "what's actually hitting this server" gut-check, without piping
`awk`/`cut`/`sort` chains by hand or reaching for an ELK stack — a single
regex over the standard combined log format plus a few `Counter`s.

## Usage

```
logparse.py [file] [-n TOP]
```

- `file` — path to an access log. Defaults to stdin if omitted.
- `-n, --top N` — how many top IPs/paths to show (default: 5).

## Example

```
$ logparse.py access.log --top 3
Lines: 7 total, 6 parsed, 1 skipped (unmatched format)
Total bytes transferred: 4172

Status codes:
  200: 4
  404: 1
  500: 1

Top 3 client IPs:
       3  203.0.113.5
       2  198.51.100.7
       1  203.0.113.99

Top 3 paths:
       3  /index.html
       1  /about.html
       1  /missing
```

Also works piped through stdin: `cat access.log | logparse.py -n 1`.

## Exit codes

- `0` — success (including when every line is unmatched — it's reported
  as `skipped`, not treated as an error).
- non-zero — the CLI's own file-not-found error if `file` doesn't exist.

## Design notes

- Only the combined log format is matched (`IP - - [time] "METHOD path
  proto" status bytes`); lines that don't match are counted under
  `skipped` rather than raising, since real-world log files often have a
  stray non-conforming line (a logrotate banner, a truncated final line)
  that shouldn't blow up the whole report.
- A `-` byte count (common when a request has no response body) is
  treated as `0` bytes, not skipped or NaN'd — it's a valid, real value in
  the combined format, not a parse failure.
- Query strings and fragments are part of `path` as-is (`/search?q=x` is
  its own distinct path from `/search`) — no normalization, since
  collapsing those is a product decision this tool shouldn't make for you.

## Running the tests

```
python -m unittest tests.test_logparse -v
```

12 tests: parsing a well-formed line's fields, a `-` byte count becoming
`0`, a malformed line returning `None` (not raising), an empty line, full
`analyze()` totals (total/matched/skipped line counts, per-status counts,
per-IP counts, per-path counts, total bytes summing only matched lines),
an empty input, and `format_report()` producing the right header numbers
and correctly limiting the IP/path sections to `top_n` entries.
