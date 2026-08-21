# logrotate.sh

Rotates a log file once it exceeds a size threshold: `app.log` becomes
`app.log.1.gz`, any existing `.1.gz` shifts to `.2.gz`, and so on, dropping
whatever falls off the end of `--keep`. A minimal, from-scratch version of
what the real `logrotate` does for a single file.

## Why

A different angle on file management than [prune_old_files.sh](prune_old_files.md)
(age-based deletion) or [dirsize.sh](dirsize.md) (size *reporting*) — this
one actively manages a growing file in place: keep the log usable (bounded
size) without losing recent history (bounded retention), which is the
actual operational problem, not just "tell me what's big."

## Usage

```
logrotate.sh <logfile> --max-size BYTES [--keep N] [--no-compress]
```

- `logfile` — the file to check/rotate.
- `--max-size BYTES` — rotate only if the file is currently larger than
  this (bytes).
- `--keep N` — how many rotated generations to retain (default: 5).
  `--keep 0` rotates the file (empties it) but discards the old content
  entirely, rather than keeping it anywhere.
- `--no-compress` — keep rotated files as plain text (`.1`, `.2`, ...)
  instead of gzip-compressing them (`.1.gz`, `.2.gz`, ...).

## Example

```
$ logrotate.sh app.log --max-size 1048576
No rotation needed: app.log is 203921 byte(s) (limit 1048576).

$ logrotate.sh app.log --max-size 100 --keep 3
Rotated app.log (203921 byte(s)) -> app.log.1.gz
$ ls app.log*
app.log  app.log.1.gz

# a later, second rotation shifts the old .1.gz up:
$ logrotate.sh app.log --max-size 100 --keep 3
Rotated app.log (5102 byte(s)) -> app.log.1.gz
$ ls app.log*
app.log  app.log.1.gz  app.log.2.gz
```

## Exit codes

- `0` — ran successfully, whether or not rotation actually happened.
- `2` — usage error: missing arguments, non-numeric `--max-size`/`--keep`,
  or `logfile` isn't an existing file.

## Design notes

- Rotation order is oldest-first: the file at the `--keep` boundary is
  deleted *before* shifting, so a mid-shift failure can't leave two
  generations sharing one filename.
- Compression is a copy-then-truncate (`gzip -c logfile > logfile.1.gz`,
  then empty `logfile`), not a move-then-compress, so the original file
  handle any writer already has open stays valid and pointed at the same
  (now-empty) file — the same trade-off real logrotate makes with
  `copytruncate`.
- `--keep 0` is a deliberate, honestly-labeled data-loss mode: the log is
  still emptied (so size stays bounded), but nothing is written anywhere.
  Earlier the completion message claimed a `.1.gz` destination even in
  this case, which was simply false — found via the CLI smoke test below
  and fixed before writing the test suite.

## Running the tests

```
bash tests/test_logrotate.sh
```

18 tests against real files in a scratch directory: no-op under the size
limit, a first compressed rotation preserving content and truncating the
original, a second rotation correctly shifting `.1.gz` to `.2.gz`,
`--no-compress` producing a plain (non-gzip) rotated file, `--keep 0`
reporting "discarded" instead of a fake file path and creating no rotated
file at all, the `--keep 1` retention cap actually dropping the older
generation's content on a third rotation, and rejection of a missing log
file and a non-numeric `--max-size`.
