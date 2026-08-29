# urlcheck.sh

Checks a URL's HTTP status code and response time via `curl`, reporting
OK/WARN/FAIL against an expected status and an optional latency
threshold. A single check, meant for cron/monitoring use.

## Why

Different layer than [portcheck.sh](portcheck.md) (raw TCP: is the port
open at all) and [sslcheck.sh](sslcheck.md) (TLS cert expiry only) — this
checks the actual HTTP-level answer: did the app respond with the status
you expect, and how fast. A working TCP connection and a valid cert don't
guarantee the app behind them is actually healthy; this does.

## Usage

```
urlcheck.sh <url> [--expect-status N] [--max-ms N] [--timeout SECONDS]
```

- `--expect-status` — the HTTP status code that counts as correct
  (default: `200`).
- `--max-ms` — fail with WARN if the response took longer than this many
  milliseconds. `0` (the default) disables the latency check entirely.
- `--timeout` — how long to wait for the whole request before giving up
  (default: `10` seconds).

## Example

```
$ urlcheck.sh https://example.com
OK: https://example.com returned 200 in 502ms

$ urlcheck.sh https://example.com --expect-status 404
FAIL: https://example.com returned 200, expected 404 (534ms)

$ urlcheck.sh https://example.com --max-ms 100
WARN: https://example.com returned 200 in 502ms, over the 100ms threshold

$ urlcheck.sh https://a-domain-that-does-not-resolve.example
FAIL: could not connect to https://a-domain-that-does-not-resolve.example (curl exit 6)
```

## Exit codes

- `0` — OK: expected status matched, and (if `--max-ms` was set) within
  the latency threshold.
- `1` — a "soft" failure: wrong status code, or over the latency
  threshold. The response was received; it just wasn't what you wanted.
- `2` — a "hard" failure: couldn't connect at all (DNS failure, timeout,
  refused connection — curl's own exit code, or a usage error).

## Design notes

- Status mismatch and latency-over-threshold are both exit `1` (not split
  further) since either one means "something needs attention," while an
  outright connection failure is a distinct exit `2` — the difference
  between "the server answered, just not how you wanted" and "there's no
  server to answer at all" is worth keeping visible in a monitoring
  script's exit code.
- `curl -w '%{http_code} %{time_total}'` is parsed without `bc` or `awk`
  floating-point math: `time_total` comes back as seconds with exactly 6
  decimal digits (curl's fixed format, e.g. `0.502134`), so removing the
  decimal point and dividing the resulting integer by 1000 gives whole
  milliseconds using only integer shell arithmetic.
- `-o /dev/null` discards the response body — this tool checks status and
  timing only, never inspects content, keeping it fast and safe to point
  at large responses.

## Running the tests

```
bash tests/test_urlcheck.sh
```

17 tests against real live HTTP requests to `example.com` (IANA-reserved
specifically for this kind of documentation/testing use, so it's a stable
target): a 200 response reporting OK, a genuine 404 path correctly
matching an `--expect-status 404` check, a status mismatch reporting FAIL
with the right exit code, an impossibly tight 1ms latency threshold
reliably triggering WARN against a real network round trip, a generous
threshold not triggering it, an unreachable host reporting the hard
connection-failure exit code, and rejection of a missing URL and
non-numeric `--expect-status`/`--max-ms`. Skips cleanly (exit 0, no
failures) if there's no network access to test against, rather than
failing the whole suite over an external dependency.
