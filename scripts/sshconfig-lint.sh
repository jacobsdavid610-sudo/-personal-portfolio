#!/usr/bin/env bash
# Lints an OpenSSH client config file for footguns that ssh itself won't
# error on, it'll just quietly do the wrong thing: a `Host *` block
# placed before a specific Host (ssh_config is first-match-wins per
# option, so anything the wildcard block already set is locked in before
# a later specific block gets a say), the same Host pattern declared
# twice (the second declaration is dead for any option the first one
# already set), and a referenced IdentityFile that doesn't actually
# exist on disk. No dependencies beyond bash/coreutils.
set -uo pipefail

usage() {
    echo "Usage: $(basename "$0") [config-file]" >&2
    echo "       (defaults to ~/.ssh/config)" >&2
    exit 2
}

[ $# -le 1 ] || usage
config="${1:-$HOME/.ssh/config}"
[ -f "$config" ] || { echo "No such config file: $config" >&2; exit 2; }

config_dir="$(cd "$(dirname "$config")" && pwd)"

findings=0
report() {
    echo "$1"
    findings=$((findings + 1))
}

wildcard_seen=0
wildcard_line=0
declare -A host_first_line
current_host="(none)"
lineno=0

while IFS= read -r raw || [ -n "$raw" ]; do
    lineno=$((lineno + 1))

    line="$(printf '%s' "$raw" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    [ -z "$line" ] && continue
    [ "${line:0:1}" = "#" ] && continue

    read -r key rest <<< "$line"
    if [[ "$key" == *=* ]]; then
        rest="${key#*=}${rest:+ $rest}"
        key="${key%%=*}"
    fi
    key="$(printf '%s' "$key" | tr '[:upper:]' '[:lower:]')"

    case "$key" in
        host)
            current_host="$rest"

            if [ "$rest" = "*" ]; then
                [ "$wildcard_seen" -eq 0 ] && { wildcard_seen=1; wildcard_line=$lineno; }
            elif [ "$wildcard_seen" -eq 1 ]; then
                report "SHADOWED: line $lineno: 'Host $rest' comes after the wildcard 'Host *' on line $wildcard_line - any option already set there wins over this block"
            fi

            if [ -n "${host_first_line[$rest]:-}" ]; then
                report "DUPLICATE: line $lineno: 'Host $rest' was already declared on line ${host_first_line[$rest]} - this block is dead for any option the first one already set"
            else
                host_first_line["$rest"]=$lineno
            fi
            ;;
        identityfile)
            path="$rest"
            case "$path" in
                "~/"*) path="$HOME/${path#\~/}" ;;
                /*) : ;;
                *) path="$config_dir/$path" ;;
            esac

            if [ ! -f "$path" ]; then
                report "MISSING: line $lineno: IdentityFile '$rest' (Host $current_host) does not exist"
            fi
            ;;
    esac
done < "$config"

echo
echo "$findings finding(s)."
[ "$findings" -eq 0 ]
