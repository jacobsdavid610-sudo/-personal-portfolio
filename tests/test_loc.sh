#!/usr/bin/env bash
# Assertion-based tests for loc.sh. No test framework dependency.
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/../scripts/loc.sh"

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
    if [[ "$haystack" != *"$needle"* ]]; then
        pass=$((pass + 1))
    else
        fail=$((fail + 1))
        echo "FAIL: $label — did not expect to find '$needle' in: $haystack"
    fi
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# a.py: 3 lines (1 blank), b.py: 2 lines (0 blank) -> py so far: 5 lines, 2 blank
printf 'def foo():\n    pass\n\n' > "$tmpdir/a.py"
printf 'x = 1\ny = 2\n' > "$tmpdir/b.py"
mkdir "$tmpdir/subdir"
# nested.py: 5 lines (2 blank) -> py total: 10 lines, 4 blank, 5 non-blank
printf 'class Foo:\n    def bar(self):\n        return 1\n\n\n' > "$tmpdir/subdir/nested.py"
# c.js: 5 lines (2 blank)
printf 'function f() {\n\n  return 1;\n\n}\n' > "$tmpdir/c.js"
# no-extension files: README (1 line) + .gitignore (1 line) = 2 lines total
printf 'just a readme\n' > "$tmpdir/README"
printf '*.log\n' > "$tmpdir/.gitignore"
# excluded by default: .git/config must never be counted, even though its
# own basename ("config") has no extension - if pruning failed, this would
# silently inflate the "(no extension)" bucket from 2 to 4.
mkdir "$tmpdir/.git"
printf '[core]\n\trepositoryformatversion = 0\n' > "$tmpdir/.git/config"
# excluded only with an explicit --exclude vendor
mkdir "$tmpdir/vendor"
printf "print('vendor')\n" > "$tmpdir/vendor/thirdparty.py"

# --- default run: py/js/no-extension totals, .git pruned, vendor included ---
out="$("$script" "$tmpdir")"
assert_contains "$out" "py                       11" "py total is 10 (a+b+nested) + 1 (vendor, not excluded by default)"
assert_contains "$out" "js                        5" "js total is 5"
assert_contains "$out" "(no extension)            2" "no-extension total is exactly 2 (README + .gitignore, .git/config pruned)"
assert_contains "$out" "7 file(s), 18 line(s) total" "summary counts all 7 files and 18 lines"

# --- --no-blank counts only non-blank lines ---
out_noblank="$("$script" "$tmpdir" --no-blank)"
assert_contains "$out_noblank" "py                        8" "py non-blank total is 7 (a:2 b:2 nested:3) + 1 (vendor)"
assert_contains "$out_noblank" "js                        3" "js non-blank total is 3"

# --- --exclude adds an extra pruned directory on top of the defaults ---
out_excluded="$("$script" "$tmpdir" --exclude vendor)"
assert_contains "$out_excluded" "py                       10" "py total excludes vendor/thirdparty.py when --exclude vendor is given"
assert_not_contains "$out_excluded" "vendor" "vendor's file never appears once excluded"

# --- empty directory ---
empty_dir="$tmpdir/empty"
mkdir "$empty_dir"
out_empty="$("$script" "$empty_dir")"
assert_contains "$out_empty" "No files found under $empty_dir." "empty directory reports no files"

# --- missing path is a clean error, not a crash ---
if "$script" "$tmpdir/does-not-exist" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: missing path should exit non-zero"
else
    pass=$((pass + 1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
