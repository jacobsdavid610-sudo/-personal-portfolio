#!/usr/bin/env python3
"""Generate and decode ULIDs: 26-character, time-sortable IDs made of a
48-bit millisecond timestamp and 80 random bits, in Crockford base32.
Pure stdlib (os, time)."""

import argparse
import datetime
import os
import sys
import time

ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_DECODE = {c: i for i, c in enumerate(ALPHABET)}
# Crockford's spec: I and L read as 1, O reads as 0, so hand-copied IDs
# survive. They are swapped out before any range check, so "O..." is
# treated as "0...". U is left out of the alphabet and stays invalid.
_ALIASES = str.maketrans("ILO", "110")

MAX_TIME = (1 << 48) - 1
MAX_RANDOM = (1 << 80) - 1
ULID_LEN = 26


def _encode(value, length):
    chars = []
    for _ in range(length):
        chars.append(ALPHABET[value & 31])
        value >>= 5
    return "".join(reversed(chars))


def _decode(text):
    value = 0
    for ch in text:
        try:
            value = (value << 5) | _DECODE[ch]
        except KeyError:
            raise ValueError(f"invalid character {ch!r} in ULID") from None
    return value


def _normalise(text):
    if not isinstance(text, str):
        raise ValueError(f"ULID must be a string, got {text!r}")
    text = text.strip().upper().translate(_ALIASES)
    if len(text) != ULID_LEN:
        raise ValueError(f"ULID must be {ULID_LEN} characters, got {len(text)}")
    # 26 chars hold 130 bits but a ULID is 128, so the first character
    # can only be 0-7. Anything higher would overflow the timestamp.
    if text[0] > "7":
        raise ValueError("ULID is out of range (first character must be 0-7)")
    return text


def encode(timestamp_ms, randomness):
    """Builds a ULID from a millisecond timestamp and an 80-bit integer."""
    if not 0 <= timestamp_ms <= MAX_TIME:
        raise ValueError(f"timestamp out of range: {timestamp_ms}")
    if not 0 <= randomness <= MAX_RANDOM:
        raise ValueError("randomness must fit in 80 bits")
    return _encode(timestamp_ms, 10) + _encode(randomness, 16)


def decode(text):
    """Splits a ULID into (timestamp_ms, randomness)."""
    text = _normalise(text)
    return _decode(text[:10]), _decode(text[10:])


def is_valid(text):
    try:
        decode(text)
    except ValueError:
        return False
    return True


def to_datetime(text):
    ms, _ = decode(text)
    return datetime.datetime.fromtimestamp(ms / 1000, tz=datetime.timezone.utc)


class Generator:
    """Makes ULIDs that always sort in the order they were made, even
    several in the same millisecond or after the clock steps backwards."""

    def __init__(self, clock=None, rand=None):
        self._clock = clock or (lambda: int(time.time() * 1000))
        self._rand = rand or (lambda: int.from_bytes(os.urandom(10), "big"))
        self._last_time = -1
        self._last_rand = 0

    def new(self):
        now = self._clock()
        if now > self._last_time:
            self._last_time, self._last_rand = now, self._rand()
        else:
            # Same millisecond (or the clock went backwards): keep the
            # old timestamp and count up, so the new ID still sorts last.
            if self._last_rand == MAX_RANDOM:
                raise OverflowError("ran out of ULIDs for this millisecond")
            self._last_rand += 1
        return encode(self._last_time, self._last_rand)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Generate and decode ULIDs.")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_new = sub.add_parser("new", help="print new ULIDs")
    p_new.add_argument("-n", type=int, default=1, help="how many (default 1)")
    p_dec = sub.add_parser("decode", help="show the timestamp inside a ULID")
    p_dec.add_argument("ulid")
    p_chk = sub.add_parser("check", help="exit 0 if the ULID is valid")
    p_chk.add_argument("ulid")
    args = parser.parse_args(argv)

    if args.cmd == "new":
        if args.n < 1:
            parser.error("-n must be at least 1")
        gen = Generator()
        for _ in range(args.n):
            print(gen.new())
        return 0
    if args.cmd == "check":
        return 0 if is_valid(args.ulid) else 1
    try:
        ms, rnd = decode(args.ulid)
    except ValueError as e:
        print(e, file=sys.stderr)
        return 1
    print(f"time:   {to_datetime(args.ulid).isoformat(timespec='milliseconds')}")
    print(f"ms:     {ms}")
    print(f"random: {rnd:020x}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
