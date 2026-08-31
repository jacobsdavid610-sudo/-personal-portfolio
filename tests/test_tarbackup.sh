#!/usr/bin/env bash
# Assertion-based tests for tarbackup.sh, run against real directories
# and real tar archives in a scratch directory.
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/../scripts/tarbackup.sh"

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

src="$tmpdir/src"
dest="$tmpdir/dest"
mkdir -p "$src"
printf 'hello\n' > "$src/file1.txt"
printf 'world\n' > "$src/file2.txt"

# --- a real backup creates a non-empty, extractable archive with the
# right contents, in an auto-created destination directory ---
out="$("$script" "$src" "$dest" 2>&1)"
rc=$?
assert_contains "$out" "Created:" "a real backup reports what it created"
[ "$rc" -eq 0 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: expected exit 0, got $rc"; }

archives=("$dest"/src-*.tar.gz)
if [ -f "${archives[0]}" ]; then
    pass=$((pass + 1))
else
    fail=$((fail + 1))
    echo "FAIL: expected a src-<timestamp>.tar.gz file in $dest"
fi

listing="$(tar --force-local -tzf "${archives[0]}" 2>&1)"
assert_contains "$listing" "src/file1.txt" "the archive actually contains the source's files"
assert_contains "$listing" "src/file2.txt" "the archive actually contains all the source's files"

size="$(wc -c < "${archives[0]}" | tr -d ' ')"
if [ "$size" -gt 0 ]; then
    pass=$((pass + 1))
else
    fail=$((fail + 1))
    echo "FAIL: archive should not be zero bytes"
fi

# --- retention: fabricate 4 older backups with controlled timestamps,
# then confirm a new backup with --keep 3 prunes exactly the 2 oldest ---
for n in 1 2 3 4; do
    f="$dest/src-2026010${n}-000000.tar.gz"
    tar --force-local -czf "$f" -C "$tmpdir" src
    touch -d "2026-01-0${n}" "$f"
done
"$script" "$src" "$dest" --keep 3 > /dev/null

remaining="$(ls "$dest"/src-*.tar.gz | wc -l)"
if [ "$remaining" -eq 3 ]; then
    pass=$((pass + 1))
else
    fail=$((fail + 1))
    echo "FAIL: expected exactly 3 archives to remain after --keep 3, got $remaining"
fi

if [ ! -f "$dest/src-20260101-000000.tar.gz" ] && [ ! -f "$dest/src-20260102-000000.tar.gz" ]; then
    pass=$((pass + 1))
else
    fail=$((fail + 1))
    echo "FAIL: the two oldest backups should have been pruned"
fi

if [ -f "$dest/src-20260104-000000.tar.gz" ]; then
    pass=$((pass + 1))
else
    fail=$((fail + 1))
    echo "FAIL: the newest of the fabricated backups should have survived"
fi

# --- --dry-run touches nothing: no new file created, no existing file deleted ---
before="$(ls "$dest"/src-*.tar.gz | sort)"
out="$("$script" "$src" "$dest" --keep 1 --dry-run 2>&1)"
after="$(ls "$dest"/src-*.tar.gz | sort)"
assert_contains "$out" "Would create:" "dry-run reports what it would create"
assert_contains "$out" "Would delete:" "dry-run reports what it would delete"
if [ "$before" = "$after" ]; then
    pass=$((pass + 1))
else
    fail=$((fail + 1))
    echo "FAIL: --dry-run should not actually create or delete any files"
fi

# --- error cases ---
if "$script" "$tmpdir/does-not-exist" "$dest" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: a nonexistent source directory should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" "$src" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: a missing dest-dir argument should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" "$src" "$dest" --keep not-a-number > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: a non-numeric --keep should be rejected"
else
    pass=$((pass + 1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
