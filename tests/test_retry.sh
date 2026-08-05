#!/usr/bin/env bash
# Assertion-based tests for retry.sh. No test framework dependency.
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/../scripts/retry.sh"

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

# A "command" that fails until its counter file reaches a threshold, then
# succeeds. $1 = counter file, $2 = attempts needed before success.
flaky="$tmpdir/flaky.sh"
cat > "$flaky" <<'SCRIPT'
#!/usr/bin/env bash
counter_file="$1"
needed="$2"
count=0
[ -f "$counter_file" ] && count="$(cat "$counter_file")"
count=$((count + 1))
echo "$count" > "$counter_file"
if [ "$count" -ge "$needed" ]; then
    exit 0
else
    exit 1
fi
SCRIPT
chmod +x "$flaky"

always_fail="$tmpdir/always_fail.sh"
cat > "$always_fail" <<'SCRIPT'
#!/usr/bin/env bash
exit 7
SCRIPT
chmod +x "$always_fail"

# --- succeeds immediately, no retries needed ---
counter="$tmpdir/c1"
out="$("$script" --base-delay 0.01 -- "$flaky" "$counter" 1 2>&1)"
status=$?
assert_eq "$status" "0" "succeeds-immediately exit code"
assert_eq "$(cat "$counter")" "1" "succeeds-immediately only ran once"

# --- fails twice, succeeds on the third attempt ---
counter="$tmpdir/c2"
out="$("$script" --max-attempts 5 --base-delay 0.01 -- "$flaky" "$counter" 3 2>&1)"
status=$?
assert_eq "$status" "0" "eventual-success exit code"
assert_eq "$(cat "$counter")" "3" "eventual-success ran exactly 3 times"
assert_contains "$out" "Succeeded on attempt 3" "eventual-success message"

# --- always fails, exhausts attempts and propagates the exit code ---
out="$("$script" --max-attempts 3 --base-delay 0.01 -- "$always_fail" 2>&1)"
status=$?
assert_eq "$status" "7" "exhausted-retries propagates the command's exit code"
assert_contains "$out" "No attempts left" "exhausted-retries message"

# --- rejects a non-numeric --max-attempts ---
if "$script" --max-attempts abc -- "$always_fail" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: non-numeric --max-attempts should exit non-zero"
else
    pass=$((pass + 1))
fi

# --- no command given ---
if "$script" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: missing command should exit non-zero"
else
    pass=$((pass + 1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
