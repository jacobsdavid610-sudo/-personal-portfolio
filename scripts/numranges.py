#!/usr/bin/env python3
"""Parse and format compact integer ranges like "1-3,5,8-10", the way print
dialogs and cron fields write them. Pure stdlib (argparse, sys)."""

import argparse
import sys


def parse(text, limit=None):
    """Return the sorted, de-duplicated list of integers named by `text`.

    "1-3,5,8-10" -> [1, 2, 3, 5, 8, 9, 10]. Whitespace around items is
    ignored. A range must go upward ("5-3" is an error, not a reversal).
    If `limit` is given, any number above it is rejected, which keeps
    "1-999999999" from allocating a huge list.
    """
    if text is None or not text.strip():
        return []
    seen = set()
    for item in text.split(","):
        item = item.strip()
        if not item:
            raise ValueError("empty item in %r" % text)
        lo, sep, hi = item.partition("-")
        try:
            start = int(lo)
            end = int(hi) if sep else start
        except ValueError:
            raise ValueError("not a number or range: %r" % item) from None
        if start < 0 or end < 0:
            raise ValueError("negative numbers aren't supported: %r" % item)
        if end < start:
            raise ValueError("range goes backwards: %r" % item)
        if limit is not None and end > limit:
            raise ValueError("%d is above the limit of %d" % (end, limit))
        seen.update(range(start, end + 1))
    return sorted(seen)


def format_ranges(numbers):
    """Inverse of parse: [1, 2, 3, 5, 8, 9, 10] -> "1-3,5,8-10".

    Input can be unsorted and contain duplicates. A run of two is written
    as "4,5", not "4-5", since the range form saves nothing.
    """
    nums = sorted(set(numbers))
    parts = []
    i = 0
    while i < len(nums):
        j = i
        while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1:
            j += 1
        if j - i >= 2:
            parts.append("%d-%d" % (nums[i], nums[j]))
        else:
            parts.extend(str(n) for n in nums[i:j + 1])
        i = j + 1
    return ",".join(parts)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Expand or compact integer ranges.")
    parser.add_argument("spec", help='ranges such as "1-3,5,8-10"')
    parser.add_argument("--limit", type=int, help="reject numbers above this")
    parser.add_argument("--compact", action="store_true",
                        help="print the normalised range string instead of one number per line")
    args = parser.parse_args(argv)
    try:
        nums = parse(args.spec, args.limit)
    except ValueError as err:
        print("numranges: %s" % err, file=sys.stderr)
        return 1
    if args.compact:
        print(format_ranges(nums))
    else:
        for n in nums:
            print(n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
