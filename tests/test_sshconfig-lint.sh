#!/usr/bin/env bash
# Assertion-based tests for sshconfig-lint.sh, run against real scratch
# config files and key files.
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/../scripts/sshconfig-lint.sh"

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
    if [[ "$haystack" == *"$needle"* ]]; then
        fail=$((fail + 1))
        echo "FAIL: $label — did not expect to find '$needle' in: $haystack"
    else
        pass=$((pass + 1))
    fi
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

mkdir -p "$tmpdir/.ssh"
printf 'a key\n' > "$tmpdir/.ssh/id_present"

# --- a clean config (specific hosts before the trailing wildcard, no
# duplicates, every IdentityFile present) has zero findings and exits 0 ---
clean_config="$tmpdir/clean_config"
cat > "$clean_config" <<EOF
Host example.com
    HostName example.com
    IdentityFile ~/.ssh/id_present

Host *
    User alice
EOF

out="$(HOME="$tmpdir" "$script" "$clean_config" 2>&1)"
rc=$?
assert_contains "$out" "0 finding(s)." "clean config reports zero findings"
[ "$rc" -eq 0 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: clean config should exit 0, got $rc"; }

# --- Host * before a specific host is flagged as SHADOWED, but a host
# before the wildcard is not ---
messy_config="$tmpdir/messy_config"
cat > "$messy_config" <<EOF
Host *
    User alice

Host example.com
    HostName example.com

Host example.com
    Port 2222

Host other.com
    IdentityFile ~/.ssh/id_missing
EOF

out="$(HOME="$tmpdir" "$script" "$messy_config" 2>&1)"
rc=$?
assert_contains "$out" "SHADOWED: line 4: 'Host example.com'" "a host after the wildcard is flagged as shadowed"
assert_contains "$out" "DUPLICATE: line 7: 'Host example.com' was already declared on line 4" "a repeated Host pattern is flagged as a duplicate"
assert_contains "$out" "MISSING: line 11: IdentityFile '~/.ssh/id_missing'" "a nonexistent IdentityFile is flagged as missing"
[ "$rc" -eq 1 ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: a config with findings should exit 1, got $rc"; }

# --- an IdentityFile path relative to the config file's own directory
# resolves against that directory, not the current working directory ---
relative_config="$tmpdir/relative_config"
cat > "$relative_config" <<EOF
Host example.com
    IdentityFile .ssh/id_present
EOF
mkdir -p "$tmpdir/.ssh"
out="$(HOME="/nonexistent" "$script" "$relative_config" 2>&1)"
assert_not_contains "$out" "MISSING" "a config-relative IdentityFile path is resolved against the config's directory"

# --- comments and blank lines are ignored, not mistaken for directives ---
commented_config="$tmpdir/commented_config"
cat > "$commented_config" <<EOF
# a top-level comment

Host example.com
    # HostName example.com
    HostName example.com
EOF
out="$(HOME="$tmpdir" "$script" "$commented_config" 2>&1)"
assert_contains "$out" "0 finding(s)." "comment lines don't get parsed as directives"

# --- Key=Value form is parsed the same as Key Value ---
equals_config="$tmpdir/equals_config"
cat > "$equals_config" <<EOF
Host=example.com
IdentityFile=~/.ssh/id_present
EOF
out="$(HOME="$tmpdir" "$script" "$equals_config" 2>&1)"
assert_contains "$out" "0 finding(s)." "Key=Value directives resolve the same as Key Value"

# --- error cases ---
if "$script" "$tmpdir/does-not-exist" > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: a nonexistent config file should be rejected"
else
    pass=$((pass + 1))
fi

if "$script" a b > /dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL: more than one argument should be rejected"
else
    pass=$((pass + 1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
