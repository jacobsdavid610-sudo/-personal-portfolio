#!/usr/bin/env bash
# Assertion-based tests for runlock.sh. No test framework dependency.
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/../scripts/runlock.sh"
export RUNLOCK_POLL_INTERVAL=0.05

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

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
lock="$tmpdir/job.lock"

# Waits (up to ~5s) for a path to exist - used to know a background
# runlock has actually taken the lock before the next step.
wait_for() {
    local i
    for i in $(seq 1 100); do
        [ -e "$1" ] && return 0
        sleep 0.05
    done
    return 1
}

# --- runs the command, passes args through, propagates exit code ---
out="$(bash "$script" --lock "$lock" -- echo hello "a b")"
assert_eq "$out" "hello a b" "command output and args pass through"
bash "$script" --lock "$lock" -- bash -c 'exit 7'
assert_eq "$?" "7" "command's exit code is propagated"
assert_eq "$([ -e "$lock" ] && echo exists || echo gone)" "gone" "lock released after success"
bash "$script" --lock "$lock" -- false
assert_eq "$([ -e "$lock" ] && echo exists || echo gone)" "gone" "lock released after failure"

# --- stdin still reaches the command (foreground, not backgrounded) ---
out="$(echo piped | bash "$script" --lock "$lock" -- cat)"
assert_eq "$out" "piped" "stdin reaches the command"

# --- a second run while the first holds the lock is refused ---
bash "$script" --lock "$lock" -- bash -c "touch '$tmpdir/started'; sleep 2" &
first=$!
wait_for "$tmpdir/started"
err="$(bash "$script" --lock "$lock" -- echo should-not-run 2>&1)"
code=$?
assert_eq "$code" "75" "held lock exits 75"
assert_contains "$err" "giving up" "held lock explains itself"
[[ "$err" != *should-not-run* ]]
assert_eq "$?" "0" "second command never ran"
wait "$first"

# --- --wait succeeds once the holder finishes ---
rm -f "$tmpdir/started"
bash "$script" --lock "$lock" -- bash -c "touch '$tmpdir/started'; sleep 1" &
first=$!
wait_for "$tmpdir/started"
out="$(bash "$script" --lock "$lock" --wait 5 -- echo got-it)"
assert_eq "$out" "got-it" "--wait acquires after holder releases"
wait "$first"

# --- --wait gives up after the timeout ---
rm -f "$tmpdir/started"
bash "$script" --lock "$lock" -- bash -c "touch '$tmpdir/started'; sleep 4" &
first=$!
wait_for "$tmpdir/started"
start=$SECONDS
bash "$script" --lock "$lock" --wait 1 -- true 2>/dev/null
code=$?
elapsed=$((SECONDS - start))
assert_eq "$code" "75" "--wait times out with 75"
assert_eq "$([ "$elapsed" -le 3 ] && echo ok || echo slow)" "ok" "--wait 1 doesn't wait for the full holder"
wait "$first"

# --- stale lock from a dead pid is recovered ---
bash -c 'exit 0' &
dead_pid=$!
wait "$dead_pid"
mkdir "$lock" && echo "$dead_pid" > "$lock/pid"
err="$(bash "$script" --lock "$lock" -- echo recovered 2>&1)"
assert_contains "$err" "recovered" "command runs after stale lock"
assert_contains "$err" "removed stale lock" "stale recovery is reported"
assert_eq "$(ls "$tmpdir" | grep -c stale)" "0" "no stale graveyard dirs left behind"

# --- a lock dir with no pid file yet is treated as held, not stale ---
mkdir "$lock"
bash "$script" --lock "$lock" -- true 2>/dev/null
assert_eq "$?" "75" "pid-less lock dir counts as held"
assert_eq "$([ -d "$lock" ] && echo exists || echo gone)" "exists" "pid-less lock not deleted"
rm -rf "$lock"

# --- release doesn't delete a lock that isn't ours ---
bash "$script" --lock "$lock" -- bash -c "echo 999999 > '$lock/pid'"
assert_eq "$(cat "$lock/pid" 2>/dev/null)" "999999" "someone else's lock is left alone"
rm -rf "$lock"

# --- SIGTERM to runlock still releases the lock ---
rm -f "$tmpdir/started"
bash "$script" --lock "$lock" -- bash -c "touch '$tmpdir/started'; sleep 1" &
first=$!
wait_for "$tmpdir/started"
kill -TERM "$first"
wait "$first"
code=$?
assert_eq "$code" "143" "SIGTERM exits 143"
assert_eq "$([ -e "$lock" ] && echo exists || echo gone)" "gone" "lock released on SIGTERM"

# --- default lock path is derived from the command name ---
out="$(TMPDIR="$tmpdir" bash "$script" -- bash -c 'ls -d "$TMPDIR"/runlock-*.lock')"
assert_eq "$out" "$tmpdir/runlock-bash.lock" "default lock path uses command basename"

# --- usage errors ---
bash "$script" 2>/dev/null
assert_eq "$?" "2" "no command is a usage error"
bash "$script" --wait soon -- true 2>/dev/null
assert_eq "$?" "2" "non-numeric --wait is a usage error"
bash "$script" --bogus -- true 2>/dev/null
assert_eq "$?" "2" "unknown option is a usage error"

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
