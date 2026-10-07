#!/usr/bin/env bash
# Run a command while holding a lock, so overlapping runs (e.g. a cron
# job that sometimes takes longer than its interval) can't stack up.
# Portable alternative to flock(1), which isn't on macOS or Git Bash:
# the lock is a directory, because mkdir is atomic everywhere.
#
# Usage: runlock.sh [--lock PATH] [--wait SECONDS] -- <command> [args...]
#
# Exit codes: the command's own exit code if it ran, 75 (EX_TEMPFAIL)
# if the lock was held and --wait ran out, 2 on a usage error.
set -uo pipefail

lock=""
wait_secs=0
poll_interval="${RUNLOCK_POLL_INTERVAL:-0.2}"

usage() {
    echo "Usage: $(basename "$0") [--lock PATH] [--wait SECONDS] -- <command> [args...]" >&2
    exit 2
}

while [ $# -gt 0 ]; do
    case "$1" in
        --lock)
            [ $# -ge 2 ] || usage
            lock="$2"
            shift 2
            ;;
        --wait)
            [ $# -ge 2 ] || usage
            wait_secs="$2"
            shift 2
            ;;
        --)
            shift
            break
            ;;
        -*)
            echo "Unknown option: $1" >&2
            usage
            ;;
        *)
            break
            ;;
    esac
done

[ $# -gt 0 ] || usage
if ! [[ "$wait_secs" =~ ^[0-9]+$ ]]; then
    echo "--wait must be a whole number of seconds, got '$wait_secs'" >&2
    exit 2
fi

if [ -z "$lock" ]; then
    lock="${TMPDIR:-/tmp}/runlock-$(basename "$1").lock"
fi

# Returns 0 if we created the lock, 1 if someone else holds it.
try_acquire() {
    if mkdir "$lock" 2>/dev/null; then
        echo "$$" > "$lock/pid"
        return 0
    fi

    local holder
    holder="$(cat "$lock/pid" 2>/dev/null || true)"
    # No pid file yet means the holder is between its mkdir and its
    # write - treat it as held, not stale.
    [ -n "$holder" ] || return 1
    if kill -0 "$holder" 2>/dev/null; then
        return 1
    fi

    # Holder is gone without cleaning up (kill -9, reboot, OOM). Move
    # the stale dir aside atomically before deleting it, so two
    # processes recovering at once can't both rm the same path, then
    # retry the mkdir exactly once.
    local graveyard="$lock.stale.$$"
    if mv "$lock" "$graveyard" 2>/dev/null; then
        echo "runlock: removed stale lock held by dead pid $holder" >&2
        rm -rf "$graveyard"
    fi
    if mkdir "$lock" 2>/dev/null; then
        echo "$$" > "$lock/pid"
        return 0
    fi
    return 1
}

release() {
    # Only remove the lock if it's still ours.
    if [ "$(cat "$lock/pid" 2>/dev/null)" = "$$" ]; then
        rm -rf "$lock"
    fi
}

deadline=$((SECONDS + wait_secs))
until try_acquire; do
    if [ "$SECONDS" -ge "$deadline" ]; then
        holder="$(cat "$lock/pid" 2>/dev/null || echo '?')"
        echo "runlock: $lock is held by pid $holder, giving up" >&2
        exit 75
    fi
    sleep "$poll_interval"
done

trap release EXIT
# Turn signals into a normal exit so the EXIT trap runs. Bash defers
# these until the foreground command finishes, which is what we want:
# the lock stays held for exactly as long as the command is running.
trap 'exit 130' INT
trap 'exit 143' TERM

# Run in the foreground (not `&` + wait) so the command keeps its stdin.
"$@"
exit $?
