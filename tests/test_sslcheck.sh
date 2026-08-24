#!/usr/bin/env bash
# Assertion-based tests for sslcheck.sh, run against real openssl-generated
# certificates in a scratch directory (no network access required).
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/../scripts/sslcheck.sh"

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

if ! command -v openssl > /dev/null 2>&1; then
    echo "openssl not found; skipping (nothing to test without it)."
    exit 0
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# Note: "//CN=test" (double leading slash), not "/CN=test" - under
# MSYS/Git Bash a single leading slash gets path-converted to a Windows
# path before reaching the native openssl.exe, silently corrupting -subj.

# A cert valid for 400 days (comfortably "OK" at the default 14-day threshold).
openssl req -x509 -newkey rsa:2048 -keyout "$tmpdir/ok_key.pem" -out "$tmpdir/ok.pem" \
    -days 400 -nodes -subj "//CN=test" > /dev/null 2>&1

# A cert expiring in ~4 days (inside the default 14-day warn window).
openssl req -x509 -newkey rsa:2048 -keyout "$tmpdir/warn_key.pem" -out "$tmpdir/warn.pem" \
    -days 4 -nodes -subj "//CN=test" > /dev/null 2>&1

# A cert with a fixed, already-past validity window.
openssl req -x509 -newkey rsa:2048 -keyout "$tmpdir/expired_key.pem" -out "$tmpdir/expired.pem" \
    -nodes -subj "//CN=test" -not_before 20190101000000Z -not_after 20200101000000Z > /dev/null 2>&1

# --- OK: comfortably valid cert exits 0 and reports OK ---
out="$("$script" --file "$tmpdir/ok.pem" 2>&1)"
rc=$?
assert_contains "$out" "OK:" "far-future cert reports OK"
[ "$rc" -eq 0 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: OK cert should exit 0, got $rc"; }

# --- WARN: cert inside the default warn window exits 1 ---
out="$("$script" --file "$tmpdir/warn.pem" 2>&1)"
rc=$?
assert_contains "$out" "WARN:" "soon-to-expire cert reports WARN"
[ "$rc" -eq 1 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: WARN cert should exit 1, got $rc"; }

# --- a tighter --warn-days pulls the same cert back into OK territory ---
out="$("$script" --file "$tmpdir/warn.pem" --warn-days 1 2>&1)"
rc=$?
assert_contains "$out" "OK:" "--warn-days below days-remaining reports OK for the same cert"
[ "$rc" -eq 0 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: expected exit 0, got $rc"; }

# --- EXPIRED: an already-past cert exits 2 and reports EXPIRED ---
out="$("$script" --file "$tmpdir/expired.pem" 2>&1)"
rc=$?
assert_contains "$out" "EXPIRED:" "past-dated cert reports EXPIRED"
assert_contains "$out" "ago" "EXPIRED message states how long ago it lapsed"
[ "$rc" -eq 2 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: EXPIRED cert should exit 2, got $rc"; }

# --- error cases ---
if "$script" --file "$tmpdir/does-not-exist.pem" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: missing cert file should exit non-zero"
else
    pass=$((pass + 1))
fi

if "$script" somehost.example --file "$tmpdir/ok.pem" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: passing both a host and --file should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: no arguments at all should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" --file "$tmpdir/ok.pem" --warn-days not-a-number > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: non-numeric --warn-days should be rejected"
else
    pass=$((pass + 1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
