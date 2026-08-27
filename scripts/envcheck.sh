#!/usr/bin/env bash
# Check that a list of required environment variables are set (and
# non-empty) in the current environment. Fail-fast sanity check for
# deploy/startup scripts, before the real program starts and fails with a
# less helpful error three layers deeper. No dependencies.
set -uo pipefail

usage() {
    echo "Usage: $(basename "$0") VAR [VAR ...]" >&2
    echo "       $(basename "$0") --file <requirements-file>" >&2
    exit 2
}

file=""
names=()

while [ $# -gt 0 ]; do
    case "$1" in
        --file)
            file="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            names+=("$1")
            shift
            ;;
    esac
done

if [ -n "$file" ]; then
    [ "${#names[@]}" -eq 0 ] || usage
    [ -f "$file" ] || { echo "No such file: $file" >&2; exit 2; }
    while IFS= read -r line; do
        line="${line%%#*}"
        line="$(echo "$line" | xargs)"
        [ -n "$line" ] && names+=("$line")
    done < "$file"
fi

[ "${#names[@]}" -gt 0 ] || usage

missing=()
empty=()
ok=0

for name in "${names[@]}"; do
    if [[ ! "$name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
        echo "Not a valid environment variable name: $name" >&2
        exit 2
    fi

    if [ -z "${!name+set}" ]; then
        missing+=("$name")
    elif [ -z "${!name}" ]; then
        empty+=("$name")
    else
        ok=$((ok + 1))
    fi
done

for name in "${missing[@]}"; do
    echo "MISSING: $name"
done
for name in "${empty[@]}"; do
    echo "EMPTY:   $name"
done

echo
echo "$ok set, ${#missing[@]} missing, ${#empty[@]} empty (of ${#names[@]} checked)."

if [ "${#missing[@]}" -gt 0 ] || [ "${#empty[@]}" -gt 0 ]; then
    exit 1
fi
exit 0
