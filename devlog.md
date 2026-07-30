# Devlog

Notes on what I actually worked on, in the order I did it. New entries go on top.

## 2026-07-30

Added `scripts/prune_old_files.sh` — lists (or `--delete`s, with a confirmation
prompt unless `--yes`) files under a directory older than N days, using plain
`find -mtime` + coreutils, no dependencies. Added
`tests/test_prune_old_files.sh`, a small assertion-based runner (no bats/shunit2
dependency) covering dry-run listing, the no-matches case, actual deletion via
`--delete --yes`, and rejecting a non-numeric `--days`. 8/8 passing. Also ran it
for real against a scratch dir with an old and a new file, both in list and
delete mode.

Added `scripts/textsearch.py` — tiny TF-IDF document search over a directory of
`.txt`/`.md` files: term frequency weighted by inverse document frequency,
ranked by cosine similarity against a query. Pure Python, no numpy/sklearn.
`tests/test_textsearch.py` covers tokenizing, IDF weighting common vs. rare
terms correctly, cosine similarity edge cases (identical/disjoint/empty
vectors), ranking, top-n limiting, and the file-extension filter in doc
loading. 10/10 passing. Smoke-tested against three real short documents —
querying "sleeping cats" correctly ranked the cats document first.

## 2026-07-29

Added `scripts/mdtoc.js` — generates a GitHub-style table of contents for a
Markdown file: extracts ATX headings, skips anything inside fenced code blocks,
slugifies the way GitHub does (including de-duping repeated headings as
`-1`, `-2`, ...), and either prints the TOC or writes it in place between
`<!-- toc -->` / `<!-- tocstop -->` markers. No dependencies, plain Node.

Added `tests/test_mdtoc.js` using Node's built-in test runner (`node --test`,
no npm install needed) — heading extraction + slugifying, de-duplication,
code-fence skipping, min/max level filtering and nested indentation, and the
empty-range case. All 5 passing. Also ran it for real against this file in
both print mode and `--write` mode (on a scratch copy) before committing.

Added `scripts/dupefinder.py` — walks a directory, groups files by size, then by
sha256 hash, and reports duplicate groups (bytes reclaimable, which copy would be
kept). `--delete` removes all but the first copy in each group, with a confirmation
prompt unless `--yes` is passed. Pure stdlib, no dependencies.

Added `tests/test_dupefinder.py` (unittest, stdlib only) covering: no duplicates,
a duplicate pair across a subdirectory, same-size-but-different-content files not
being falsely flagged (the size-bucketing pre-filter has to actually hash before
deciding), a three-way duplicate group, and an empty directory. All passing.

Also ran it for real against a scratch directory with two identical files and one
unique file to confirm the CLI output looks right before committing.

## 2026-07-26

Added `scripts/summarize.py` — a small extractive text summarizer, pure Python, no
external dependencies. Scores sentences by word frequency and returns the top N.
Tested against a sample paragraph via both file input and stdin, works as expected.

## 2026-07-23

Set up this repo and the devlog workflow. Idea: instead of trying to backfill history or
automate meaningless commits, just write a short note here whenever I genuinely work on
something, then commit it that day. Real dates, real work, no scripting.
