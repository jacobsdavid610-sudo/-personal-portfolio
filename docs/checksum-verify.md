# checksum-verify.sh

Generates or verifies a manifest of SHA-256 checksums for every file under
a directory — "did anything in this deployment/backup/download change
since I made this manifest," with separate MISMATCH/MISSING/EXTRA
reporting rather than a flat pass/fail.

## Why

`sha256sum -c` already does this for a flat manifest, but it stops at
"does the file's content match" — it doesn't tell you when a file was
deleted entirely (silently skipped) or a new, untracked file showed up.
This wraps the same underlying primitive with all three cases surfaced
explicitly, which is the actual question you're usually asking when
verifying a backup or a deployed artifact tree.

## Usage

```
checksum-verify.sh generate <directory> [--out FILE]
checksum-verify.sh verify <directory> --manifest FILE
```

- `generate` — hashes every file under `directory` and writes `sum  path`
  lines (relative paths, sorted, forward slashes). Prints to stdout if
  `--out` is omitted, otherwise writes to the given file.
- `verify` — re-hashes the directory and compares against an existing
  manifest.

## Example

```
$ checksum-verify.sh generate ./dist --out dist.manifest
Wrote 42 checksum(s) to dist.manifest

$ checksum-verify.sh verify ./dist --manifest dist.manifest
42 OK, 0 mismatched, 0 missing, 0 extra.

# after a file changes, one is deleted, and a stray file is added:
$ checksum-verify.sh verify ./dist --manifest dist.manifest
MISMATCH: bundle.js
MISSING: legacy/old-widget.js
EXTRA: .DS_Store

40 OK, 1 mismatched, 1 missing, 1 extra.
```

## Exit codes

- `0` — success: `generate` always, `verify` when every tracked file is
  present and unchanged (extras don't affect the exit code — see below).
- `1` — `verify` found at least one MISMATCH or MISSING file.
- `2` — usage error, a nonexistent directory, or a nonexistent manifest
  file.

## Design notes

- Only MISMATCH and MISSING affect the exit code — an EXTRA file (present
  on disk but not in the manifest) is reported but doesn't fail the run.
  A manifest can't know about files that didn't exist when it was made;
  treating "something new showed up" as an automatic failure would make
  this unusable for a directory anyone still adds files to, like a build
  output folder with local scratch files mixed in.
- Real bug caught while smoke-testing on this platform: GNU `sha256sum`
  prefixes its output line with a literal `\` whenever the path it was
  given contains a backslash or newline — which is *every* Windows-style
  path. That marker was leaking straight into the stored checksum via a
  naive `cut -d' ' -f1`, silently corrupting every hash in the manifest
  (they'd never match on re-verification, or worse, might coincidentally
  still "match" only against themselves). Fixed by stripping a leading
  `\` before taking the hash field.
- File lists use `find ... | sort` for deterministic manifest ordering —
  two runs against an unchanged directory produce byte-identical
  manifests, so `generate`'s output is itself diffable/version-controllable.

## Running the tests

```
bash tests/test_checksum-verify.sh
```

18 tests against real files in a scratch directory: `generate` producing
well-formed 64-character hex hashes that match `sha256sum`'s own output
directly (not just "looks plausible"), `--out` writing a real manifest
file, a clean `verify` reporting all-OK with exit 0, a dirty tree
(one modified file, one deleted file, one new file) being reported as
exactly one MISMATCH, one MISSING, and one EXTRA simultaneously with exit
1, an empty directory generating zero checksums without erroring, and
rejection of an unknown mode, `verify` without `--manifest`, a
nonexistent manifest file, and a nonexistent directory.
