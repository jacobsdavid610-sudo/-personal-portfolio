# humanize.py

Converts byte counts and durations to and from human-readable strings:
`1536 <-> "1.5 KiB"`, `9005 <-> "2h 30m 5s"`. Pure stdlib (`decimal`,
`re`).

## Why

`dirsize.sh` and `diskalert.sh` each format sizes their own way, and
anything that takes a threshold or timeout from a config file ends up
wanting `"500MB"` or `"1h30m"` instead of a raw number. This does the
conversion once, in both directions, with the edge cases handled.

## API

```python
from humanize import format_bytes, parse_bytes, format_duration, parse_duration

format_bytes(1536)                  # "1.5 KiB"
format_bytes(1500, binary=False)    # "1.5 kB"
parse_bytes("0.1 GB")               # 100000000
format_duration(9005)               # "2h 30m 5s"
format_duration(7199, max_units=2)  # "1h 59m"
parse_duration("1h30m")             # 5400.0
```

- `format_bytes(n, binary=True, precision=1)` — `n` must be a
  non-negative `int`. Under one unit stays exact (`"512 B"`).
- `parse_bytes(text)` — accepts `B`, `KiB`..`EiB` (powers of 1024),
  `kB`..`EB` (powers of 1000), and bare `K`/`M`/`G`... (treated as
  1024, matching `du -h`). Case-insensitive. Returns an `int`.
- `format_duration(seconds, max_units=None)` — `d`/`h`/`m`/`s`, zero
  parts skipped; under one second shows `ms`.
- `parse_duration(text)` — tokens `ms`, `s`, `m`, `h`, `d`, `w`,
  optionally separated by spaces or commas. Returns seconds as a float.
- Everything raises `ValueError` on bad input.

## CLI usage

```
python scripts/humanize.py bytes 1048575 [--si]
python scripts/humanize.py parse-bytes "1.5 GiB"
python scripts/humanize.py duration 9005 [--max-units 2]
python scripts/humanize.py parse-duration "1h30m"
```

## Real example

```
$ python scripts/humanize.py bytes 1048575
1.0 MiB
$ python scripts/humanize.py parse-bytes "0.1 GB"
100000000
$ python scripts/humanize.py duration 7199 --max-units 2
1h 59m
$ python scripts/humanize.py parse-duration "5x"
can't parse duration '5x' at '5x'
```

## Design notes

- **Rounding carries across unit boundaries.** 1048575 bytes is
  1023.999 KiB, which naively rounds to `"1024.0 KiB"`. After rounding,
  if the value has reached the base it gets promoted to the next unit,
  so it prints `"1.0 MiB"`.
- **`Decimal`, not float.** `0.1 * 1000**3` in float is
  `100000000.00000001`; with `Decimal` it's exact, so `parse_bytes`
  can reject inputs that genuinely aren't a whole number of bytes
  (`"1.5 B"`) without false positives on ones that are.
- **Bare `K`/`M`/`G` mean 1024.** `kB`/`MB` follow SI (1000) and
  `KiB`/`MiB` are explicitly binary, but a bare letter is ambiguous;
  going with what `du -h`, `ls -h` and `dirsize.sh` print means their
  output can be pasted straight back in.
- **`max_units` truncates, never rounds.** `7199` seconds with two
  units is `"1h 59m"`. Rounding up to `"2h 0m"` would overstate it,
  which is the wrong direction for something like "time remaining".
- **`parse_duration` is strict about leftovers.** It walks the string
  token by token and fails on the first thing it can't consume, so
  `"1h banana"` or `"1 hour"` raise instead of quietly becoming 3600.
  `ms` is matched before `m` so `"5ms"` isn't read as five minutes
  followed by a stray `s`.

## Exit codes

`0` success, `1` input that couldn't be parsed/formatted, `2` usage
error (argparse).

## Running the tests

```
python -m unittest tests/test_humanize.py
```

23 tests: exact sub-unit output, binary and SI formatting, rounding
carrying into the next unit in both modes, custom precision, capping at
EiB, rejecting negative/float/bool/str byte counts, every suffix style
for parsing, bare letters meaning binary, exact decimal math (`0.1 GB`,
`.5KiB`), byte and duration round-trips through format -> parse, junk
byte strings being rejected, duration formatting with skipped zero
parts, `max_units` truncating, sub-second output, rejecting
negative/inf/NaN durations, compound and comma-separated durations,
fractional/ms/week units, `ms` vs `m`+`s`, case-insensitivity, and
trailing garbage being rejected instead of half-parsed. All passing.
