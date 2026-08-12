#!/usr/bin/env bash
# Compare two .env-style (KEY=VALUE) files: report added/removed/changed
# keys. Values are masked by default since .env files routinely hold
# secrets - pass --show-values to print them (only do that against files
# you already trust the audience for).
set -uo pipefail

usage() {
    echo "Usage: $(basename "$0") <file-a> <file-b> [--show-values]" >&2
    exit 2
}

file_a=""
file_b=""
show_values=0

while [ $# -gt 0 ]; do
    case "$1" in
        --show-values)
            show_values=1
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            if [ -z "$file_a" ]; then
                file_a="$1"
            elif [ -z "$file_b" ]; then
                file_b="$1"
            else
                usage
            fi
            shift
            ;;
    esac
done

[ -n "$file_a" ] && [ -n "$file_b" ] || usage
[ -f "$file_a" ] || { echo "No such file: $file_a" >&2; exit 1; }
[ -f "$file_b" ] || { echo "No such file: $file_b" >&2; exit 1; }

# Extract KEY=VALUE lines, skipping blanks and #-comments.
extract() {
    grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$1"
}

mask() {
    if [ "$show_values" -eq 1 ]; then
        printf '%s' "$1"
    else
        printf '***'
    fi
}

tmp_a="$(mktemp)"
tmp_b="$(mktemp)"
trap 'rm -f "$tmp_a" "$tmp_b"' EXIT
extract "$file_a" > "$tmp_a"
extract "$file_b" > "$tmp_b"

added=0
removed=0
changed=0

# Keys only in b (added).
while IFS='=' read -r key value; do
    [ -z "$key" ] && continue
    if ! grep -q "^${key}=" "$tmp_a"; then
        echo "+ $key=$(mask "$value")"
        added=$((added + 1))
    fi
done < "$tmp_b"

# Keys only in a (removed), or present in both with a different value (changed).
while IFS='=' read -r key value_a; do
    [ -z "$key" ] && continue
    line_b="$(grep "^${key}=" "$tmp_b" || true)"
    if [ -z "$line_b" ]; then
        echo "- $key=$(mask "$value_a")"
        removed=$((removed + 1))
        continue
    fi
    value_b="${line_b#*=}"
    if [ "$value_a" != "$value_b" ]; then
        echo "~ $key: $(mask "$value_a") -> $(mask "$value_b")"
        changed=$((changed + 1))
    fi
done < "$tmp_a"

total=$((added + removed + changed))
echo
if [ "$total" -eq 0 ]; then
    echo "No differences."
else
    echo "$added added, $removed removed, $changed changed."
fi
