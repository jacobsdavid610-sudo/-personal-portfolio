# sparkline.py

Draws numbers as a one-line sparkline (`▁▅▂█`) or a small horizontal text
histogram. Gaps show as spaces, long series can be squeezed to a fixed
width, and histogram bars are drawn to an eighth of a character. Pure
stdlib.

## Why

A column of numbers in a terminal tells you very little at a glance; the
same numbers as `▁▂▂▃▅█▇▃` show the spike straight away. I wanted something
I can pipe response times, disk usage or daily counts into, that fits in a
status line or a log message, and that also answers "what does the
distribution look like" without opening a notebook.

## API

```python
from sparkline import sparkline, squeeze, histogram, render_histogram

sparkline([1, 5, 2, 8])                 # "▁▅▂█"
sparkline([1, None, 8])                 # "▁ █"
sparkline([20, 80], lo=0, hi=100)       # "▂▇" - fixed scale
sparkline(squeeze(range(1000), 20))     # 20 characters wide

for line in render_histogram(histogram(latencies, bins=8), width=30):
    print(line)
```

- `sparkline(values, lo=None, hi=None)` - one character per value. Gaps
  (`None`, NaN) are spaces. `lo`/`hi` fix the scale and clamp values outside
  it.
- `squeeze(values, width)` - average neighbouring values down to at most
  `width` points.
- `histogram(values, bins=10)` - list of `(low, high, count)`.
- `render_histogram(rows, width=40)` - text lines with bars scaled to the
  largest count.
- `bar(fraction, width)` and `parse_numbers(text)` are the helpers behind
  them.

## CLI usage

```
sparkline.py [-w WIDTH] [--min N] [--max N] [--hist BINS] [NUMBERS...]

  NUMBERS      numbers separated by spaces or commas (default: stdin);
               "-", "nan" or an empty field between commas is a gap
  -w WIDTH     squeeze the sparkline to WIDTH characters (histogram: bar width)
  --min/--max  fix the scale instead of using the data's own range
  --hist BINS  draw a histogram with BINS bins (1 to 1000) instead
```

## Real example

```
$ echo "1,2,,4, nan,7" | python scripts/sparkline.py
▁▂ ▅ █

$ python scripts/sparkline.py -w 5 $(seq 1 100)
▁▃▅▇█

$ python scripts/sparkline.py --hist 4 -w 20 1 2 2 3 3 3 4 4 4 4 9
1 – 3 │████████▋ 3
3 – 5 │████████████████████ 7
5 – 7 │ 0
7 – 9 │██▉ 1
```

## Exit codes

- `0` - success.
- `1` - a token is not a number, a value is infinite, or there are no
  numbers at all.
- `2` - usage error (bad width, bin count or scale).

## Design notes

- **Eight levels, split evenly.** A value's level is `floor(fraction * 8)`,
  with the maximum clamped into the top level, so each bar covers an equal
  slice of the range. Scaling by 7 and rounding instead would give the top
  and bottom bars half-width slices.
- **A flat series is drawn at mid height** (`▄▄▄`), not along the bottom,
  where it would look like "all zero" rather than "no change".
- **Gaps are kept, not dropped.** A missing reading shows as a space in the
  right place, so the line still lines up with time.
- **Squeezing averages buckets with integer edges**, so every value lands in
  exactly one bucket even when the length doesn't divide evenly. Gaps inside
  a bucket are ignored; a bucket of only gaps stays a gap.
- **Histogram bins are equal width over the data's range**, and the top bin
  includes the maximum. Bars are drawn with eighth blocks (`▏▎▍▌▋▊▉`), so
  small differences still show.
- **Infinity is an error**, because there is no scale on which to draw it.
  NaN is a gap, because that is usually what it means in real data.
- **Integers stay integers** when parsed, so labels read `1 – 3` instead of
  `1.0 – 3.0`.

## Running the tests

```
python -m unittest tests/test_sparkline.py
```

50 tests: levels and their even spread, flat and empty series, gaps, fixed
and clamped scales, bad input, squeezing (uneven buckets, gaps), histogram
counts and edges, eighth-block bars, label alignment, number parsing, and
the CLI including exit codes.
