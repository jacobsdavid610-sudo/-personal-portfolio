# ulid.py

Generates and decodes ULIDs: 26-character IDs made of a 48-bit
millisecond timestamp plus 80 random bits, written in Crockford base32
(`01ARZ3NDEKTSV4RRFFQ69G5FAV`). Pure stdlib (`os`, `time`).

## Why

I wanted IDs for log lines and job records that sort by creation time
as plain text, so `sort`, `ls` and a database index all put them in
order without a separate timestamp column. UUIDv4 is random, so it
can't do that. A ULID can, and the timestamp can be read back out of it
when you're staring at an ID in a log and wondering when it was made.

## API

```python
import ulid

ulid.encode(1469922850259, 0xd6764c61efb99302bd5b)  # "01ARZ3NDEKTSV4RRFFQ69G5FAV"
ulid.decode("01ARZ3NDEKTSV4RRFFQ69G5FAV")           # (1469922850259, 0xd676...)
ulid.is_valid("01ARZ3NDEKTSV4RRFFQ69G5FAU")         # False
ulid.to_datetime("01ARZ3NDEKTSV4RRFFQ69G5FAV")      # 2016-07-30 23:54:10.259 UTC

gen = ulid.Generator()
gen.new()                                           # a fresh, monotonic ULID
```

- `encode(timestamp_ms, randomness)` - `randomness` is an integer under
  2^80. Raises `ValueError` if either is out of range.
- `decode(text)` - returns `(timestamp_ms, randomness)`. Accepts
  lowercase and surrounding whitespace.
- `is_valid(text)` - `decode` without the exception.
- `Generator(clock=None, rand=None)` - `clock` returns milliseconds and
  `rand` returns an 80-bit int; both can be swapped out for tests.

## CLI usage

```
python scripts/ulid.py new [-n COUNT]
python scripts/ulid.py decode ULID
python scripts/ulid.py check ULID
```

## Real example

```
$ python scripts/ulid.py new -n 3
01M4T5B2AK1J2F7XCGSJ0004Z5
01M4T5B2AK1J2F7XCGSJ0004Z6
01M4T5B2AK1J2F7XCGSJ0004Z7
$ python scripts/ulid.py decode 01ARZ3NDEKTSV4RRFFQ69G5FAV
time:   2016-07-30T23:54:10.259+00:00
ms:     1469922850259
random: d6764c61efb99302bd5b
$ python scripts/ulid.py check 01ARZ3NDEKTSV4RRFFQ69G5FAU; echo $?
1
```

Those three IDs share a millisecond, so only the end counts up. That's
the monotonic behaviour below.

## Design notes

- **Same millisecond means count up, not re-roll.** Fresh randomness for
  every ID would let two IDs from the same millisecond sort in a random
  order. The generator keeps the last random value and adds one, so
  every ID it hands out sorts after the previous one. If the 80 bits
  ever run out inside one millisecond it raises `OverflowError` rather
  than wrapping around and breaking the order.
- **A clock that steps backwards is treated like the same
  millisecond.** After an NTP adjustment `time()` can go back a few ms.
  The generator keeps using the last timestamp it saw and keeps
  counting, so order survives. The cost is that IDs briefly run ahead of
  the wall clock.
- **The first character is capped at `7`.** 26 base32 characters carry
  130 bits but a ULID only has 128, so a leading `8`-`Z` would overflow
  the timestamp. `decode` rejects those instead of silently wrapping to
  a nonsense date.
- **`I`, `L` and `O` are mapped to `1`, `1`, `0` before anything else.**
  That's what Crockford's spec says, and it means an ID typed in from a
  screenshot still works. My first version checked the leading
  character before doing the swap, so `O...` was rejected as "above 7".
  The test for ambiguous letters caught it. `U` isn't in the alphabet at
  all and stays invalid.
- **Random bytes come from `os.urandom`.** These aren't meant to be
  secrets, but nothing is lost by using the OS source rather than
  `random`, and it avoids two processes seeding identically.
- **IDs only sort globally if the clocks agree.** Order is guaranteed
  within one `Generator`. Across machines it's only as good as their
  clocks.

## Exit codes

`0` success, `1` an invalid ULID (`decode` or `check`), `2` usage error
(argparse).

## Running the tests

```
python -m unittest tests/test_ulid.py
```

22 tests: the spec's example ID decoding to its known timestamp,
encode/decode round-trips, the all-zero and maximum IDs, out-of-range
inputs, text sort order matching time order, lowercase and whitespace
input, `I`/`L`/`O` aliases, wrong length, invalid characters, the
leading-character overflow, non-string input, the generator counting up
within a millisecond, drawing fresh randomness on a new millisecond,
surviving the clock going backwards, raising on randomness overflow,
2000 real IDs staying unique and sorted, and the CLI's output and exit
codes. All passing.
