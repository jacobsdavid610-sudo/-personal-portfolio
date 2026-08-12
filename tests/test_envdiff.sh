#!/usr/bin/env bash
# Assertion-based tests for envdiff.sh. No test framework dependency.
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/../scripts/envdiff.sh"

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

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

cat > "$tmpdir/a.env" <<'EOF'
# comment, should be ignored
API_URL=https://old.example.com
DEBUG=true
SECRET_KEY=old-secret-value

DB_NAME=mydb
EOF

cat > "$tmpdir/b.env" <<'EOF'
API_URL=https://new.example.com
DEBUG=true
SECRET_KEY=new-secret-value
CACHE_ENABLED=1
EOF

# --- default run: values masked ---
out="$("$script" "$tmpdir/a.env" "$tmpdir/b.env")"
assert_contains "$out" "+ CACHE_ENABLED=***" "reports CACHE_ENABLED as added, masked"
assert_contains "$out" "- DB_NAME=***" "reports DB_NAME as removed, masked"
assert_contains "$out" "~ API_URL: *** -> ***" "reports API_URL as changed, masked"
assert_contains "$out" "~ SECRET_KEY: *** -> ***" "reports SECRET_KEY as changed, masked"
assert_not_contains "$out" "DEBUG" "unchanged key DEBUG is not mentioned"
assert_not_contains "$out" "old-secret-value" "raw secret value never appears by default"
assert_contains "$out" "1 added, 1 removed, 2 changed." "summary counts are correct"

# --- --show-values reveals actual values ---
out_shown="$("$script" "$tmpdir/a.env" "$tmpdir/b.env" --show-values)"
assert_contains "$out_shown" "~ API_URL: https://old.example.com -> https://new.example.com" "--show-values reveals real values"

# --- identical files report no differences ---
out_same="$("$script" "$tmpdir/a.env" "$tmpdir/a.env")"
assert_contains "$out_same" "No differences." "identical files report no differences"

# --- missing file is a clean error, not a crash ---
if "$script" "$tmpdir/does-not-exist.env" "$tmpdir/b.env" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: missing file should exit non-zero"
else
    pass=$((pass + 1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
