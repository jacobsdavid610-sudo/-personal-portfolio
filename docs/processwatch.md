# processwatch.sh

Checks whether a process is alive — by PID (or a PID file), or by a
best-effort name/command pattern — and optionally runs a restart command
if it isn't. A single check meant to be run from cron or a monitoring
job, not a daemon loop.

## Why

The classic "is the thing still running, and if not, bring it back"
supervisor script, without reaching for systemd/pm2/supervisord when all
you actually need is a cron entry. Complements
[sslcheck.sh](sslcheck.md) and [envcheck.sh](envcheck.md) as another
small, cron-friendly health check with a clean exit code.

## Usage

```
processwatch.sh --pid PID_OR_FILE [--restart-cmd "CMD"]
processwatch.sh --pattern PATTERN [--restart-cmd "CMD"]
```

- `--pid` — a literal PID, or a path to a file containing one (a pidfile,
  re-read fresh on every check — see design notes on why that matters for
  `--restart-cmd`).
- `--pattern` — a name/command substring to look for among running
  processes. **Best-effort** — see the platform-dependent caveat below.
- `--restart-cmd` — if the target isn't running, run this command (in the
  background) and re-check up to 5 times, 1 second apart, before giving up.

## Example

```
$ processwatch.sh --pid /var/run/myapp.pid
RUNNING: pid 4821 (from /var/run/myapp.pid)

$ processwatch.sh --pid /var/run/myapp.pid --restart-cmd "myapp --daemonize --pidfile /var/run/myapp.pid"
NOT RUNNING: pid 4821 (from /var/run/myapp.pid)
Restarting: myapp --daemonize --pidfile /var/run/myapp.pid
RESTARTED: pid 5102 (from /var/run/myapp.pid) is now running
```

## Exit codes

- `0` — the target is (or, after `--restart-cmd`, is now) running.
- `1` — not running, and either no `--restart-cmd` was given, or the
  restart was attempted but the target still isn't alive after 5 seconds.
- `2` — usage error: neither `--pid` nor `--pattern` given, or both given
  together.

## Design notes

- **`--pattern` matching is genuinely platform-dependent, not just in
  theory.** This was discovered directly while building the script: this
  environment's `ps -W` (the Cygwin/MSYS fallback used when neither
  `pgrep` nor a POSIX `ps -eo` is available) only exposes the executable
  *path* in its COMMAND column — never the actual arguments a script was
  launched with. So on a platform limited to that fallback, `--pattern
  myscript.sh` can never match; only `--pattern bash` (the interpreter
  itself) can. `--pid`/`--pid-file` has no such ambiguity anywhere, which
  is why it's the primary, recommended mode and `--pattern` is documented
  as best-effort rather than promised to work identically everywhere.
- **The pidfile is re-read on every liveness check, not cached once at
  startup.** This mattered for a real reason: a `--restart-cmd` that
  launches a new process and rewrites the pidfile (the standard daemon
  pattern - `sleep 5 & echo $! > pidfile`) needs the *next* check in the
  retry loop to pick up that new PID, not keep checking the stale one
  from before the restart. An earlier version of this script cached the
  resolved PID once and the restart-confirmation step always failed as a
  result, even when the restart genuinely worked - caught via smoke
  testing against a real pidfile-rewriting restart command before the
  test suite was written around the fix.
- `kill -0 PID` (signal 0: no signal actually sent, just a permission/
  existence check) is the liveness check — portable across every
  Unix-like `kill` including this platform's, unlike process-listing
  tools which vary in what they expose.

## Running the tests

```
bash tests/test_processwatch.sh
```

16 tests against real backgrounded processes and real PIDs (never
mocked): a live PID reported RUNNING, a pidfile correctly resolving to
that same real PID, the same PID reported NOT RUNNING once actually
killed, a non-numeric pidfile treated as not-running rather than crashing,
the full restart path against a real pidfile-rewriting restart command
(confirming the new PID is picked up, not the stale one), an unmatched
`--pattern` reported not running, and rejection of no arguments and of
`--pid`+`--pattern` given together.
