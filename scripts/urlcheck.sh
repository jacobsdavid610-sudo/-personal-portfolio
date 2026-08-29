#!/usr/bin/env bash
# Check a URL's HTTP status code and response time via curl, and report
# OK/WARN/FAIL against an expected status and a latency threshold. A
# single check, meant for cron/monitoring use. Wraps curl; no other
# dependencies.
set -uo pipefail

usage() {
    echo "Usage: $(basename "$0") <url> [--expect-status N] [--max-ms N] [--timeout SECONDS]" >&2
    exit 2
}

url=""
expect_status=200
max_ms=0
timeout=10

while [ $# -gt 0 ]; do
    case "$1" in
        --expect-status)
            expect_status="$2"
            shift 2
            ;;
        --max-ms)
            max_ms="$2"
            shift 2
            ;;
        --timeout)
            timeout="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            if [ -z "$url" ]; then
                url="$1"
                shift
            else
                usage
            fi
            ;;
    esac
done

[ -n "$url" ] || usage
case "$expect_status" in ''|*[!0-9]*) echo "--expect-status must be a non-negative integer" >&2; exit 2 ;; esac
case "$max_ms" in ''|*[!0-9]*) echo "--max-ms must be a non-negative integer" >&2; exit 2 ;; esac
case "$timeout" in ''|*[!0-9]*) echo "--timeout must be a non-negative integer" >&2; exit 2 ;; esac

result="$(curl -s -o /dev/null -w '%{http_code} %{time_total}' --max-time "$timeout" -- "$url" 2> /dev/null)"
rc=$?

if [ "$rc" -ne 0 ] || [ -z "$result" ]; then
    echo "FAIL: could not connect to $url (curl exit $rc)"
    exit 2
fi

status="${result%% *}"
time_total="${result#* }"
# curl's %{time_total} is seconds with a decimal point (e.g. "0.184203");
# convert to whole milliseconds without relying on bc/awk floating point.
ms="$(echo "$time_total" | sed 's/\.//' | sed 's/^0*//')"
ms="${ms:-0}"
# time_total has 6 decimal digits (microsecond precision), so the
# de-decimaled integer is in microseconds - scale down to milliseconds.
ms=$((ms / 1000))

if [ "$status" != "$expect_status" ]; then
    echo "FAIL: $url returned $status, expected $expect_status (${ms}ms)"
    exit 1
fi

if [ "$max_ms" -gt 0 ] && [ "$ms" -gt "$max_ms" ]; then
    echo "WARN: $url returned $status in ${ms}ms, over the ${max_ms}ms threshold"
    exit 1
fi

echo "OK: $url returned $status in ${ms}ms"
exit 0
