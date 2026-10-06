# runlock.sh

Runs a command while holding a lock, so overlapping runs can't stack
up — the classic case being a cron job that sometimes takes longer than
its own interval. A portable stand-in for `flock(1)`, which isn't
available on macOS or Git Bash. No dependencies beyond bash and
coreutils.

## Why

`*/5 * * * * backup.sh` is fine until one run takes seven minutes, and
then two copies are writing the same files at once. `flock -n` is the
usual answer on Linux, but it's util-linux only. `mkdir` is atomic on
every filesystem that matters, so a directory makes a lock that works
anywhere bash does.

## CLI usage

```
runlock.sh [--lock PATH] [--wait SECONDS] -- <command> [args...]
```

- `--lock PATH` — lock directory. Default:
  `${TMPDIR:-/tmp}/runlock-<command basename>.lock`.
- `--wait SECONDS` — keep retrying for up to this long if the lock is
  held (default `0`: fail immediately).
- `RUNLOCK_POLL_INTERVAL` — seconds between retries while waiting
  (default `0.2`).

Typical crontab line:

```
*/5 * * * * /path/to/runlock.sh --lock /var/lock/backup.lock -- /path/to/backup.sh
```

## Real example

```
$ runlock.sh --lock /tmp/demo.lock -- sleep 2 &
$ runlock.sh --lock /tmp/demo.lock -- echo second
runlock: /tmp/demo.lock is held by pid 1390, giving up
$ echo $?
75
$ runlock.sh --lock /tmp/demo.lock --wait 5 -- echo "second, after waiting"
second, after waiting
```

## Design notes

- **The lock is a directory, the holder's pid lives inside it.**
  `mkdir` either creates the path or fails, atomically, so exactly one
  process wins. The pid file is what makes stale-lock recovery
  possible.
- **Stale locks are recovered, carefully.** If the holder died without
  cleaning up (`kill -9`, OOM, reboot), `kill -0 <pid>` fails and the
  lock is treated as stale. The stale directory is `mv`'d to a unique
  name before being deleted, so two processes recovering at once can't
  both `rm` the same path, and each retries `mkdir` exactly once
  afterwards — only one of them gets it.
- **A lock dir with no pid file counts as held, not stale.** That's
  the brief moment between another process's `mkdir` and its pid
  write. Treating it as stale would let two processes in.
- **Release only removes the lock if the pid inside is still ours.**
  If a lock somehow changed hands, exiting doesn't delete someone
  else's.
- **The command runs in the foreground, not `&` + `wait`.** A
  backgrounded command in a non-interactive shell gets `/dev/null` as
  stdin, which would quietly break `something | runlock.sh -- cmd`.
  Bash defers the `INT`/`TERM` traps until the foreground command
  finishes, which is the right behaviour here: the lock stays held for
  exactly as long as the command is still running, then the `EXIT`
  trap releases it.
- **Known limits, on purpose:** pid reuse can make a stale lock look
  held (it'll just refuse to run until cleared by hand); a `kill -9`
  of runlock itself leaves the child running while the lock looks
  stale; pids aren't meaningful across machines, so don't put the lock
  on a shared NFS mount. `flock` avoids all three, so use it where it
  exists.

## Exit codes

The command's own exit code if it ran; `75` (`EX_TEMPFAIL` from
`sysexits.h`) if the lock was held and `--wait` ran out; `130`/`143`
if interrupted by `INT`/`TERM`; `2` on a usage error.

## Running the tests

```
bash tests/test_runlock.sh
```

23 assertions: output, arguments with spaces and exit codes passing
through; the lock being released after both success and failure; stdin
reaching the command; a second run being refused with `75` while the
first holds the lock (and never running its command); `--wait`
acquiring once the holder finishes and giving up on time when it
doesn't; a lock left by a dead pid being recovered and reported, with
no leftover `.stale` dirs; a pid-less lock dir being treated as held
and not deleted; release leaving someone else's lock alone; `SIGTERM`
exiting `143` and still releasing the lock; the default lock path
coming from the command name; and three usage errors. All passing (the
suite takes ~25s on Git Bash because of the deliberate sleeps and slow
process startup there).
