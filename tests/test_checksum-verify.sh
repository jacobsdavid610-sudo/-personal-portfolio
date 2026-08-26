#!/usr/bin/env bash
# Assertion-based tests for checksum-verify.sh, run against real files in
# a scratch directory.
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/../scripts/checksum-verify.sh"

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

repo="$tmpdir/data"
mkdir -p "$repo/sub"
printf 'hello world\n' > "$repo/a.txt"
printf 'nested content\n' > "$repo/sub/b.txt"

# --- generate produces two real, well-formed sha256 lines (no stray
# escape-marker characters contaminating the hash) ---
out="$("$script" generate "$repo" 2>/dev/null)"
assert_contains "$out" "a.txt" "generate lists a.txt"
assert_contains "$out" "sub/b.txt" "generate lists the nested file with a forward-slash relative path"

first_hash="$(echo "$out" | grep 'a.txt' | awk '{print $1}')"
if [[ "$first_hash" =~ ^[0-9a-f]{64}$ ]]; then
    pass=$((pass + 1))
else
    fail=$((fail + 1))
    echo "FAIL: expected a clean 64-char hex sha256, got: '$first_hash'"
fi

expected_hash="$(sha256sum "$repo/a.txt" | sed 's/^\\//' | awk '{print $1}')"
if [ "$first_hash" = "$expected_hash" ]; then
    pass=$((pass + 1))
else
    fail=$((fail + 1))
    echo "FAIL: generated hash doesn't match sha256sum's own hash for the same file"
fi

# --- generate --out writes a manifest file ---
manifest="$tmpdir/manifest.txt"
"$script" generate "$repo" --out "$manifest" > /dev/null
if [ -f "$manifest" ]; then
    pass=$((pass + 1))
else
    fail=$((fail + 1))
    echo "FAIL: --out should create the manifest file"
fi

# --- verify against an unmodified tree: all OK, exit 0 ---
out="$("$script" verify "$repo" --manifest "$manifest" 2>&1)"
rc=$?
assert_contains "$out" "2 OK, 0 mismatched, 0 missing, 0 extra." "clean verify reports all OK"
[ "$rc" -eq 0 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: clean verify should exit 0, got $rc"; }

# --- verify catches a modified file, a missing file, and an extra file ---
printf 'hello world MODIFIED\n' > "$repo/a.txt"
rm "$repo/sub/b.txt"
printf 'unexpected\n' > "$repo/extra.txt"

out="$("$script" verify "$repo" --manifest "$manifest" 2>&1)"
rc=$?
assert_contains "$out" "MISMATCH: a.txt" "modified file is reported as MISMATCH"
assert_contains "$out" "MISSING: sub/b.txt" "deleted file is reported as MISSING"
assert_contains "$out" "EXTRA: extra.txt" "new untracked file is reported as EXTRA"
assert_contains "$out" "0 OK, 1 mismatched, 1 missing, 1 extra." "summary counts are all correct at once"
[ "$rc" -eq 1 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: a dirty verify should exit 1, got $rc"; }

# --- error cases ---
if "$script" badmode "$repo" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: an unknown mode should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" verify "$repo" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: verify without --manifest should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" verify "$repo" --manifest "$tmpdir/does-not-exist.txt" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: a nonexistent manifest file should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" generate "$tmpdir/does-not-exist-dir" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: a nonexistent directory should be rejected"
else
    pass=$((pass + 1))
fi

# --- an empty directory generates zero checksums without erroring ---
empty_dir="$tmpdir/empty"
mkdir -p "$empty_dir"
out="$("$script" generate "$empty_dir" 2>&1)"
rc=$?
assert_contains "$out" "0 checksum(s) generated." "an empty directory reports zero checksums"
[ "$rc" -eq 0 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: empty directory should still exit 0, got $rc"; }

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
