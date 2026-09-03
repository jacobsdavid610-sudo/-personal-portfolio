# diskalert.sh

Checks filesystem usage percentage for one or more paths against
warn/critical thresholds, and exits with a Nagios/Icinga-plugin-style
status code — `0` OK, `1` WARNING, `2` CRITICAL, `3` UNKNOWN — so it can be
dropped straight into existing monitoring without a wrapper. Uses `df -P`,
no dependencies beyond coreutils.

## Why

Most "check disk space" one-liners either just print `df -h` and rely on a
human to eyeball it, or hardcode a single path and threshold. This checks
any number of paths in one call, reports the worst status across all of
them as the process exit code, and uses the same 0/1/2/3 convention real
monitoring systems already expect — so it's a drop-in check script, not
just a report.

## Usage

```
diskalert.sh [PATH ...] [--warn PCT] [--critical PCT]
```

- No `PATH` given defaults to `/`.
- `--warn` defaults to `80`, `--critical` to `90`. Both must be
  non-negative integers, and `--warn` must be `<= --critical`.
- Prints one `OK:` / `WARNING:` / `CRITICAL:` / `UNKNOWN:` line per path,
  each with the parsed percentage and mount point.

## Real example

```
$ diskalert.sh . --warn 1 --critical 2
CRITICAL: . (/c) is 79% full (>= 2%)
$ echo $?
2
```

## Design notes

- **Exit code is the worst status across every path checked**, not just
  the last one — `diskalert.sh /var /home` should fail loudly if either
  one is over threshold, not silently report only the last path's status.
- **A path that doesn't exist fails fast with exit `3`**, checked before
  any `df` call, rather than letting a cryptic `df` error message stand in
  for a clear one.
- **`UNKNOWN` (exit `3`) is distinct from `CRITICAL`.** Some filesystems
  (certain virtual/network mounts) report a non-numeric `Capacity` column
  from `df`; treating that as "can't tell" rather than silently as `0%` or
  crashing on an arithmetic comparison against a non-integer is the honest
  answer.
- `df -P` (POSIX format) is used specifically because it guarantees one
  line of output per filesystem — the non-portable default `df` format can
  wrap onto a second line for a long device name, which would break
  column-position parsing.

## Exit codes

`0` OK (all paths under `--warn`), `1` WARNING (at least one path at or
above `--warn` but below `--critical`), `2` CRITICAL (at least one path at
or above `--critical`), `3` UNKNOWN (a path doesn't exist, usage couldn't
be parsed, or the arguments themselves are invalid).

## Running the tests

```
bash tests/test_diskalert.sh
```

14 tests, run against a stubbed `df` (prepended onto `PATH`) so the
percentages are fully controlled rather than depending on the test
machine's actual disk usage: under-threshold reports OK, between
warn/critical reports WARNING, at/over critical reports CRITICAL,
unparseable `Capacity` output reports UNKNOWN, custom `--warn`/`--critical`
correctly move a percentage between buckets, checking multiple paths at
once reports the worst status as the overall exit code, a nonexistent
path errors out before any `df` call, and both a non-numeric threshold and
`--warn` greater than `--critical` are rejected.
