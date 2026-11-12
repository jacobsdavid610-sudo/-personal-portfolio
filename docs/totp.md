# totp.py

Generates and verifies one-time passwords: HOTP (RFC 4226) and TOTP
(RFC 6238), the six-digit codes that authenticator apps show. It reads the
secret (base32, or the `otpauth://` URI from a QR code) from stdin or an
environment variable, never from the command line. Pure stdlib.

## Why

Scripts that log in to something protected by two-factor auth need the
current code: a deploy that talks to a registry, a test of a login flow, a
service account. It's also the quickest way to understand what an
authenticator app actually does: an HMAC of a counter, four bytes picked out
of it, and a remainder. I wanted it small enough to read in one sitting and
checked against every test value in both RFCs.

## API

```python
from totp import decode_secret, hotp, totp, verify, parse_uri, seconds_left

key = decode_secret("GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ")  # bytes
hotp(key, 0)                           # "755224"
totp(key, at=59, digits=8)             # "94287082"
totp(key)                              # the code right now
seconds_left(period=30)                # until it changes

verify(key, "287082", at=59)           # 0 (this step), -1/+1 for neighbours, None if wrong

parse_uri("otpauth://totp/Example:alice?secret=GEZD...&digits=8")
# {"type": "totp", "label": "Example:alice", "issuer": None, "key": b"...",
#  "digits": 8, "algorithm": "sha1", "period": 30, "counter": None}
```

- `hotp(key, counter, digits=6, algorithm="sha1")`. `digits` is 6 to 10;
  `algorithm` is `sha1`, `sha256` or `sha512`.
- `totp(key, at=None, period=30, digits=6, algorithm="sha1", t0=0)` and
  `time_step(at, period, t0)`.
- `verify(..., window=1)` accepts codes from `window` steps either side to
  allow for clock drift, and returns which step matched.
- Bad input raises `ValueError`.

## CLI usage

```
totp.py [-e NAME] [-d DIGITS] [-p PERIOD] [-a ALG] [--at UNIX_TIME]
        [--counter N] [--verify CODE] [-w WINDOW] [-v]

  (secret)        first line of stdin: base32 or an otpauth:// URI
  -e NAME         read the secret from environment variable NAME instead
  -d / -p / -a    digits, period, algorithm (default 6 / 30 / sha1, or the URI's)
  --at T          use Unix time T instead of now
  --counter N     HOTP with counter N instead of the time
  --verify CODE   check CODE instead of printing one
  -w WINDOW       steps either side accepted by --verify (default 1)
  -v              also print the seconds left
```

## Real example

These use the secret from the RFCs' own test vectors (`12345678901234567890`
in ASCII, `GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ` in base32), never a real one.

```
$ echo GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ | python scripts/totp.py --at 1234567890 -d 8
89005924
$ echo GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ | python scripts/totp.py --at 1234567880 -v
980357 (10s left)
$ echo GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ | python scripts/totp.py --at 1234567900 --verify 005924
valid (step +0)
$ echo 'otpauth://totp/Example:alice%40example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Example&digits=8' \
    | python scripts/totp.py --at 59
94287082
$ OTP_SECRET=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ python scripts/totp.py -e OTP_SECRET --counter 0
755224
$ echo 'otpauth://totp/x?secret=GEZDGNBVGY3TQOJQ&digits=12' | python scripts/totp.py
totp: digits must be 6 to 10
```

`89005924` and `94287082` are the RFC 6238 values for those times, and
`755224` is RFC 4226's value for counter 0.

## Exit codes

- `0` - printed a code, or `--verify` matched.
- `1` - `--verify` didn't match.
- `2` - usage error, or a bad secret, URI or setting.

## Design notes

- **The secret never goes on the command line.** Arguments show up in `ps`
  and in shell history, so the secret comes from stdin or from an
  environment variable named by `-e`. Passing it as an argument is a usage
  error, and error messages never include it.
- **Dynamic truncation, as specified.** The last nibble of the HMAC picks
  the offset of four bytes, and the top bit is masked off so the number is
  the same whether it's read as signed or unsigned. The offset comes from
  the *last* byte, not byte 19, which matters for SHA-256 and SHA-512.
- **Codes are strings, zero-padded.** `"0137359152"` is a valid 10-digit
  code. As an integer it would lose its leading zero.
- **Verification is constant-time and checks every step.**
  `hmac.compare_digest` is used, and every step in the window is compared
  even after a match, so the time taken doesn't reveal which step was
  close. Malformed codes (wrong length, non-ASCII digits such as `٩٤٢`)
  are simply wrong, not an exception. The window never goes below step 0.
- **Secrets as people type them.** Base32 in any case, with spaces or
  hyphens, with or without `=` padding. Impossible lengths (1, 3 or 6
  characters past a multiple of 8) are reported as such.
- **`otpauth://` URIs** are parsed strictly. A repeated parameter, a
  non-numeric `digits`, or an `hotp` URI without a `counter` is an error.
  Command-line flags override what the URI says.
- **Strict about types.** `True` is not a counter and `6.0` is not a digit
  count, even though Python would happily do arithmetic with both.

## Running the tests

```
python -m unittest tests/test_totp.py
```

37 tests, including all 10 HOTP values from RFC 4226 appendix D and all 18
TOTP values from RFC 6238 appendix B (SHA-1, SHA-256, SHA-512, out to the
year 2603). The test vectors were taken from the RFC text. The other tests
cover zero padding, digit and counter limits, time steps and `t0`,
verification windows (including clock drift and step 0), malformed codes,
constant-time comparison of every step, secret clean-up, `otpauth://`
parsing, and the CLI, including stdin, environment variables, overrides and
exit codes.
