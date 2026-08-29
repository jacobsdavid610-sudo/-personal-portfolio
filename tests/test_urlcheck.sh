#!/usr/bin/env bash
# Assertion-based tests for urlcheck.sh, run against real live URLs
# (example.com is stable and IANA-reserved for exactly this kind of use).
# Requires network access; skips cleanly if it isn't available.
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/../scripts/urlcheck.sh"

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

if ! curl -s --max-time 5 -o /dev/null https://example.com 2> /dev/null; then
    echo "No network access to example.com; skipping (nothing to test without it)."
    exit 0
fi

# --- a live URL with the default expected status (200) reports OK, exit 0 ---
out="$("$script" https://example.com 2>&1)"
rc=$?
assert_contains "$out" "OK:" "a 200 response with default expectations reports OK"
assert_contains "$out" "returned 200" "the actual status code is included in the message"
[ "$rc" -eq 0 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: expected exit 0, got $rc"; }

# --- a real 404 path, expecting 404, reports OK ---
out="$("$script" https://example.com/this-path-should-not-exist-xyz --expect-status 404 2>&1)"
rc=$?
assert_contains "$out" "OK:" "a 404 response, when 404 is expected, reports OK"
[ "$rc" -eq 0 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: expected exit 0, got $rc"; }

# --- wrong expected status reports FAIL, exit 1 ---
out="$("$script" https://example.com --expect-status 404 2>&1)"
rc=$?
assert_contains "$out" "FAIL:" "a 200 response, when 404 was expected, reports FAIL"
assert_contains "$out" "expected 404" "the FAIL message names what was actually expected"
[ "$rc" -eq 1 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: expected exit 1, got $rc"; }

# --- an impossibly tight latency threshold reports WARN, exit 1 ---
out="$("$script" https://example.com --max-ms 1 2>&1)"
rc=$?
assert_contains "$out" "WARN:" "a real network round trip exceeding a 1ms threshold reports WARN"
[ "$rc" -eq 1 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: expected exit 1, got $rc"; }

# --- a generous latency threshold (or the default, disabled) reports OK ---
out="$("$script" https://example.com --max-ms 30000 2>&1)"
rc=$?
assert_contains "$out" "OK:" "a generous latency threshold does not trigger a WARN"
[ "$rc" -eq 0 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: expected exit 0, got $rc"; }

# --- an unreachable host reports FAIL with exit 2 (a hard connection failure) ---
out="$("$script" https://this-domain-should-not-exist-xyz123abc-test.com --timeout 5 2>&1)"
rc=$?
assert_contains "$out" "FAIL: could not connect" "an unreachable host is reported as a connection failure"
[ "$rc" -eq 2 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: expected exit 2, got $rc"; }

# --- error cases ---
if "$script" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: no URL argument should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" https://example.com --expect-status not-a-number > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: a non-numeric --expect-status should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" https://example.com --max-ms not-a-number > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: a non-numeric --max-ms should be rejected"
else
    pass=$((pass + 1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
