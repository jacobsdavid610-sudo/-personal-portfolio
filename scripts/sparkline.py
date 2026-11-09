#!/usr/bin/env python3
"""Draw numbers as a one-line sparkline or a small text histogram.

`sparkline([1, 5, 2, 8])` gives "▁▅▂█". Gaps (None or NaN) become spaces,
long series can be squeezed to a fixed width by averaging, and `--hist`
draws a horizontal histogram with eighth-block precision. Pure stdlib."""

import argparse
import math
import re
import sys

BARS = "▁▂▃▄▅▆▇█"
EIGHTHS = " ▏▎▍▌▋▊▉"
FULL = "█"


def _is_gap(v):
    return v is None or (isinstance(v, float) and math.isnan(v))


def _check(values):
    for v in values:
        if _is_gap(v):
            continue
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise TypeError(f"not a number: {v!r}")
        if math.isinf(v):
            raise ValueError("infinite values cannot be drawn")


def sparkline(values, lo=None, hi=None):
    """One character per value. `lo` and `hi` fix the scale (values outside
    are clamped); by default the series' own min and max are used. A flat
    series is drawn at mid height. Gaps (None, NaN) are spaces."""
    values = list(values)
    _check(values)
    present = [v for v in values if not _is_gap(v)]
    if not present:
        return " " * len(values)
    lo = min(present) if lo is None else lo
    hi = max(present) if hi is None else hi
    if hi < lo:
        raise ValueError("hi must not be below lo")
    out = []
    for v in values:
        if _is_gap(v):
            out.append(" ")
        elif hi == lo:
            out.append(BARS[len(BARS) // 2 - 1])
        else:
            frac = (min(max(v, lo), hi) - lo) / (hi - lo)
            out.append(BARS[min(int(frac * len(BARS)), len(BARS) - 1)])
    return "".join(out)


def squeeze(values, width):
    """Resample `values` to at most `width` points by averaging each run of
    neighbours. Gaps are ignored inside a bucket; a bucket of only gaps stays
    a gap. Shorter series are returned unchanged."""
    if width < 1:
        raise ValueError("width must be at least 1")
    values = list(values)
    _check(values)
    n = len(values)
    if n <= width:
        return values
    out = []
    for b in range(width):
        # Integer bucket edges, so every value lands in exactly one bucket.
        chunk = [v for v in values[b * n // width:(b + 1) * n // width] if not _is_gap(v)]
        out.append(sum(chunk) / len(chunk) if chunk else None)
    return out


def histogram(values, bins=10):
    """List of (low, high, count). Bins are equal width over the data's range;
    the last bin includes its upper edge. Gaps are skipped."""
    if bins < 1:
        raise ValueError("bins must be at least 1")
    values = list(values)
    _check(values)
    present = [v for v in values if not _is_gap(v)]
    if not present:
        return []
    lo, hi = min(present), max(present)
    if lo == hi:
        return [(lo, hi, len(present))]
    step = (hi - lo) / bins
    counts = [0] * bins
    for v in present:
        counts[min(int((v - lo) / step), bins - 1)] += 1
    return [(lo + i * step, hi if i == bins - 1 else lo + (i + 1) * step, c) for i, c in enumerate(counts)]


def bar(fraction, width):
    """A horizontal bar `fraction` (0..1) of `width` cells, to 1/8 of a cell."""
    eighths = round(max(0.0, min(1.0, fraction)) * width * 8)
    full, part = divmod(eighths, 8)
    return FULL * full + (EIGHTHS[part] if part else "")


def _fmt(x):
    return f"{x:g}" if isinstance(x, float) else str(x)


def render_histogram(rows, width=40):
    """Lines like `  1 –   3.5 │████▌ 9`, bars scaled to the largest count."""
    if not rows:
        return []
    top = max(c for _, _, c in rows) or 1
    labels = [(_fmt(lo), _fmt(hi)) for lo, hi, _ in rows]
    wl = max(len(a) for a, _ in labels)
    wh = max(len(b) for _, b in labels)
    return [f"{a:>{wl}} – {b:>{wh}} │{bar(c / top, width)} {c}" for (a, b), (_, _, c) in zip(labels, rows)]


def parse_numbers(text):
    """Numbers separated by whitespace or commas; `-`, `nan` or an empty
    field between commas is a gap. Raises ValueError naming a bad token."""
    out = []
    for token in re.split(r"[\s]*,[\s]*|\s+", text.strip()) if text.strip() else []:
        if token in ("", "-") or token.lower() == "nan":
            out.append(None)
            continue
        try:
            v = float(token)
        except ValueError:
            raise ValueError(f"not a number: {token!r}") from None
        if math.isinf(v):
            raise ValueError(f"infinite value: {token!r}")
        out.append(int(v) if v.is_integer() and re.fullmatch(r"[+-]?\d+", token) else v)
    return out


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("numbers", nargs="*", help="numbers (default: read from stdin)")
    parser.add_argument("-w", "--width", type=int, help="squeeze to at most WIDTH characters")
    parser.add_argument("--min", type=float, dest="lo", help="bottom of the scale")
    parser.add_argument("--max", type=float, dest="hi", help="top of the scale")
    parser.add_argument("--hist", type=int, metavar="BINS", help="draw a histogram with BINS bins instead")
    args = parser.parse_args(argv)
    if args.width is not None and args.width < 1:
        parser.error("--width must be at least 1")
    if args.hist is not None and not 1 <= args.hist <= 1000:
        parser.error("--hist must be between 1 and 1000")
    if args.lo is not None and args.hi is not None and args.hi < args.lo:
        parser.error("--max must not be below --min")
    try:
        text = " ".join(args.numbers) if args.numbers else sys.stdin.read()
        values = parse_numbers(text)
    except ValueError as err:
        print(f"sparkline: {err}", file=sys.stderr)
        return 1
    if all(_is_gap(v) for v in values):
        print("sparkline: no numbers given", file=sys.stderr)
        return 1
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if args.hist is not None:
        lines = render_histogram(histogram(values, args.hist), args.width or 40)
    else:
        if args.width:
            values = squeeze(values, args.width)
        lines = [sparkline(values, args.lo, args.hi)]
    for line in lines:
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
