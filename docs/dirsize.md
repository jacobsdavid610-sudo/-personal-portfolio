# dirsize.sh

Reports the largest immediate entries (files and directories) under a
path, sorted by size, human-readable by default. Directories are sized
recursively (via `du`), so a directory's number is its total content size,
not just its own entry.

## Usage

```
dirsize.sh <path> [-n N] [--threshold SIZE] [--bytes]
```

- `-n N` — show the top `N` entries (default 10).
- `--threshold SIZE` — flag entries at or above `SIZE` with a leading `!`.
  Accepts a plain byte count or a `K`/`M`/`G` suffix (e.g. `500K`, `2G`).
- `--bytes` — show raw byte counts instead of human-readable sizes.

## Real example

```
$ dirsize.sh . -n 5 --threshold 50K
!   190.5K  .git
!   101.5K  tests
!    88.3K  scripts
     20.3K  docs
     15.9K  devlog.md

7 entries under .
```

The summary line always reports the *total* number of entries found, even
when `-n` limits how many are printed — here there are 7 entries total,
5 shown.

## Why sizes are apparent size, not disk usage

`du -sb` (`--apparent-size`, forced by `-b`) reports the sum of file
content sizes, not sizes rounded up to filesystem block boundaries. That
makes the numbers match what you'd see from `ls -l` or a file picker, and
makes this script's own tests deterministic — expected byte counts don't
have to guess the test machine's block size.

## Exit codes

- `0` — ran successfully (including the "no entries found" case).
- `1` — the given path doesn't exist or isn't a directory.
- `2` — usage error: missing path, non-numeric `-n`, or an unparseable
  `--threshold` value.

## Running the tests

```
bash tests/test_dirsize.sh
```

19 tests: correct size sorting (largest first) across files and a
subdirectory sized recursively, human-readable formatting, `--bytes`
showing exact byte counts, `-n` limiting how many entries print (while
the summary still counts all of them), `--threshold` flagging entries at
or above the cutoff and leaving smaller ones unmarked, an empty directory
being reported cleanly, a missing path being a clean error, and a
non-numeric `-n` being rejected as a usage error.
