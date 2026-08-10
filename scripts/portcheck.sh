#!/usr/bin/env bash
# Check whether a TCP host:port is accepting connections, using bash's
# built-in /dev/tcp - no nc/curl dependency. Optionally wait/retry until
# it's up (useful as a "wait for service to be ready" step).
set -uo pipefail

usage() {
    echo "Usage: $(basename "$0") <host> <port> [--timeout SECONDS] [--wait SECONDS] [--interval SECONDS]" >&2
    exit 2
}

host=""
port=""
timeout=3
wait_seconds=0
interval=1

while [ $# -gt 0 ]; do
    case "$1" in
        --timeout)
            timeout="$2"
            shift 2
            ;;
        --wait)
            wait_seconds="$2"
            shift 2
            ;;
        --interval)
            interval="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            if [ -z "$host" ]; then
                host="$1"
            elif [ -z "$port" ]; then
                port="$1"
            else
                usage
            fi
            shift
            ;;
    esac
done

[ -n "$host" ] && [ -n "$port" ] || usage

is_open() {
    timeout "$timeout" bash -c "exec 3<>/dev/tcp/$host/$port" 2>/dev/null
}

elapsed=0
while true; do
    if is_open; then
        echo "OPEN: $host:$port"
        exit 0
    fi

    if [ "$elapsed" -ge "$wait_seconds" ]; then
        echo "CLOSED: $host:$port (gave up after ${elapsed}s)" >&2
        exit 1
    fi

    sleep "$interval"
    elapsed=$((elapsed + interval))
done
