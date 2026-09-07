#!/usr/bin/env bash
# Render a template file's ${VAR} placeholders from the environment,
# writing the result to stdout. Unlike plain envsubst, an UNSET variable
# is a hard error by default (a set-but-empty value is fine) - a typo'd
# placeholder name should fail loud, not silently render as an empty
# string in the config file that comes out the other end. No dependencies.
set -uo pipefail

usage() {
    echo "Usage: $(basename "$0") <template-file> [--only VAR,VAR,...] [--allow-unset]" >&2
    exit 2
}

template=""
only=""
allow_unset=0

while [ $# -gt 0 ]; do
    case "$1" in
        --only)
            only="$2"
            shift 2
            ;;
        --allow-unset)
            allow_unset=1
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            [ -z "$template" ] || usage
            template="$1"
            shift
            ;;
    esac
done

[ -n "$template" ] || usage
[ -f "$template" ] || { echo "ERROR: $template: no such file" >&2; exit 2; }

mapfile -t referenced < <(grep -oE '\$\{[A-Za-z_][A-Za-z0-9_]*\}' "$template" | sed -E 's/[${}]//g' | sort -u)

only_list=()
if [ -n "$only" ]; then
    IFS=',' read -ra only_list <<< "$only"
fi

is_in_only() {
    local name="$1" candidate
    [ ${#only_list[@]} -eq 0 ] && return 0
    for candidate in "${only_list[@]}"; do
        [ "$candidate" = "$name" ] && return 0
    done
    return 1
}

to_substitute=()
missing=()
for var in "${referenced[@]}"; do
    is_in_only "$var" || continue
    to_substitute+=("$var")
    [ -v "$var" ] || missing+=("$var")
done

if [ ${#missing[@]} -gt 0 ] && [ "$allow_unset" -eq 0 ]; then
    echo "ERROR: unset variable(s) referenced in $template: ${missing[*]}" >&2
    exit 1
fi

content="$(cat "$template")"
for var in "${to_substitute[@]}"; do
    search="\${${var}}"
    value="${!var-}"
    content="${content//$search/$value}"
done

printf '%s\n' "$content"
