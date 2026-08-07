#!/usr/bin/env bash
# Assertion-based tests for gitstats.sh, run against a real scratch git repo.
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/../scripts/gitstats.sh"

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

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

repo="$tmpdir/repo"
mkdir -p "$repo"
git -C "$repo" init -q
git -C "$repo" config user.email "test@example.com"

commit_as() {
    local name="$1" msg="$2"
    git -C "$repo" config user.name "$name"
    git -C "$repo" commit -q --allow-empty -m "$msg"
}

commit_as "Alice" "first"
commit_as "Bob" "second"
commit_as "Alice" "third"
commit_as "Alice" "fourth"

out="$("$script" "$repo" 2>&1)"
assert_contains "$out" "3  Alice" "counts 3 commits for Alice"
assert_contains "$out" "1  Bob" "counts 1 commit for Bob"
assert_contains "$out" "Total: 4 commit(s) shown." "reports the correct total"

# --- Alice's count comes before Bob's (sorted descending) ---
alice_line="$(echo "$out" | grep -n "Alice" | cut -d: -f1)"
bob_line="$(echo "$out" | grep -n "Bob" | cut -d: -f1)"
if [ "$alice_line" -lt "$bob_line" ]; then
    pass=$((pass + 1))
else
    fail=$((fail + 1))
    echo "FAIL: expected Alice (more commits) listed before Bob"
fi

# --- --top limits the number of authors shown ---
out_top1="$("$script" "$repo" --top 1 2>&1)"
assert_contains "$out_top1" "3  Alice" "--top 1 still shows the top author"
if [[ "$out_top1" == *"Bob"* ]]; then
    fail=$((fail + 1))
    echo "FAIL: --top 1 should not include Bob"
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
