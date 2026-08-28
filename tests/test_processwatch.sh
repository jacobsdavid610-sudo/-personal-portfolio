#!/usr/bin/env bash
# Assertion-based tests for processwatch.sh, run against real background
# processes (not mocked).
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/../scripts/processwatch.sh"

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
cleanup_pids=()
trap 'for p in "${cleanup_pids[@]:-}"; do kill "$p" 2>/dev/null; done; rm -rf "$tmpdir"' EXIT

# A short-lived real background process to check liveness against.
sleep 5 &
live_pid=$!
cleanup_pids+=("$live_pid")

# --- a genuinely running PID is reported RUNNING with exit 0 ---
out="$("$script" --pid "$live_pid" 2>&1)"
rc=$?
assert_contains "$out" "RUNNING: pid $live_pid" "a live PID is reported as running"
[ "$rc" -eq 0 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: live pid should exit 0, got $rc"; }

# --- a PID file containing that same real PID resolves and reports it ---
pidfile="$tmpdir/proc.pid"
echo "$live_pid" > "$pidfile"
out="$("$script" --pid "$pidfile" 2>&1)"
rc=$?
assert_contains "$out" "RUNNING: pid $live_pid (from $pidfile)" "a pidfile resolves to the real pid and reports the source file"
[ "$rc" -eq 0 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: expected exit 0, got $rc"; }

# --- after the process is killed, the same PID is reported NOT RUNNING ---
kill "$live_pid" 2>/dev/null
wait "$live_pid" 2>/dev/null
out="$("$script" --pid "$live_pid" 2>&1)"
rc=$?
assert_contains "$out" "NOT RUNNING: pid $live_pid" "a dead pid is reported as not running"
[ "$rc" -eq 1 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: dead pid should exit 1, got $rc"; }

# --- a pidfile whose content isn't numeric is treated as not running, not a crash ---
badfile="$tmpdir/bad.pid"
echo "not-a-pid" > "$badfile"
out="$("$script" --pid "$badfile" 2>&1)"
rc=$?
assert_contains "$out" "NOT RUNNING" "a non-numeric pidfile content is treated as not-running"
[ "$rc" -eq 1 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: expected exit 1, got $rc"; }

# --- --restart-cmd relaunches and the retry loop picks up the NEW pid
# written into the pidfile by the restart command itself ---
restart_pidfile="$tmpdir/restart.pid"
echo "999999" > "$restart_pidfile"  # a pid almost certainly not alive
out="$("$script" --pid "$restart_pidfile" \
    --restart-cmd "sleep 5 & echo \$! > '$restart_pidfile'" 2>&1)"
rc=$?
assert_contains "$out" "NOT RUNNING" "restart path first reports the original pid as not running"
assert_contains "$out" "RESTARTED:" "restart path reports success once the new pid is alive"
[ "$rc" -eq 0 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: successful restart should exit 0, got $rc"; }
new_pid="$(cat "$restart_pidfile")"
cleanup_pids+=("$new_pid")
if [ "$new_pid" != "999999" ]; then
    pass=$((pass + 1))
else
    fail=$((fail + 1))
    echo "FAIL: expected the pidfile to be rewritten with a fresh pid"
fi

# --- a pattern that can't possibly match is reported not running ---
out="$("$script" --pattern "definitely-not-a-real-process-name-xyz123" 2>&1)"
rc=$?
assert_contains "$out" "NOT RUNNING: pattern" "an unmatched pattern is reported as not running"
[ "$rc" -eq 1 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: expected exit 1, got $rc"; }

# --- error cases ---
if "$script" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: no arguments at all should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" --pid 1 --pattern foo > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: combining --pid and --pattern should be rejected"
else
    pass=$((pass + 1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
