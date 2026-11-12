#!/usr/bin/env python3
"""Generate and verify one-time passwords: HOTP (RFC 4226) and TOTP
(RFC 6238), the six-digit codes authenticator apps show. Takes the base32
secret or an otpauth:// URI from stdin or an environment variable, never
from the command line. Pure stdlib (hmac, hashlib, base64)."""

import argparse
import base64
import binascii
import hashlib
import hmac
import math
import os
import re
import sys
import time
from urllib.parse import parse_qs, unquote, urlsplit

ALGORITHMS = {"sha1": hashlib.sha1, "sha256": hashlib.sha256, "sha512": hashlib.sha512}
MIN_DIGITS, MAX_DIGITS = 6, 10  # RFC 4226 wants 6+; a 31-bit number has at most 10


def decode_secret(text):
    """Bytes from a base32 secret as people write it: any case, with spaces
    or hyphens between groups, padding optional."""
    if not isinstance(text, str):
        raise TypeError("secret must be a string")
    cleaned = re.sub(r"[\s-]", "", text).upper().rstrip("=")
    if not cleaned:
        raise ValueError("secret is empty")
    if len(cleaned) % 8 in (1, 3, 6):
        raise ValueError("secret has an impossible base32 length")
    try:
        return base64.b32decode(cleaned + "=" * (-len(cleaned) % 8))
    except binascii.Error:
        raise ValueError("secret is not valid base32") from None


def _check(digits, algorithm):
    if isinstance(digits, bool) or not isinstance(digits, int) or not MIN_DIGITS <= digits <= MAX_DIGITS:
        raise ValueError(f"digits must be {MIN_DIGITS} to {MAX_DIGITS}")
    if algorithm not in ALGORITHMS:
        raise ValueError(f"algorithm must be one of {', '.join(ALGORITHMS)}")


def hotp(key, counter, digits=6, algorithm="sha1"):
    """The HOTP code for `key` (bytes) at `counter`, as a zero-padded string."""
    _check(digits, algorithm)
    if isinstance(counter, bool) or not isinstance(counter, int) or not 0 <= counter < 2 ** 64:
        raise ValueError("counter must be an integer from 0 to 2**64 - 1")
    mac = hmac.new(key, counter.to_bytes(8, "big"), ALGORITHMS[algorithm]).digest()
    offset = mac[-1] & 0x0F
    number = int.from_bytes(mac[offset:offset + 4], "big") & 0x7FFFFFFF
    return str(number % 10 ** digits).zfill(digits)


def time_step(at=None, period=30, t0=0):
    """The TOTP counter for Unix time `at` (default: now)."""
    if isinstance(period, bool) or not isinstance(period, int) or period < 1:
        raise ValueError("period must be a positive whole number of seconds")
    at = time.time() if at is None else at
    if at < t0:
        raise ValueError("time is before t0")
    return int((at - t0) // period)


def totp(key, at=None, period=30, digits=6, algorithm="sha1", t0=0):
    """The TOTP code for `key` at Unix time `at` (default: now)."""
    return hotp(key, time_step(at, period, t0), digits, algorithm)


def seconds_left(at=None, period=30, t0=0):
    """Seconds until the code shown at `at` changes."""
    at = time.time() if at is None else at
    return math.ceil(period - (at - t0) % period)


def verify(key, code, at=None, period=30, digits=6, algorithm="sha1", t0=0, window=1):
    """The step offset (-window..window) whose code matches `code`, or None.

    Spaces in `code` are ignored. Every candidate is compared, in constant
    time, so how long this takes doesn't say which step was close."""
    if isinstance(window, bool) or not isinstance(window, int) or window < 0:
        raise ValueError("window must be a non-negative integer")
    code = re.sub(r"\s", "", code)
    _check(digits, algorithm)
    if len(code) != digits or not code.isascii() or not code.isdigit():
        return None
    step = time_step(at, period, t0)
    found = None
    for offset in range(-window, window + 1):
        if not 0 <= step + offset < 2 ** 64:
            continue
        if hmac.compare_digest(hotp(key, step + offset, digits, algorithm), code) and found is None:
            found = offset
    return found


def parse_uri(uri):
    """Settings from an otpauth:// URI (the text in an authenticator QR code):
    {"type", "label", "issuer", "key", "digits", "algorithm", "period", "counter"}."""
    parts = urlsplit(uri)
    if parts.scheme.lower() != "otpauth":
        raise ValueError("not an otpauth:// URI")
    kind = parts.netloc.lower()
    if kind not in ("totp", "hotp"):
        raise ValueError(f"unknown OTP type {parts.netloc!r}")
    query = parse_qs(parts.query, keep_blank_values=True)

    def one(name, default=None):
        values = query.get(name)
        if not values:
            return default
        if len(values) > 1:
            raise ValueError(f"{name} is given more than once")
        return values[0]

    def number(name, default):
        value = one(name)
        if value is None:
            return default
        if not value.isascii() or not value.isdigit():
            raise ValueError(f"{name} must be a whole number, not {value!r}")
        return int(value)

    secret = one("secret")
    if secret is None:
        raise ValueError("URI has no secret")
    algorithm = one("algorithm", "SHA1").lower()
    digits = number("digits", 6)
    _check(digits, algorithm)
    period = number("period", 30)
    if period < 1:
        raise ValueError("period must be at least 1")
    counter = number("counter", None)
    if kind == "hotp" and counter is None:
        raise ValueError("hotp URI has no counter")
    return {
        "type": kind,
        "label": unquote(parts.path.lstrip("/")),
        "issuer": one("issuer"),
        "key": decode_secret(secret),
        "digits": digits,
        "algorithm": algorithm,
        "period": period,
        "counter": counter,
    }


def _read_secret(env_name):
    if env_name:
        value = os.environ.get(env_name)
        if value is None:
            raise ValueError(f"environment variable {env_name} is not set")
        return value.strip()
    line = sys.stdin.readline()
    return line.strip()


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Print or check a TOTP/HOTP code. The secret (base32, or an otpauth:// URI) "
                    "is read from stdin, or from the variable named by -e.")
    parser.add_argument("-e", "--env", metavar="NAME", help="read the secret from this environment variable")
    parser.add_argument("-d", "--digits", type=int, help="code length (default 6, or the URI's)")
    parser.add_argument("-p", "--period", type=int, help="seconds per code (default 30, or the URI's)")
    parser.add_argument("-a", "--algorithm", choices=sorted(ALGORITHMS), help="HMAC hash (default sha1, or the URI's)")
    parser.add_argument("--at", type=float, metavar="UNIX_TIME", help="use this time instead of now")
    parser.add_argument("--counter", type=int, help="HOTP: use this counter instead of the time")
    parser.add_argument("--verify", metavar="CODE", help="check CODE instead of printing one")
    parser.add_argument("-w", "--window", type=int, default=1, help="steps either side accepted by --verify (default 1)")
    parser.add_argument("-v", "--verbose", action="store_true", help="also print the seconds left")
    args = parser.parse_args(argv)

    try:
        secret = _read_secret(args.env)
        if secret.lower().startswith("otpauth:"):
            settings = parse_uri(secret)
        else:
            settings = {"type": "totp", "key": decode_secret(secret), "digits": 6,
                        "algorithm": "sha1", "period": 30, "counter": None}
        digits = args.digits if args.digits is not None else settings["digits"]
        algorithm = args.algorithm or settings["algorithm"]
        period = args.period if args.period is not None else settings["period"]
        counter = args.counter if args.counter is not None else (
            settings["counter"] if settings["type"] == "hotp" else None)
        key = settings["key"]
        if counter is not None:
            if args.verify is not None:
                code = re.sub(r"\s", "", args.verify)
                ok = code.isascii() and hmac.compare_digest(hotp(key, counter, digits, algorithm), code)
                print("valid" if ok else "invalid")
                return 0 if ok else 1
            print(hotp(key, counter, digits, algorithm))
            return 0
        if args.verify is not None:
            offset = verify(key, args.verify, args.at, period, digits, algorithm, window=args.window)
            print("invalid" if offset is None else f"valid (step {offset:+d})")
            return 1 if offset is None else 0
        code = totp(key, args.at, period, digits, algorithm)
        if args.verbose:
            print(f"{code} ({seconds_left(args.at, period)}s left)")
        else:
            print(code)
        return 0
    except ValueError as err:
        print(f"totp: {err}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
