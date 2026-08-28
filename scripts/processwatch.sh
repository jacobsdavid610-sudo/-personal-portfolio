#!/usr/bin/env bash
# Check whether a process is alive, either by PID (or PID file) or by a
# best-effort name/command pattern match; optionally run a restart command
# if it isn't. A single check, not a daemon loop - meant to be run from
# cron or a monitoring job. No dependencies beyond coreutils/kill.
set -uo pipefail

usage() {
    echo "Usage: $(basename "$0") --pid PID_OR_FILE [--restart-cmd \"CMD\"]" >&2
    echo "       $(basename "$0") --pattern PATTERN [--restart-cmd \"CMD\"]" >&2
    exit 2
}

pid_arg=""
pattern=""
restart_cmd=""

while [ $# -gt 0 ]; do
    case "$1" in
        --pid)
            pid_arg="$2"
            shift 2
            ;;
        --pattern)
            pattern="$2"
            shift 2
            ;;
        --restart-cmd)
            restart_cmd="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            usage
            ;;
    esac
done

if [ -n "$pid_arg" ] && [ -n "$pattern" ]; then
    usage
fi
if [ -z "$pid_arg" ] && [ -z "$pattern" ]; then
    usage
fi

resolved_pid=""

# Re-reads $pid_arg (which may be a pidfile whose content changes across a
# restart) into $resolved_pid. Called fresh before every liveness check,
# not cached once - a restart-cmd rewriting the pidfile must be picked up.
resolve_pid() {
    if [ -f "$pid_arg" ]; then
        resolved_pid="$(cat "$pid_arg" 2>/dev/null | tr -d '[:space:]')"
    else
        resolved_pid="$pid_arg"
    fi
}

is_alive() {
    if [ -n "$pid_arg" ]; then
        resolve_pid
        case "$resolved_pid" in
            ''|*[!0-9]*) return 1 ;;
        esac
        kill -0 "$resolved_pid" 2>/dev/null
        return $?
    fi

    # Pattern mode is best-effort: what a process listing exposes for
    # "the command line" varies by platform (some show full argv, some -
    # like Cygwin/MSYS ps -W - only the executable path), so this can
    # only reliably confirm "an interpreter with this name is running,"
    # not "this specific script is running." Prefer --pid where possible.
    if command -v pgrep > /dev/null 2>&1; then
        [ "$(pgrep -f -- "$pattern" 2>/dev/null | wc -l)" -gt 0 ]
        return $?
    elif ps -eo args > /dev/null 2>&1; then
        ps -eo args 2>/dev/null | grep -v grep | grep -i -q -- "$pattern"
        return $?
    else
        ps -W 2>/dev/null | tail -n +2 | grep -v grep | grep -i -q -- "$pattern"
        return $?
    fi
}

label() {
    if [ -n "$pid_arg" ]; then
        if [ -n "$resolved_pid" ] && [ "$resolved_pid" != "$pid_arg" ]; then
            echo "pid $resolved_pid (from $pid_arg)"
        else
            echo "pid $resolved_pid"
        fi
    else
        echo "pattern '$pattern'"
    fi
}

if is_alive; then
    echo "RUNNING: $(label)"
    exit 0
fi

echo "NOT RUNNING: $(label)"

if [ -z "$restart_cmd" ]; then
    exit 1
fi

echo "Restarting: $restart_cmd"
eval "$restart_cmd" > /dev/null 2>&1 &
disown 2> /dev/null || true

for _ in 1 2 3 4 5; do
    sleep 1
    if is_alive; then
        echo "RESTARTED: $(label) is now running"
        exit 0
    fi
done

echo "RESTART FAILED: $(label) still not running after running restart-cmd" >&2
exit 1
