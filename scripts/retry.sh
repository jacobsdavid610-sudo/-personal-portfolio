#!/usr/bin/env bash
# Run a command, retrying with exponential backoff if it fails.
# Usage: retry.sh [--max-attempts N] [--base-delay SECONDS] -- <command> [args...]
set -uo pipefail

max_attempts=5
base_delay=1

while [ $# -gt 0 ]; do
    case "$1" in
        --max-attempts)
            max_attempts="$2"
            shift 2
            ;;
        --base-delay)
            base_delay="$2"
            shift 2
            ;;
        --)
            shift
            break
            ;;
        *)
            break
            ;;
    esac
done

if [ $# -eq 0 ]; then
    echo "Usage: $(basename "$0") [--max-attempts N] [--base-delay SECONDS] -- <command> [args...]" >&2
    exit 1
fi

case "$max_attempts" in
    ''|*[!0-9]*) echo "--max-attempts must be a positive integer, got: $max_attempts" >&2; exit 1 ;;
esac

attempt=1
delay="$base_delay"

while [ "$attempt" -le "$max_attempts" ]; do
    "$@"
    status=$?
    if [ "$status" -eq 0 ]; then
        echo "Succeeded on attempt $attempt." >&2
        exit 0
    fi

    if [ "$attempt" -eq "$max_attempts" ]; then
        echo "Attempt $attempt/$max_attempts failed (exit $status). No attempts left." >&2
        exit "$status"
    fi

    echo "Attempt $attempt/$max_attempts failed (exit $status). Retrying in ${delay}s..." >&2
    sleep "$delay"
    delay=$(awk -v d="$delay" 'BEGIN { printf "%.4f", d * 2 }')
    attempt=$((attempt + 1))
done
