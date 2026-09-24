#!/usr/bin/env bash
# Assertion-based tests for secretscan.sh, run against real fixture files
# in a scratch directory.
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/../scripts/secretscan.sh"

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
mkdir -p "$repo/sub" "$repo/.git" "$repo/node_modules"

# --- one fixture file per rule, plus a clean line and a nested file ---
cat > "$repo/config.py" <<'EOF'
AWS_KEY = "AKIAABCDEFGHIJKLMNOP"
clean_line = "nothing to see here"
EOF

cat > "$repo/sub/id_rsa" <<'EOF'
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA1234567890abcdef
-----END RSA PRIVATE KEY-----
EOF

# Real GitHub tokens are exactly 36 chars after the "ghp_" prefix.
printf 'gh_token = "ghp_a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"\n' > "$repo/sub/creds.txt"
printf 'SLACK_WEBHOOK = xoxb-111111-222222-abcdefghijklmnop\n' > "$repo/slack.txt"
printf 'db_password: "correcthorsebatterystaple123"\n' > "$repo/db.yml"

# Should be excluded from the scan entirely, not just fail to match.
printf 'AKIAZZZZZZZZZZZZZZZZ\n' > "$repo/.git/should_be_skipped.txt"
printf 'AKIAZZZZZZZZZZZZZZZZ\n' > "$repo/node_modules/should_be_skipped.txt"

# A "binary" file containing a byte sequence grep should treat as
# non-text - the key inside it should never be reported.
printf 'AKIAABCDEFGHIJKLMNOP\x00\x01\x02binarydata' > "$repo/blob.bin"

out="$("$script" "$repo" 2>&1)"
rc=$?

# --- each rule fires on its own fixture ---
assert_contains "$out" "AWS_ACCESS_KEY_ID" "AWS access key rule fires"
assert_contains "$out" "PRIVATE_KEY_BLOCK" "private key block rule fires"
assert_contains "$out" "GITHUB_TOKEN" "GitHub token rule fires"
assert_contains "$out" "SLACK_TOKEN" "Slack token rule fires"
assert_contains "$out" "GENERIC_ASSIGNMENT" "generic secret assignment rule fires"

# --- redaction: the tool's own output never reproduces a full secret ---
assert_not_contains "$out" "AKIAABCDEFGHIJKLMNOP" "full AWS key is never printed"
assert_not_contains "$out" "ghp_a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1" "full GitHub token is never printed"
assert_not_contains "$out" "correcthorsebatterystaple123" "full generic secret is never printed"
assert_contains "$out" "redacted" "findings show a redaction marker"

# --- clean content doesn't false-positive ---
assert_not_contains "$out" "clean_line" "the non-secret line itself isn't quoted back in a finding"

# --- exclusions: .git, node_modules and binary files are never scanned ---
git_hits="$(grep -c '\.git/' <<< "$out" || true)"
[ "$git_hits" -eq 0 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: a finding referenced a path inside .git/"; }

nm_hits="$(grep -c 'node_modules/' <<< "$out" || true)"
[ "$nm_hits" -eq 0 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: a finding referenced a path inside node_modules/"; }

bin_hits="$(grep -c 'blob\.bin' <<< "$out" || true)"
[ "$bin_hits" -eq 0 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: the binary file's embedded key was reported"; }

# --- exit code reflects findings ---
[ "$rc" -eq 1 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: expected exit 1 when secrets are found, got $rc"; }

# --- summary line reports a real count ---
# 6, not 5: sub/creds.txt matches both GITHUB_TOKEN and
# GENERIC_ASSIGNMENT on the same line - each rule reports its own
# finding rather than de-duplicating by line, which is intentional.
assert_contains "$out" "6 finding(s)" "summary line reports the right finding count"

# --- a clean directory exits 0 with zero findings ---
clean_dir="$tmpdir/clean"
mkdir -p "$clean_dir"
printf 'just some ordinary text, nothing sensitive here\n' > "$clean_dir/readme.txt"
clean_out="$("$script" "$clean_dir" 2>&1)"
clean_rc=$?
assert_contains "$clean_out" "0 finding(s)" "a clean directory reports zero findings"
[ "$clean_rc" -eq 0 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: a clean directory should exit 0, got $clean_rc"; }

# --- --ignore excludes matching paths from the scan ---
ignored_out="$("$script" "$repo" --ignore "*/sub/*" 2>&1)"
assert_not_contains "$ignored_out" "PRIVATE_KEY_BLOCK" "--ignore excludes files under the ignored path"
assert_not_contains "$ignored_out" "GITHUB_TOKEN" "--ignore excludes a second file under the same ignored path"
assert_contains "$ignored_out" "AWS_ACCESS_KEY_ID" "--ignore leaves files outside the ignored path alone"

# --- error cases ---
if "$script" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: no arguments should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" "$tmpdir/does-not-exist" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: a nonexistent path should be rejected"
else
    pass=$((pass + 1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
