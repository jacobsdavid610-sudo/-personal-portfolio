#!/usr/bin/env bash
# Tests for diskalert.sh, against a stubbed `df` prepended onto PATH so
# usage percentages are fully controlled rather than depending on however
# full the machine running the tests happens to be.
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/../scripts/diskalert.sh"

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

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

mkdir -p "$work_dir/ok" "$work_dir/warn" "$work_dir/crit" "$work_dir/unknown"
map_file="$work_dir/df-map.txt"
cat > "$map_file" <<EOF
$work_dir/ok 50
$work_dir/warn 85
$work_dir/crit 95
$work_dir/unknown -
EOF

fake_bin="$work_dir/bin"
mkdir -p "$fake_bin"
cat > "$fake_bin/df" <<EOF
#!/usr/bin/env bash
path="\$2"
pct=\$(grep -F "\$path " "$map_file" 2>/dev/null | awk '{print \$2}')
pct="\${pct:-0}"
echo "Filesystem     1024-blocks      Used Available Capacity Mounted on"
echo "fakefs                 100        50        50 \${pct}% \$path"
EOF
chmod +x "$fake_bin/df"
export PATH="$fake_bin:$PATH"

# --- usage well under both thresholds is OK ---
out="$("$script" "$work_dir/ok" 2>&1)"
status=$?
assert_eq "$status" "0" "under-threshold path exits 0"
assert_contains "$out" "OK: $work_dir/ok" "under-threshold path reports OK"

# --- usage between warn and critical is WARNING ---
out="$("$script" "$work_dir/warn" 2>&1)"
status=$?
assert_eq "$status" "1" "warn-range path exits 1"
assert_contains "$out" "WARNING: $work_dir/warn" "warn-range path reports WARNING"

# --- usage at/over critical is CRITICAL ---
out="$("$script" "$work_dir/crit" 2>&1)"
status=$?
assert_eq "$status" "2" "critical-range path exits 2"
assert_contains "$out" "CRITICAL: $work_dir/crit" "critical-range path reports CRITICAL"

# --- unparseable df output (e.g. a filesystem with no size limit) is UNKNOWN ---
out="$("$script" "$work_dir/unknown" 2>&1)"
status=$?
assert_eq "$status" "3" "unparseable usage exits 3"
assert_contains "$out" "UNKNOWN: $work_dir/unknown" "unparseable usage reports UNKNOWN"

# --- custom thresholds shift which bucket a percentage falls in ---
out="$("$script" "$work_dir/warn" --warn 90 --critical 95 2>&1)"
status=$?
assert_eq "$status" "0" "custom thresholds move 85% back into OK"

# --- multiple paths: overall exit code is the worst of all of them ---
status=0
"$script" "$work_dir/ok" "$work_dir/warn" "$work_dir/crit" > /dev/null 2>&1 || status=$?
assert_eq "$status" "2" "mixed paths report the worst status (critical) overall"

# --- a path that doesn't exist is an immediate error, no df call needed ---
out="$("$script" "$work_dir/does-not-exist" 2>&1)"
status=$?
assert_eq "$status" "3" "nonexistent path exits 3"
assert_contains "$out" "ERROR:" "nonexistent path reports ERROR"

# --- a non-numeric threshold is a usage error ---
if "$script" "$work_dir/ok" --warn notanumber > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: non-numeric --warn should exit non-zero"
else
    pass=$((pass + 1))
fi

# --- warn greater than critical is rejected ---
if "$script" "$work_dir/ok" --warn 90 --critical 50 > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: --warn > --critical should exit non-zero"
else
    pass=$((pass + 1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
