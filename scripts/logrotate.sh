#!/usr/bin/env bash
# Rotate a log file once it exceeds a size threshold: file -> file.1(.gz),
# shifting older rotations up to file.2, file.3, ... and dropping anything
# beyond --keep. Compresses rotated files with gzip unless --no-compress.
set -uo pipefail

usage() {
    echo "Usage: $(basename "$0") <logfile> --max-size BYTES [--keep N] [--no-compress]" >&2
    exit 2
}

logfile=""
max_size=""
keep=5
compress=1

while [ $# -gt 0 ]; do
    case "$1" in
        --max-size)
            max_size="$2"
            shift 2
            ;;
        --keep)
            keep="$2"
            shift 2
            ;;
        --no-compress)
            compress=0
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            if [ -z "$logfile" ]; then
                logfile="$1"
                shift
            else
                usage
            fi
            ;;
    esac
done

[ -n "$logfile" ] && [ -n "$max_size" ] || usage
case "$max_size" in ''|*[!0-9]*) echo "--max-size must be a non-negative integer" >&2; exit 2 ;; esac
case "$keep" in ''|*[!0-9]*) echo "--keep must be a non-negative integer" >&2; exit 2 ;; esac

if [ ! -f "$logfile" ]; then
    echo "Not a file: $logfile" >&2
    exit 2
fi

size="$(wc -c < "$logfile" | tr -d ' ')"

if [ "$size" -le "$max_size" ]; then
    echo "No rotation needed: $logfile is $size byte(s) (limit $max_size)."
    exit 0
fi

rotated_name() {
    local n="$1"
    if [ "$compress" -eq 1 ] && [ "$n" -gt 0 ]; then
        echo "${logfile}.${n}.gz"
    elif [ "$n" -gt 0 ]; then
        echo "${logfile}.${n}"
    else
        echo "$logfile"
    fi
}

# Drop the oldest rotation beyond retention, if present.
oldest="$(rotated_name "$keep")"
[ -e "$oldest" ] && rm -f -- "$oldest"

# Shift existing rotations up by one slot, oldest first.
i="$keep"
while [ "$i" -gt 1 ]; do
    prev="$(rotated_name "$((i - 1))")"
    cur="$(rotated_name "$i")"
    [ -e "$prev" ] && mv -f -- "$prev" "$cur"
    i=$((i - 1))
done

if [ "$keep" -ge 1 ]; then
    target="$(rotated_name 1)"
    if [ "$compress" -eq 1 ]; then
        gzip -c -- "$logfile" > "$target"
    else
        mv -f -- "$logfile" "$target"
    fi
    : > "$logfile"
    echo "Rotated $logfile ($size byte(s)) -> $target"
else
    : > "$logfile"
    echo "Rotated $logfile ($size byte(s)) -> discarded (--keep 0)"
fi
