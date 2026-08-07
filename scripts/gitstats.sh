#!/usr/bin/env bash
# Summarize commit counts per author in a git repository.
# Usage: gitstats.sh [repo-dir] [--since DATE] [--top N]
set -uo pipefail

repo="."
since=""
top=0

while [ $# -gt 0 ]; do
    case "$1" in
        --since)
            since="$2"
            shift 2
            ;;
        --top)
            top="$2"
            shift 2
            ;;
        *)
            repo="$1"
            shift
            ;;
    esac
done

if [ ! -d "$repo/.git" ]; then
    echo "Not a git repository: $repo" >&2
    exit 1
fi

args=(-C "$repo" log --format=%an)
if [ -n "$since" ]; then
    args+=(--since="$since")
fi

counts="$(git "${args[@]}" 2>/dev/null | sort | uniq -c | sort -rn)"

if [ -z "$counts" ]; then
    echo "No commits found."
    exit 0
fi

if [ "$top" -gt 0 ] 2>/dev/null; then
    counts="$(echo "$counts" | head -n "$top")"
fi

echo "$counts" | while read -r count author; do
    printf '%6d  %s\n' "$count" "$author"
done

total="$(echo "$counts" | awk '{sum += $1} END {print sum}')"
echo
echo "Total: $total commit(s) shown."
