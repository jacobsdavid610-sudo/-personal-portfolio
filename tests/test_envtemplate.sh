#!/usr/bin/env bash
# Tests for envtemplate.sh, against real scratch template files and a
# real environment (no mocking - it's just env vars and a text file).
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/../scripts/envtemplate.sh"

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

tpl="$work_dir/config.tpl"
cat > "$tpl" <<'EOF'
host: ${DB_HOST}
port: ${DB_PORT}
name: ${DB_NAME}
password: ${DB_PASSWORD}
EOF

# --- all referenced vars set (password deliberately empty-but-set) ---
out="$(DB_HOST=localhost DB_PORT=5432 DB_NAME=myapp DB_PASSWORD='' "$script" "$tpl" 2>&1)"
status=$?
assert_eq "$status" "0" "all vars set exits 0"
assert_contains "$out" "host: localhost" "substitutes DB_HOST"
assert_contains "$out" "password: " "an empty-but-set var substitutes as empty, not an error"

# --- a genuinely unset var is a hard error by default ---
out="$(env -u DB_NAME DB_HOST=localhost DB_PORT=5432 DB_PASSWORD=secret "$script" "$tpl" 2>&1)"
status=$?
assert_eq "$status" "1" "unset var exits 1"
assert_contains "$out" "DB_NAME" "error message names the missing variable"

# --- --allow-unset substitutes empty for a missing var instead of failing ---
out="$(env -u DB_NAME DB_HOST=localhost DB_PORT=5432 DB_PASSWORD=secret "$script" "$tpl" --allow-unset 2>&1)"
status=$?
assert_eq "$status" "0" "--allow-unset exits 0 even with a missing var"
assert_contains "$out" "name: " "--allow-unset renders the missing var as empty"

# --- --only restricts substitution scope; vars outside it are left literal ---
out="$(DB_HOST=localhost "$script" "$tpl" --only DB_HOST 2>&1)"
status=$?
assert_eq "$status" "0" "--only with the named var present exits 0"
assert_contains "$out" "host: localhost" "--only substitutes the named var"
assert_contains "$out" 'port: ${DB_PORT}' "--only leaves an out-of-scope placeholder untouched"

# --- a var outside --only's scope being unset is NOT an error ---
out="$(env -u DB_PORT DB_HOST=localhost "$script" "$tpl" --only DB_HOST 2>&1)"
status=$?
assert_eq "$status" "0" "an unset var outside --only's scope doesn't trigger the missing-var check"

# --- a template with no placeholders at all passes through unchanged ---
plain_tpl="$work_dir/plain.txt"
printf 'just plain text\nno placeholders here\n' > "$plain_tpl"
out="$("$script" "$plain_tpl" 2>&1)"
assert_eq "$out" "$(printf 'just plain text\nno placeholders here')" "a template with no placeholders passes through unchanged"

# --- a missing template file is an error ---
out="$("$script" "$work_dir/does-not-exist.tpl" 2>&1)"
status=$?
assert_eq "$status" "2" "missing template file exits 2"
assert_contains "$out" "no such file" "missing template file reports the reason"

# --- no arguments at all is a usage error ---
if "$script" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: no arguments should exit non-zero"
else
    pass=$((pass + 1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
