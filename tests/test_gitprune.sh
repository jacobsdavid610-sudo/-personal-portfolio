#!/usr/bin/env bash
# Assertion-based tests for gitprune.sh, run against a real scratch git repo.
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/../scripts/gitprune.sh"

pass=0
fail=0

assert_contains() {
    local haystack="$1" needle="$2" label="$3"
    if [[ "$haystack" == *"$needle"* ]]; then
        pass=$((pass + 1))
    else
        fail=$((fail + 1))
        echo "FAIL: $label — expected to find '$needle' in: $haystack"
    fi
}

assert_not_contains() {
    local haystack="$1" needle="$2" label="$3"
    if [[ "$haystack" == *"$needle"* ]]; then
        fail=$((fail + 1))
        echo "FAIL: $label — did not expect to find '$needle' in: $haystack"
    else
        pass=$((pass + 1))
    fi
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

repo="$tmpdir/repo"
mkdir -p "$repo"
git -C "$repo" init -q -b main
git -C "$repo" config user.email "test@example.com"
git -C "$repo" config user.name "Test"
git -C "$repo" commit -q --allow-empty -m "initial"

# merged-old: fully merged into main, safe to prune.
git -C "$repo" branch merged-old
# unmerged-feature: has a commit main doesn't have, must survive.
git -C "$repo" checkout -q -b unmerged-feature
git -C "$repo" commit -q --allow-empty -m "wip"
git -C "$repo" checkout -q main

# --- dry run lists the merged branch but not the unmerged one, and doesn't delete ---
out="$("$script" "$repo" 2>&1)"
assert_contains "$out" "merged-old" "dry run lists merged-old"
assert_not_contains "$out" "unmerged-feature" "dry run does not list unmerged-feature"
assert_contains "$out" "1 branch(es) merged into 'main'." "dry run reports the correct count"

branch_lines="$(echo "$out" | head -n 1)"
if [ "$branch_lines" = "main" ]; then
    fail=$((fail + 1))
    echo "FAIL: dry run listed the base branch itself as a prunable branch"
else
    pass=$((pass + 1))
fi

still_there="$(git -C "$repo" branch --list merged-old)"
assert_contains "$still_there" "merged-old" "dry run did not actually delete anything"

# --- --delete --yes actually removes the merged branch ---
out_del="$("$script" "$repo" --delete --yes 2>&1)"
assert_contains "$out_del" "Deleted 1 branch(es)." "delete reports 1 branch deleted"

gone="$(git -C "$repo" branch --list merged-old)"
if [ -z "$gone" ]; then
    pass=$((pass + 1))
else
    fail=$((fail + 1))
    echo "FAIL: merged-old should have been deleted"
fi

survives="$(git -C "$repo" branch --list unmerged-feature)"
assert_contains "$survives" "unmerged-feature" "unmerged branch was never touched"

# --- nothing left to prune now ---
out_empty="$("$script" "$repo" 2>&1)"
assert_contains "$out_empty" "No branches merged into 'main' to prune." "reports nothing to prune once clean"

# --- --base rejects a nonexistent branch ---
if "$script" "$repo" --base does-not-exist > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: nonexistent --base should exit non-zero"
else
    pass=$((pass + 1))
fi

# --- non-repo directory is rejected ---
if "$script" "$tmpdir" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: non-repo directory should exit non-zero"
else
    pass=$((pass + 1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
