# sslcheck.sh

Reports how many days remain before a TLS certificate expires — a live
`host:port`, or a local cert file — and exits with a status that reflects
severity, so it's usable directly as a monitoring check.

## Why

Expired TLS certs are one of the most common self-inflicted outages
("the site went down at 3am because nobody renewed the cert"). This is the
kind of check that belongs in a cron job or a monitoring script: cheap,
dependency-free (just `openssl` and coreutils), and exits non-zero exactly
when something needs attention.

## Usage

```
sslcheck.sh <host[:port]> [--warn-days N]
sslcheck.sh --file <cert.pem> [--warn-days N]
```

- `host[:port]` — checks the live certificate served by that host.
  Port defaults to `443` if omitted.
- `--file cert.pem` — checks a local certificate file instead of
  connecting anywhere.
- `--warn-days N` — how many days out counts as "warn" (default: 14).

## Example

```
$ sslcheck.sh github.com
OK: github.com expires in 37 day(s) (Sep 30 23:59:59 2026 GMT)

$ sslcheck.sh --file near-expiry.pem
WARN: near-expiry.pem expires in 4 day(s) (Aug 29 07:29:33 2026 GMT)

$ sslcheck.sh --file lapsed.pem
EXPIRED: lapsed.pem expired 2427 day(s) ago (Jan  1 00:00:00 2020 GMT)
```

## Exit codes

- `0` — OK: expires after the `--warn-days` window.
- `1` — WARN: expires within the `--warn-days` window but hasn't lapsed yet.
- `2` — EXPIRED, or a hard failure: usage error, missing/unreadable file,
  couldn't connect or retrieve a certificate, or couldn't parse the
  expiry date. (Distinguishing "already expired" from other exit-2 cases
  is done by reading the message, not the exit code — both need immediate
  attention either way.)

## Design notes

- Live-host mode is `openssl s_client -connect host:port -servername host
  </dev/null | openssl x509 -noout -enddate` — `-servername` matters for
  any host relying on SNI to pick the right certificate (most hosts,
  today), and `-days 400`-style short-lived leaf certs are exactly the
  case this exists to catch.
- Date parsing tries GNU `date -d` first, then falls back to BSD/macOS
  `date -j -f`, since openssl's `notAfter` format (`Mon DD HH:MM:SS YYYY
  TZ`) is one both `date` flavors can parse, just via different flags.
- A `timeout 10` wraps the live connection attempt so a host that accepts
  the TCP connection but never completes a TLS handshake can't hang the
  check indefinitely.

## Running the tests

```
bash tests/test_sslcheck.sh
```

13 tests, all against real `openssl`-generated certificates in a scratch
directory (no network access needed, so this runs the same in CI as
locally): a far-future cert reporting OK with exit 0, a ~4-day cert
reporting WARN with exit 1, the same WARN cert flipping back to OK under a
tighter `--warn-days`, a cert with an explicit past `-not_before`/
`-not_after` window reporting EXPIRED with exit 2, and rejection of a
missing cert file, both a host and `--file` given together, no arguments
at all, and a non-numeric `--warn-days`. Skips cleanly (exit 0, no
failures) if `openssl` itself isn't installed, rather than failing the
suite over a missing external tool.
