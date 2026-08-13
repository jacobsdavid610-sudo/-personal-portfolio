#!/usr/bin/env bash
# Report the largest immediate entries (files and directories) under a path,
# sorted by size, human-readable by default. No dependencies beyond
# coreutils (find/du/sort/awk).
set -uo pipefail

usage() {
    echo "Usage: $(basename "$0") <path> [-n N] [--threshold SIZE] [--bytes]" >&2
    exit 2
}

path=""
top_n=10
threshold=""
raw_bytes=0

while [ $# -gt 0 ]; do
    case "$1" in
        -n)
            top_n="$2"
            shift 2
            ;;
        --threshold)
            threshold="$2"
            shift 2
            ;;
        --bytes)
            raw_bytes=1
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            if [ -z "$path" ]; then
                path="$1"
                shift
            else
                usage
            fi
            ;;
    esac
done

[ -n "$path" ] || usage
[ -d "$path" ] || { echo "Not a directory: $path" >&2; exit 1; }
case "$top_n" in
    ''|*[!0-9]*) echo "-n must be a positive integer, got: $top_n" >&2; exit 2 ;;
esac
[ "$top_n" -gt 0 ] || { echo "-n must be a positive integer, got: $top_n" >&2; exit 2; }

# Convert a size like "100K", "5M", "1G", or a plain byte count, to bytes.
to_bytes() {
    local spec="$1" num unit
    case "$spec" in
        *[Kk]) num="${spec%[Kk]}"; unit=1024 ;;
        *[Mm]) num="${spec%[Mm]}"; unit=$((1024 * 1024)) ;;
        *[Gg]) num="${spec%[Gg]}"; unit=$((1024 * 1024 * 1024)) ;;
        *) num="$spec"; unit=1 ;;
    esac
    case "$num" in
        ''|*[!0-9]*) return 1 ;;
    esac
    echo $((num * unit))
}

threshold_bytes=""
if [ -n "$threshold" ]; then
    if ! threshold_bytes="$(to_bytes "$threshold")"; then
        echo "Invalid --threshold value: $threshold" >&2
        exit 2
    fi
fi

# Byte count -> human-readable string (B/K/M/G/T, one decimal place).
human() {
    awk -v b="$1" 'BEGIN {
        split("B K M G T", units, " ")
        i = 1
        while (b >= 1024 && i < 5) { b /= 1024; i++ }
        printf "%.1f%s", b, units[i]
    }'
}

sizes_file="$(mktemp)"
trap 'rm -f "$sizes_file"' EXIT

while IFS= read -r -d '' entry; do
    bytes="$(du -sb -- "$entry" 2>/dev/null | cut -f1)"
    [ -n "$bytes" ] || continue
    printf '%s\t%s\n' "$bytes" "$entry" >> "$sizes_file"
done < <(find "$path" -mindepth 1 -maxdepth 1 -print0)

if [ ! -s "$sizes_file" ]; then
    echo "No entries found under $path."
    exit 0
fi

sort -t "$(printf '\t')" -k1,1nr "$sizes_file" | head -n "$top_n" | while IFS="$(printf '\t')" read -r bytes entry; do
    name="$(basename "$entry")"
    if [ "$raw_bytes" -eq 1 ]; then
        size_str="${bytes}B"
    else
        size_str="$(human "$bytes")"
    fi
    marker="  "
    if [ -n "$threshold_bytes" ] && [ "$bytes" -ge "$threshold_bytes" ]; then
        marker="! "
    fi
    printf '%s%8s  %s\n' "$marker" "$size_str" "$name"
done

total="$(wc -l < "$sizes_file" | tr -d ' ')"
suffix="ies"
[ "$total" -eq 1 ] && suffix="y"
echo
echo "$total entr$suffix under $path."
