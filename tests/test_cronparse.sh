#!/usr/bin/env bash
# Assertion-based tests for cronparse.sh.
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/../scripts/cronparse.sh"

pass=0
fail=0

assert_eq() {
    local actual="$1" expected="$2" label="$3"
    if [ "$actual" = "$expected" ]; then
        pass=$((pass + 1))
    else
        fail=$((fail + 1))
        echo "FAIL: $label"
        echo "  expected: $expected"
        echo "  actual:   $actual"
    fi
}

assert_eq "$("$script" "* * * * *")" "Runs every minute." \
    "all-star field describes as 'every minute'"

assert_eq "$("$script" "*/15 * * * *")" "Runs every 15 minutes." \
    "step describes as 'every N minutes'"

assert_eq "$("$script" "30 9 * * *")" "Runs at minute 30, at hour 9." \
    "single values describe as 'at minute X, at hour Y'"

assert_eq "$("$script" "0 9-17 * * *")" "Runs at minute 0, from hour 9 through 17." \
    "range describes as 'from hour A through B'"

assert_eq "$("$script" "0,15,30,45 * * * *")" "Runs at minutes 0, 15, 30, and 45." \
    "comma list describes with 'and' before the last item"

assert_eq "$("$script" "0 0 1 1,6 1-5")" \
    "Runs at minute 0, at hour 0, on day-of-month 1, in months 1 and 6, from day-of-week 1 through 5." \
    "all five fields combine into one sentence in field order"

assert_eq "$("$script" "0 0 * * 7")" "Runs at minute 0, at hour 0, on day-of-week 7." \
    "day-of-week 7 (Sunday alias) is accepted"

# --- error cases: non-zero exit, message on stderr ---

if "$script" "* * * *" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: 4 fields (missing dow) should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" "60 * * * *" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: out-of-range minute (60) should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" "*/0 * * * *" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: step of 0 should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" "0 17-9 * * *" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: backwards range (17-9) should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" "0,*/5 * * * *" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: a step expression inside a comma list should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" "0 0 * * 8" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: day-of-week 8 is out of the valid 0-7 range and should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: no argument at all should be rejected"
else
    pass=$((pass + 1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
