# portcheck.sh

Checks whether a TCP `host:port` is accepting connections, using bash's
built-in `/dev/tcp` pseudo-device — no `nc`/`curl`/`telnet` dependency.
Optionally waits and retries until the port comes up, which is the classic
"block until my dependency is ready" step in a startup script or CI job.

## Usage

```
portcheck.sh <host> <port> [--timeout SECONDS] [--wait SECONDS] [--interval SECONDS]
```

- `--timeout` — max seconds to wait for a single connection attempt
  (default `3`).
- `--wait` — total seconds to keep retrying before giving up (default `0`,
  meaning: try once, report immediately).
- `--interval` — seconds to sleep between retries (default `1`).

Exit code `0` if the port is open, `1` if it's still closed once `--wait`
is exhausted, `2` on a usage error (missing host/port).

## Real examples

Against an actual `python -m http.server` listening on `127.0.0.1:18500`:

```
$ portcheck.sh 127.0.0.1 18500
OPEN: 127.0.0.1:18500
```

Against a port nothing is listening on, with retries:

```
$ portcheck.sh 127.0.0.1 18501 --timeout 1 --wait 3 --interval 1
CLOSED: 127.0.0.1:18501 (gave up after 3s)
```

## A real observation from testing, not just theory

Timing the `--wait 3 --interval 1` run above with `time` on this machine
(Windows + Git Bash) showed ~9 real seconds elapsed, not ~3-4. The retry
*logic* is correct — each `is_open` check plus the interval sleep adds up to
roughly the expected total — but spawning `timeout` and a fresh `bash -c`
subshell for every single connection attempt has real, measurable process-
spawn overhead in this environment. Worth knowing if you're using this in a
tight retry loop with a small `--interval`: the floor on how fast it can
retry is set by process-spawn cost here, not by the sleep duration.

## Why `/dev/tcp` instead of `nc`

`nc` isn't installed everywhere (it wasn't on this machine), and its flags
differ across `nc` implementations (BSD vs. GNU vs. ncat) in ways that bite
people writing "portable" shell scripts. `/dev/tcp/HOST/PORT` is a bash
builtin feature (not a real file) available in any reasonably modern bash,
so `exec 3<>/dev/tcp/$host/$port` either connects or fails with no extra
binary required.

## Running the tests

```
bash tests/test_portcheck.sh
```

Starts a real `python -m http.server` on a scratch port as the "open port"
fixture and uses an adjacent unused port as the "closed port" fixture - no
mocked sockets. Covers: open port detected immediately, closed port fails
immediately by default, `--wait` actually retries for roughly the requested
duration before giving up, and a missing required argument being a usage
error. 7/7 passing.
