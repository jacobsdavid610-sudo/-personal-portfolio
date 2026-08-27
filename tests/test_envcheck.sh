#!/usr/bin/env bash
# Assertion-based tests for envcheck.sh, run against a real shell
# environment (exported variables), not mocked.
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/../scripts/envcheck.sh"

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
trap 'rm -rf "$tmpdir"; unset TESTVAR_SET TESTVAR_EMPTY' EXIT

export TESTVAR_SET="a-real-value"
export TESTVAR_EMPTY=""
unset TESTVAR_UNSET 2> /dev/null || true

# --- a mix of set, empty, and missing vars is fully and correctly reported ---
out="$("$script" TESTVAR_SET TESTVAR_EMPTY TESTVAR_UNSET 2>&1)"
rc=$?
assert_contains "$out" "MISSING: TESTVAR_UNSET" "an unset variable is reported as MISSING"
assert_contains "$out" "EMPTY:   TESTVAR_EMPTY" "a set-but-empty variable is reported as EMPTY"
assert_not_contains "$out" "MISSING: TESTVAR_SET" "a properly set variable is not reported as missing"
assert_contains "$out" "1 set, 1 missing, 1 empty (of 3 checked)." "summary counts are correct"
[ "$rc" -eq 1 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: mixed result should exit 1, got $rc"; }

# --- every variable present and non-empty: exit 0, no MISSING/EMPTY lines ---
out="$("$script" TESTVAR_SET 2>&1)"
rc=$?
assert_contains "$out" "1 set, 0 missing, 0 empty (of 1 checked)." "a fully satisfied check reports zero problems"
assert_not_contains "$out" "MISSING" "no MISSING line when everything is set"
[ "$rc" -eq 0 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: fully satisfied check should exit 0, got $rc"; }

# --- --file reads variable names, skipping comments and blank lines ---
reqfile="$tmpdir/required.env"
cat > "$reqfile" <<EOF
# a comment line
TESTVAR_SET

TESTVAR_UNSET
EOF
out="$("$script" --file "$reqfile" 2>&1)"
rc=$?
assert_contains "$out" "MISSING: TESTVAR_UNSET" "--file correctly checks a name it read from the file"
assert_contains "$out" "of 2 checked" "--file skipped the comment and blank line, checking only the 2 real names"
[ "$rc" -eq 1 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: expected exit 1, got $rc"; }

# --- error cases ---
if "$script" "not a valid name" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: an invalid variable name (contains spaces) should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" "123STARTS_WITH_DIGIT" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: a name starting with a digit should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: no arguments at all should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" --file "$tmpdir/does-not-exist.env" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: a nonexistent requirements file should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" --file "$reqfile" TESTVAR_SET > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: combining --file with positional names should be rejected"
else
    pass=$((pass + 1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
