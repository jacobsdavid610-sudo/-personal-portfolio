# backoff.js

Exponential backoff with jitter: work out how long to wait before a retry,
run an async function with retries, or print the schedule a set of
parameters produces. The random source and the sleep are injectable, so it
tests without waiting. No dependencies. For the shell equivalent see
`retry.sh`.

## Why

Retrying a failed request straight away usually hits the same overloaded
service again. Waiting longer each time helps, but if a thousand clients all
back off by the same amounts they all come back at the same moment. Jitter
spreads them out. I wanted the delay calculation separate from the retry
loop so I can test it exactly, and a way to see what a set of parameters
means in real seconds before putting it in config.

## API

```js
const { delay, retry, schedule } = require("./scripts/backoff.js");

delay(0, { jitter: "none" });          // 100
delay(3, { jitter: "none" });          // 800
delay(3);                              // random 0..800 (full jitter)

const data = await retry((attempt) => fetchJson(url), {
  retries: 5,                          // up to 6 calls in all
  base: 200, factor: 2, max: 10000,    // ms
  jitter: "equal",                     // "none" | "full" | "equal"
  shouldRetry: (err) => err.status !== 400,
  onRetry: (err, attempt, ms) => console.warn(`retry ${attempt + 1} in ${ms} ms`),
  signal: controller.signal,           // abort to stop waiting
});

schedule(4);   // [{ attempt: 0, delay: 100, total: 100 }, ...]
```

- `delay(attempt, { base = 100, factor = 2, max = 30000, jitter = "full", random })`
  - `attempt` 0 is the wait after the first failure. The un-jittered delay
  is `base * factor^attempt`, capped at `max`. `none` is that value, `full`
  is uniform in `[0, value]`, `equal` is half of it plus uniform in the other
  half.
- `retry(fn, options)` calls `fn(attempt)`, retrying if it throws or
  rejects, and rethrows the last error.
- `schedule(count, options)` is the worst case (no jitter) with running
  totals.

## CLI usage

```
backoff.js [-n RETRIES] [-b BASE_MS] [-f FACTOR] [-m MAX_MS] [-j none|full|equal]
```

## Real example

```
$ node scripts/backoff.js -n 6 -b 500 -m 5000
jitter full: each wait is random between 0 and the figure shown
retry 1: up to 500 ms (total up to 500 ms)
retry 2: up to 1000 ms (total up to 1500 ms)
retry 3: up to 2000 ms (total up to 3500 ms)
retry 4: up to 4000 ms (total up to 7500 ms)
retry 5: up to 5000 ms (total up to 12500 ms)
retry 6: up to 5000 ms (total up to 17500 ms)
```

That is the answer to "how long before it gives up": at most 17.5 seconds
of waiting, on top of the time the calls themselves take.

## Exit codes

- `0` - success.
- `1` - an invalid value (factor below 1, unknown jitter, retries not a whole
  number from 0 to 1000, negative base or max).
- `2` - usage error (unknown option, missing or non-numeric value).

## Design notes

- **Full jitter is the default.** Spreading each wait over `[0, cap]` is the
  setting that best breaks up a crowd of clients retrying in step. `equal`
  keeps a guaranteed minimum wait; `none` is for tests and for working out
  worst cases.
- **Jitter is applied after the cap.** Otherwise a long run of retries
  would keep clustering just under `max`.
- **Large attempt numbers are safe.** `factor ** attempt` overflows to
  `Infinity` quickly, and `Math.min(max, Infinity)` is just `max`, so no
  special case.
- **Always whole milliseconds**, and `random()` outside `[0, 1)` is an error
  rather than a silently wrong delay.
- **Options are checked up front.** A bad `base`, `factor`, `max` or
  `jitter` throws a `RangeError` instead of producing `NaN` waits. In
  `retry` that happens at the first failure (when the delay is first
  computed), so a bad option never wastes a successful call.
- **The original error is rethrown**, not wrapped, so callers can still test
  `err.code` or `err instanceof`. `shouldRetry` lets non-transient failures
  (a 400, a validation error) stop at once.
- **Abort is respected while waiting**, not just between attempts. An abort
  clears the timer and rejects with the signal's reason, so a cancelled
  operation does not sit out a 30 second wait.
- **A synchronous throw is retried too**, not only a rejected promise.
- **The CLI limits retries to 1000** so a typo cannot ask it to print a
  billion lines.

## Running the tests

```
node --test tests/test_backoff.js
```

37 tests: the schedule for every parameter, the cap and overflow, each kind
of jitter at its extremes, whole-number results, validation of every option
and of `random()`, `retry` (first-try success, attempt numbers, the waits,
rethrowing the last error and the same error object, `retries: 0`,
synchronous throws, `shouldRetry`, `onRetry`, jitter options, the cap, bad
options, abort before and during a wait, the real default sleep) and the CLI
including exit codes.
