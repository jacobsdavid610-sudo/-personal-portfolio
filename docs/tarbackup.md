# tarbackup.sh

Creates a timestamped `.tar.gz` backup of a directory into a destination
folder, pruning old backups beyond `--keep`. No dependencies beyond `tar`.

## Why

Different problem than [logrotate.sh](logrotate.md), which rotates one
file in place — this archives a whole *directory* into a fresh,
timestamped, independently-restorable snapshot each run, the pattern
behind "nightly backup of the config/data directory" cron jobs.

## Usage

```
tarbackup.sh <source-dir> <dest-dir> [--keep N] [--dry-run]
```

- `--keep N` — how many backups of this source to retain (default: `5`).
  Older ones beyond that are deleted after a successful backup.
- `--dry-run` — print what would be created/deleted without touching
  anything.

## Example

```
$ tarbackup.sh ~/myproject ~/backups
Created: /home/user/backups/myproject-20260831-104430.tar.gz (183 byte(s))

$ tarbackup.sh ~/myproject ~/backups --keep 3
Created: /home/user/backups/myproject-20260901-020000.tar.gz (183 byte(s))
Deleted: /home/user/backups/myproject-20260828-020000.tar.gz
Deleted: /home/user/backups/myproject-20260827-020000.tar.gz

$ tarbackup.sh ~/myproject ~/backups --keep 1 --dry-run
Would create: /home/user/backups/myproject-20260901-030000.tar.gz
Would delete: /home/user/backups/myproject-20260901-020000.tar.gz
```

## Exit codes

- `0` — success (including "nothing to prune").
- `2` — usage error: missing arguments, a non-numeric `--keep`, or a
  nonexistent `source-dir`.

## Design notes

- Every `tar` invocation uses `--force-local`. Without it, GNU tar
  interprets an archive path that starts with a drive letter and colon —
  `C:\Users\...`, i.e. every absolute path on this platform — as a remote
  `host:file` spec and tries to shell out to a remote tar over SSH,
  failing with a confusing `Cannot connect to C: resolve failed` error.
  This was a real failure hit while first smoke-testing the script, not a
  hypothetical edge case; `--force-local` tells tar the colon is just
  part of a local filename.
- Pruning only considers files matching this source's own naming pattern
  (`<basename>-*.tar.gz`) in the destination directory, so a shared
  backup folder holding archives from multiple different source
  directories won't have an unrelated source's backups counted against
  this one's `--keep` limit, or deleted by mistake.
- `--dry-run`'s prune preview is computed from what's actually on disk
  right now — it does not pretend the not-yet-created new backup exists
  when deciding what "would" be pruned, since in dry-run mode that backup
  genuinely isn't there.

## Running the tests

```
bash tests/test_tarbackup.sh
```

15 tests against real directories and real tar archives: a backup
reporting success and producing a non-empty archive that actually
contains the source's files (verified by listing the archive's real
contents, not just checking the file exists), the retention logic
pruning exactly the correct 2-oldest-of-5 backups after fabricating
controlled timestamps, `--dry-run` reporting what it would do while
provably not creating or deleting anything, and rejection of a
nonexistent source directory, a missing `dest-dir` argument, and a
non-numeric `--keep`.
