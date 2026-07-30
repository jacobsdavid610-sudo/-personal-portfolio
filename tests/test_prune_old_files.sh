#!/usr/bin/env bash
# Minimal assertion-based test runner for prune_old_files.sh. No test
# framework dependency - just bash + coreutils, same as the script itself.
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/../scripts/prune_old_files.sh"

pass=0
fail=0

assert_contains() {
    local haystack="$1" needle="$2" label="$3"
    if [[ "$haystack" == *"$needle"* ]]; then
        pass=$((pass + 1))
    else
        fail=$((fail + 1))
        echo "FAIL: $label — expected to find '$needle'"
    fi
}

assert_not_contains() {
    local haystack="$1" needle="$2" label="$3"
    if [[ "$haystack" != *"$needle"* ]]; then
        pass=$((pass + 1))
    else
        fail=$((fail + 1))
        echo "FAIL: $label — did not expect to find '$needle'"
    fi
}

assert_file_exists() {
    local path="$1" label="$2"
    if [ -f "$path" ]; then
        pass=$((pass + 1))
    else
        fail=$((fail + 1))
        echo "FAIL: $label — expected file to exist: $path"
    fi
}

assert_file_missing() {
    local path="$1" label="$2"
    if [ ! -f "$path" ]; then
        pass=$((pass + 1))
    else
        fail=$((fail + 1))
        echo "FAIL: $label — expected file to be gone: $path"
    fi
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

old_file="$tmpdir/old.txt"
new_file="$tmpdir/new.txt"
echo "old" > "$old_file"
echo "new" > "$new_file"
touch -d "10 days ago" "$old_file"
touch -d "1 hour ago" "$new_file"

# --- dry run: lists only the old file, deletes nothing ---
out="$("$script" "$tmpdir" --days 5)"
assert_contains "$out" "old.txt" "dry run lists old file"
assert_not_contains "$out" "new.txt" "dry run excludes new file"
assert_file_exists "$old_file" "dry run does not delete old file"
assert_file_exists "$new_file" "dry run does not delete new file"

# --- no matches ---
out="$("$script" "$tmpdir" --days 30)"
assert_contains "$out" "No files older than" "reports no matches when nothing qualifies"

# --- delete with --yes actually removes only the old file ---
"$script" "$tmpdir" --days 5 --delete --yes > /dev/null
assert_file_missing "$old_file" "--delete --yes removes the old file"
assert_file_exists "$new_file" "--delete --yes leaves the new file"

# --- rejects a non-numeric --days ---
if "$script" "$tmpdir" --days abc > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: non-numeric --days should exit non-zero"
else
    pass=$((pass + 1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
