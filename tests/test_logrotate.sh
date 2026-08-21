#!/usr/bin/env bash
# Assertion-based tests for logrotate.sh, run against a real scratch directory.
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/../scripts/logrotate.sh"

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

assert_file_exists() {
    local path="$1" label="$2"
    if [ -e "$path" ]; then
        pass=$((pass + 1))
    else
        fail=$((fail + 1))
        echo "FAIL: $label — expected $path to exist"
    fi
}

assert_file_absent() {
    local path="$1" label="$2"
    if [ ! -e "$path" ]; then
        pass=$((pass + 1))
    else
        fail=$((fail + 1))
        echo "FAIL: $label — expected $path to NOT exist"
    fi
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

log="$tmpdir/app.log"

# --- under the size limit: no rotation happens ---
printf 'short\n' > "$log"
out="$("$script" "$log" --max-size 1000 2>&1)"
assert_contains "$out" "No rotation needed" "under threshold reports no rotation"
assert_file_absent "$log.1" "no .1 file created when under threshold"

# --- over the limit, compressed (default) ---
printf 'this line is definitely over five bytes\n' > "$log"
"$script" "$log" --max-size 5 > /dev/null
assert_file_exists "$log.1.gz" "rotation creates a compressed .1.gz by default"
content="$(gunzip -c "$log.1.gz")"
assert_contains "$content" "this line is definitely over five bytes" "compressed rotation preserves original content"
size_after="$(wc -c < "$log" | tr -d ' ')"
if [ "$size_after" -eq 0 ]; then
    pass=$((pass + 1))
else
    fail=$((fail + 1))
    echo "FAIL: original log should be truncated to empty after rotation"
fi

# --- a second rotation shifts .1.gz to .2.gz ---
printf 'second round of content here\n' > "$log"
"$script" "$log" --max-size 5 --keep 3 > /dev/null
assert_file_exists "$log.1.gz" "second rotation recreates .1.gz"
assert_file_exists "$log.2.gz" "second rotation shifts the old .1.gz to .2.gz"

# --- --no-compress writes a plain (uncompressed) rotated file ---
log2="$tmpdir/plain.log"
printf 'plain text content\n' > "$log2"
"$script" "$log2" --max-size 3 --no-compress > /dev/null
assert_file_exists "$log2.1" "no-compress rotation creates a plain .1 file"
assert_file_absent "$log2.1.gz" "no-compress rotation does not create a .gz file"
plain_content="$(cat "$log2.1")"
assert_contains "$plain_content" "plain text content" "no-compress rotation preserves original content"

# --- --keep 0 discards content instead of claiming a fake destination ---
log3="$tmpdir/discard.log"
printf 'will be discarded\n' > "$log3"
out3="$("$script" "$log3" --max-size 0 --keep 0 2>&1)"
assert_contains "$out3" "discarded" "keep=0 message says discarded, not a fake file path"
assert_file_absent "$log3.1" "keep=0 does not create any rotated file"
assert_file_absent "$log3.1.gz" "keep=0 does not create any compressed rotated file"

# --- retention cap: with --keep 1, a third rotation drops the oldest ---
log4="$tmpdir/capped.log"
printf 'v1\n' > "$log4"
"$script" "$log4" --max-size 0 --keep 1 > /dev/null
gunzip -c "$log4.1.gz" > "$tmpdir/v1_check.txt"
assert_contains "$(cat "$tmpdir/v1_check.txt")" "v1" "first rotation under keep=1 preserves v1"
printf 'v2\n' > "$log4"
"$script" "$log4" --max-size 0 --keep 1 > /dev/null
assert_file_absent "$log4.2.gz" "keep=1 never keeps a second rotation slot"
v2_content="$(gunzip -c "$log4.1.gz")"
assert_contains "$v2_content" "v2" "second rotation under keep=1 has v2 (v1 was dropped, not v2)"

# --- error cases ---
if "$script" "$tmpdir/does-not-exist.log" --max-size 10 > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: missing log file should exit non-zero"
else
    pass=$((pass + 1))
fi

if "$script" "$log" --max-size not-a-number > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: non-numeric --max-size should exit non-zero"
else
    pass=$((pass + 1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
