# gitprune.sh

Lists (or deletes, with `--delete`) local git branches that are already
fully merged into a base branch. Dry-run by default.

## Why

The "I merged this PR three weeks ago, why do I still have twelve stale
local branches" cleanup script. Complements [gitstats.sh](gitstats.md) (which
answers "who's committing") with a different question: "what's safe to throw
away." Only touches branches git itself considers merged, so it can never
discard unmerged work — same safety property as `git branch -d` (as opposed
to `-D`), because that's exactly what it shells out to.

## Usage

```
gitprune.sh [repo-dir] [--base BRANCH] [--delete] [--yes]
```

- `repo-dir` — path to the repository. Defaults to `.` (current directory).
- `--base BRANCH` — the branch to check "merged into". If omitted, tries
  local `main` first, then `master`; errors out if neither exists.
- `--delete` — actually delete the listed branches (default: list only).
- `--yes` — skip the confirmation prompt when deleting.

The base branch itself and whichever branch is currently checked out are
always excluded from the list, even if they're technically "merged into
main" (the base trivially is).

## Example

```
$ gitprune.sh ~/myrepo
old-feature
also-merged

2 branch(es) merged into 'main'.

$ gitprune.sh ~/myrepo --delete --yes
old-feature
also-merged

2 branch(es) merged into 'main'.
Deleted 2 branch(es).
```

## Exit codes

- `0` — ran successfully (including "nothing to prune").
- `1` — not a git repository, the requested `--base` branch doesn't exist,
  no `main`/`master` could be auto-detected, or at least one branch failed
  to delete.

## Design notes

- Deletion uses `git branch -d` (safe delete), never `-D` — if git itself
  wouldn't consider a branch merged, this script won't force it through.
  Since the candidate list already comes from `git branch --merged`, a `-d`
  failure here would mean something changed between listing and deleting
  (e.g. the branch was force-pushed over), and gets reported per-branch
  rather than aborting the whole run.
- No `--force` flag by design — pruning unmerged work isn't this script's
  job; use plain `git branch -D` yourself if you really mean it.

## Running the tests

```
bash tests/test_gitprune.sh
```

Builds a real scratch git repo (main + a merged branch + an unmerged branch
with its own commit) and asserts against `gitprune.sh`'s actual behavior:
dry-run lists only the merged branch, `--delete --yes` removes exactly that
branch, the unmerged branch and the base branch itself are never touched,
and both a bad `--base` and a non-repo directory are rejected.
