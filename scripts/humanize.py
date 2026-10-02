#!/usr/bin/env python3
"""Convert byte counts and durations to and from human-readable strings:
1536 <-> "1.5 KiB", 9005 <-> "2h 30m 5s". Pure stdlib (decimal, re)."""

import argparse
import re
import sys
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

BINARY_UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"]
DECIMAL_UNITS = ["B", "kB", "MB", "GB", "TB", "PB", "EB"]

# Lowercased suffix -> multiplier. Bare K/M/G are treated as binary,
# because that's what `du -h`, `ls -h` and dirsize.sh all print.
_BYTE_SUFFIXES = {"": 1, "b": 1}
for _i, _p in enumerate("kmgtpe", start=1):
    _BYTE_SUFFIXES[_p] = 1024 ** _i
    _BYTE_SUFFIXES[_p + "ib"] = 1024 ** _i
    _BYTE_SUFFIXES[_p + "b"] = 1000 ** _i

_DURATION_UNITS = [("d", 86400), ("h", 3600), ("m", 60), ("s", 1)]
_DURATION_SUFFIXES = {"ms": Decimal("0.001"), "s": 1, "m": 60, "h": 3600, "d": 86400, "w": 604800}

_BYTES_RE = re.compile(r"^\s*(\d+(?:\.\d+)?|\.\d+)\s*([a-zA-Z]*)\s*$")
_DURATION_TOKEN_RE = re.compile(r"(\d+(?:\.\d+)?|\.\d+)\s*(ms|[smhdw])", re.IGNORECASE)


def format_bytes(n, binary=True, precision=1):
    """Formats a non-negative byte count, e.g. 1536 -> "1.5 KiB" (or
    "1.5 kB" with binary=False). Values under one unit stay as an exact
    integer: 512 -> "512 B"."""
    if isinstance(n, bool) or not isinstance(n, int) or n < 0:
        raise ValueError(f"byte count must be a non-negative int, got {n!r}")
    base = 1024 if binary else 1000
    units = BINARY_UNITS if binary else DECIMAL_UNITS
    if n < base:
        return f"{n} B"

    quantum = Decimal(1).scaleb(-precision)
    value = Decimal(n)
    idx = 0
    while value >= base and idx < len(units) - 1:
        value /= base
        idx += 1
    rounded = value.quantize(quantum, rounding=ROUND_HALF_UP)
    # 1048575 bytes is 1023.999 KiB, which rounds to "1024.0 KiB" -
    # carry it up to the next unit instead of printing that.
    if rounded >= base and idx < len(units) - 1:
        idx += 1
        rounded = (rounded / base).quantize(quantum, rounding=ROUND_HALF_UP)
    return f"{rounded} {units[idx]}"


def parse_bytes(text):
    """Parses "1.5GiB", "10 MB", "4k", "512" into an int byte count.
    Decimal arithmetic so "0.1 GB" is exactly 100000000, not off by a
    float rounding error. Raises ValueError on an unknown suffix or a
    value that isn't a whole number of bytes."""
    if not isinstance(text, str):
        raise ValueError(f"expected a string, got {text!r}")
    m = _BYTES_RE.match(text)
    if not m:
        raise ValueError(f"can't parse byte size: {text!r}")
    number, suffix = m.groups()
    mult = _BYTE_SUFFIXES.get(suffix.lower())
    if mult is None:
        raise ValueError(f"unknown byte suffix {suffix!r} in {text!r}")
    total = Decimal(number) * mult
    if total != total.to_integral_value():
        raise ValueError(f"{text!r} is not a whole number of bytes")
    return int(total)


def format_duration(seconds, max_units=None):
    """Formats seconds as e.g. "2h 30m 5s". max_units keeps only the
    largest N non-zero parts (truncating, not rounding - "1h 59m 59s"
    with max_units=2 is "1h 59m", never a misleading "2h 0m").
    Durations under a second are shown in ms."""
    try:
        seconds = Decimal(str(seconds))
    except InvalidOperation:
        raise ValueError(f"not a number: {seconds!r}") from None
    if not seconds.is_finite() or seconds < 0:
        raise ValueError(f"duration must be finite and non-negative, got {seconds}")
    if seconds == 0:
        return "0s"
    if seconds < 1:
        return f"{int(seconds * 1000)}ms"

    remaining = int(seconds)
    parts = []
    for suffix, size in _DURATION_UNITS:
        count, remaining = divmod(remaining, size)
        if count:
            parts.append(f"{count}{suffix}")
    if max_units is not None:
        parts = parts[:max_units]
    return " ".join(parts)


def parse_duration(text):
    """Parses "1h30m", "2d 4h", "1.5h", "250ms", "90s" into seconds (a
    float). Every character has to belong to a recognised token - "5x"
    or "1h banana" raise ValueError rather than being half-parsed."""
    if not isinstance(text, str):
        raise ValueError(f"expected a string, got {text!r}")
    stripped = text.strip()
    if not stripped:
        raise ValueError("empty duration")

    total = Decimal(0)
    pos = 0
    while pos < len(stripped):
        m = _DURATION_TOKEN_RE.match(stripped, pos)
        if not m:
            raise ValueError(f"can't parse duration {text!r} at {stripped[pos:]!r}")
        number, unit = m.groups()
        total += Decimal(number) * _DURATION_SUFFIXES[unit.lower()]
        pos = m.end()
        while pos < len(stripped) and stripped[pos] in " ,":
            pos += 1
    return float(total)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("bytes", help="byte count -> human string")
    p.add_argument("n", type=int)
    p.add_argument("--si", action="store_true", help="powers of 1000 (kB, MB) instead of 1024")
    sub.add_parser("parse-bytes", help="human string -> byte count").add_argument("text")
    p = sub.add_parser("duration", help="seconds -> human string")
    p.add_argument("seconds", type=float)
    p.add_argument("--max-units", type=int, default=None)
    sub.add_parser("parse-duration", help="human string -> seconds").add_argument("text")
    args = parser.parse_args()

    try:
        if args.cmd == "bytes":
            print(format_bytes(args.n, binary=not args.si))
        elif args.cmd == "parse-bytes":
            print(parse_bytes(args.text))
        elif args.cmd == "duration":
            print(format_duration(args.seconds, max_units=args.max_units))
        else:
            seconds = parse_duration(args.text)
            print(int(seconds) if seconds.is_integer() else seconds)
    except ValueError as err:
        print(err, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
