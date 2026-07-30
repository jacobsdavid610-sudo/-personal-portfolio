#!/usr/bin/env bash
# List (or delete, with --delete) files under a directory that are older
# than N days. Dry-run by default. No dependencies beyond coreutils/find.
set -euo pipefail

usage() {
    echo "Usage: $(basename "$0") <directory> --days N [--delete] [--yes]" >&2
    exit 1
}

dir=""
days=""
delete=0
yes=0

while [ $# -gt 0 ]; do
    case "$1" in
        --days)
            days="$2"
            shift 2
            ;;
        --delete)
            delete=1
            shift
            ;;
        --yes)
            yes=1
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            if [ -z "$dir" ]; then
                dir="$1"
                shift
            else
                usage
            fi
            ;;
    esac
done

[ -n "$dir" ] || usage
[ -n "$days" ] || usage
[ -d "$dir" ] || { echo "Not a directory: $dir" >&2; exit 1; }
case "$days" in
    ''|*[!0-9]*) echo "--days must be a non-negative integer, got: $days" >&2; exit 1 ;;
esac

mapfile -d '' -t matches < <(find "$dir" -type f -mtime "+$days" -print0)

if [ "${#matches[@]}" -eq 0 ]; then
    echo "No files older than $days day(s) found under $dir."
    exit 0
fi

printf '%s\n' "${matches[@]}"
echo
echo "${#matches[@]} file(s) older than $days day(s)."

if [ "$delete" -eq 0 ]; then
    exit 0
fi

if [ "$yes" -eq 0 ]; then
    read -r -p "Delete all files listed above? [y/N] " answer
    case "$answer" in
        y|Y) ;;
        *) echo "Aborted, nothing deleted."; exit 0 ;;
    esac
fi

for f in "${matches[@]}"; do
    rm -f -- "$f"
done
echo "Deleted ${#matches[@]} file(s)."
