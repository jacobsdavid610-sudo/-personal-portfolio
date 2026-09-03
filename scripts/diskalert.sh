#!/usr/bin/env bash
# Check filesystem usage percentage for one or more paths against
# warn/critical thresholds, Nagios/Icinga-plugin-style: exit 0 (OK), 1
# (WARNING), or 2 (CRITICAL) - whichever is worst across all paths given -
# and 3 (UNKNOWN) if usage can't be determined for a path. Uses `df -P`,
# no dependencies beyond coreutils.
set -uo pipefail

usage() {
    echo "Usage: $(basename "$0") [PATH ...] [--warn PCT] [--critical PCT]" >&2
    exit 3
}

is_uint() {
    case "$1" in
        ''|*[!0-9]*) return 1 ;;
        *) return 0 ;;
    esac
}

paths=()
warn=80
critical=90

while [ $# -gt 0 ]; do
    case "$1" in
        --warn)
            warn="${2:-}"
            shift 2
            ;;
        --critical)
            critical="${2:-}"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            paths+=("$1")
            shift
            ;;
    esac
done

[ ${#paths[@]} -eq 0 ] && paths=(/)

is_uint "$warn" || usage
is_uint "$critical" || usage
[ "$warn" -le "$critical" ] || { echo "--warn must be <= --critical" >&2; exit 3; }

for path in "${paths[@]}"; do
    [ -e "$path" ] || { echo "ERROR: $path: no such file or directory" >&2; exit 3; }
done

read_usage() {
    df -P "$1" 2>/dev/null | awk 'NR==2 {
        pct = $5
        sub("%", "", pct)
        mount = $6
        for (i = 7; i <= NF; i++) mount = mount " " $i
        print pct, mount
    }'
}

worst=0  # 0=OK 1=WARNING 2=CRITICAL 3=UNKNOWN

for path in "${paths[@]}"; do
    read -r pct mount < <(read_usage "$path")

    if ! is_uint "${pct:-}"; then
        echo "UNKNOWN: $path: could not parse usage from df output"
        [ "$worst" -lt 3 ] && worst=3
        continue
    fi

    if [ "$pct" -ge "$critical" ]; then
        echo "CRITICAL: $path ($mount) is ${pct}% full (>= ${critical}%)"
        [ "$worst" -lt 2 ] && worst=2
    elif [ "$pct" -ge "$warn" ]; then
        echo "WARNING: $path ($mount) is ${pct}% full (>= ${warn}%)"
        [ "$worst" -lt 1 ] && worst=1
    else
        echo "OK: $path ($mount) is ${pct}% full"
    fi
done

exit "$worst"
