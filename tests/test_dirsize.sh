#!/usr/bin/env bash
# Assertion-based tests for dirsize.sh. No test framework dependency.
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/../scripts/dirsize.sh"

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
    if [[ "$haystack" != *"$needle"* ]]; then
        pass=$((pass + 1))
    else
        fail=$((fail + 1))
        echo "FAIL: $label — did not expect to find '$needle' in: $haystack"
    fi
}

assert_line_before() {
    local text="$1" first="$2" second="$3" label="$4"
    local first_line second_line
    first_line="$(grep -n -F "$first" <<<"$text" | head -n1 | cut -d: -f1)"
    second_line="$(grep -n -F "$second" <<<"$text" | head -n1 | cut -d: -f1)"
    if [ -n "$first_line" ] && [ -n "$second_line" ] && [ "$first_line" -lt "$second_line" ]; then
        pass=$((pass + 1))
    else
        fail=$((fail + 1))
        echo "FAIL: $label — expected '$first' before '$second'"
    fi
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# 3.0M, 500.0K, 100.0K (in a subdir), 20B — deliberately far apart so
# rounding never puts two entries within striking distance of each other.
dd if=/dev/zero of="$tmpdir/big.bin" bs=1M count=3 status=none
dd if=/dev/zero of="$tmpdir/medium.bin" bs=1K count=500 status=none
mkdir "$tmpdir/subdir"
dd if=/dev/zero of="$tmpdir/subdir/file.bin" bs=1K count=100 status=none
printf 'aaaaaaaaaaaaaaaaaaaa' > "$tmpdir/small.txt" # exactly 20 bytes, no newline

# --- default run: sorted largest first, human-readable ---
out="$("$script" "$tmpdir")"
assert_contains "$out" "3.0M" "big.bin reported as 3.0M"
assert_contains "$out" "500.0K" "medium.bin reported as 500.0K"
assert_contains "$out" "100.0K" "subdir reported as 100.0K (recursive du)"
assert_contains "$out" "20.0B" "small.txt reported as 20.0B"
assert_line_before "$out" "big.bin" "medium.bin" "big.bin sorts before medium.bin"
assert_line_before "$out" "medium.bin" "subdir" "medium.bin sorts before subdir"
assert_line_before "$out" "subdir" "small.txt" "subdir sorts before small.txt"
assert_contains "$out" "4 entries under $tmpdir." "summary line has correct count"

# --- --bytes shows raw byte counts instead of human-readable ---
out_bytes="$("$script" "$tmpdir" --bytes)"
assert_contains "$out_bytes" "3145728B" "--bytes shows exact byte count for big.bin"
assert_contains "$out_bytes" "512000B" "--bytes shows exact byte count for medium.bin"

# --- -n limits how many entries are shown ---
out_top2="$("$script" "$tmpdir" -n 2)"
assert_contains "$out_top2" "big.bin" "-n 2 keeps the largest entry"
assert_contains "$out_top2" "medium.bin" "-n 2 keeps the second largest entry"
assert_not_contains "$out_top2" "small.txt" "-n 2 excludes the smallest entry"

# --- --threshold flags entries at or above it, leaves others unmarked ---
out_threshold="$("$script" "$tmpdir" --threshold 200K)"
assert_contains "$out_threshold" "! " "at least one entry is flagged"
big_line="$(grep "big.bin" <<<"$out_threshold")"
small_line="$(grep "small.txt" <<<"$out_threshold")"
assert_contains "$big_line" "!" "big.bin (3M) is flagged above a 200K threshold"
assert_not_contains "$small_line" "!" "small.txt (20B) is not flagged above a 200K threshold"

# --- empty directory ---
empty_dir="$tmpdir/empty"
mkdir "$empty_dir"
out_empty="$("$script" "$empty_dir")"
assert_contains "$out_empty" "No entries found under $empty_dir." "empty directory reports no entries"

# --- missing path is a clean error, not a crash ---
if "$script" "$tmpdir/does-not-exist" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: missing path should exit non-zero"
else
    pass=$((pass + 1))
fi

# --- non-numeric -n is a usage error ---
if "$script" "$tmpdir" -n abc > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: non-numeric -n should exit non-zero"
else
    pass=$((pass + 1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
