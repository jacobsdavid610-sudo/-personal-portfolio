#!/usr/bin/env bash
# Tests for portcheck.sh against a real local TCP listener (a background
# Python http.server) plus a genuinely closed port. No mocking of the
# network - this either connects or it doesn't.
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/../scripts/portcheck.sh"

pass=0
fail=0

assert_eq() {
    local actual="$1" expected="$2" label="$3"
    if [ "$actual" = "$expected" ]; then
        pass=$((pass + 1))
    else
        fail=$((fail + 1))
        echo "FAIL: $label — expected '$expected', got '$actual'"
    fi
}

assert_contains() {
    local haystack="$1" needle="$2" label="$3"
    if [[ "$haystack" == *"$needle"* ]]; then
        pass=$((pass + 1))
    else
        fail=$((fail + 1))
        echo "FAIL: $label — expected to find '$needle' in: $haystack"
    fi
}

open_port=18391
closed_port=18392

python -m http.server "$open_port" --bind 127.0.0.1 > /dev/null 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null' EXIT

# Give the server a moment to actually bind before testing against it.
for _ in 1 2 3 4 5 6 7 8 9 10; do
    bash -c "exec 3<>/dev/tcp/127.0.0.1/$open_port" 2>/dev/null && break
    sleep 0.3
done

# --- open port is detected immediately ---
out="$("$script" 127.0.0.1 "$open_port" 2>&1)"
status=$?
assert_eq "$status" "0" "open port exits 0"
assert_contains "$out" "OPEN: 127.0.0.1:$open_port" "open port reports OPEN"

# --- closed port fails immediately when --wait is 0 (the default) ---
out="$("$script" 127.0.0.1 "$closed_port" --timeout 1 2>&1)"
status=$?
assert_eq "$status" "1" "closed port exits 1"
assert_contains "$out" "CLOSED: 127.0.0.1:$closed_port" "closed port reports CLOSED"

# --- --wait retries and still correctly gives up on a port that never opens ---
start=$(date +%s)
"$script" 127.0.0.1 "$closed_port" --timeout 1 --wait 2 --interval 1 > /dev/null 2>&1
status=$?
end=$(date +%s)
elapsed=$((end - start))
assert_eq "$status" "1" "--wait still exits 1 when the port never opens"
if [ "$elapsed" -ge 2 ]; then
    pass=$((pass + 1))
else
    fail=$((fail + 1))
    echo "FAIL: --wait 2 should take at least ~2s, took ${elapsed}s"
fi

# --- missing arguments is a usage error ---
if "$script" 127.0.0.1 > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: missing port should exit non-zero"
else
    pass=$((pass + 1))
fi

kill "$server_pid" 2>/dev/null

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
