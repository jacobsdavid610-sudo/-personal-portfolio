#!/usr/bin/env python3
"""Parse simple leveled log lines, filter by minimum severity and/or a
time range, and summarize counts per level. Pure stdlib.

Expected line format: "<ISO8601 timestamp> <LEVEL> <message>", e.g.
"2026-08-14T10:15:32 ERROR Database connection failed".
"""

import re
from datetime import datetime

LEVELS = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]

_LINE_RE = re.compile(r"^(?P<timestamp>\S+)\s+(?P<level>[A-Z]+)\s+(?P<message>.*)$")


class LogEntry:
    __slots__ = ("timestamp", "level", "message", "raw")

    def __init__(self, timestamp, level, message, raw):
        self.timestamp = timestamp
        self.level = level
        self.message = message
        self.raw = raw

    def __repr__(self):
        return f"LogEntry({self.timestamp!r}, {self.level!r}, {self.message!r})"


def parse_line(line):
    """Parse one log line into a LogEntry, or None if it's blank, doesn't
    match the expected shape, or has an unrecognized level."""
    line = line.rstrip("\n")
    if not line.strip():
        return None
    m = _LINE_RE.match(line)
    if not m:
        return None
    level = m.group("level")
    if level not in LEVELS:
        return None
    try:
        timestamp = datetime.fromisoformat(m.group("timestamp"))
    except ValueError:
        return None
    return LogEntry(timestamp, level, m.group("message"), line)


def parse_lines(lines):
    """Parse an iterable of lines. Returns (entries, unparsed_count) —
    blank lines are silently ignored and not counted as unparsed, since
    they're not really malformed log lines, just whitespace."""
    entries = []
    unparsed = 0
    for line in lines:
        entry = parse_line(line)
        if entry is not None:
            entries.append(entry)
        elif line.strip():
            unparsed += 1
    return entries, unparsed


def filter_entries(entries, level=None, since=None, until=None):
    """Filter entries by minimum severity and/or an inclusive time range.
    `level` keeps entries at or above that severity (e.g. level="ERROR"
    keeps ERROR and CRITICAL, drops everything lower)."""
    result = entries
    if level is not None:
        min_index = LEVELS.index(level)
        result = [e for e in result if LEVELS.index(e.level) >= min_index]
    if since is not None:
        result = [e for e in result if e.timestamp >= since]
    if until is not None:
        result = [e for e in result if e.timestamp <= until]
    return result


def summarize(entries):
    """Return level -> count for levels that actually occurred, in
    LEVELS severity order (not first-seen order, so DEBUG always comes
    before ERROR in the output regardless of log line order)."""
    counts = {level: 0 for level in LEVELS}
    for e in entries:
        counts[e.level] += 1
    return {level: count for level, count in counts.items() if count > 0}


def main():
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("logfile")
    parser.add_argument(
        "--level", choices=LEVELS, help="minimum severity to show (e.g. ERROR keeps ERROR and CRITICAL)"
    )
    parser.add_argument("--since", help="ISO8601 timestamp, inclusive lower bound")
    parser.add_argument("--until", help="ISO8601 timestamp, inclusive upper bound")
    parser.add_argument("--summary", action="store_true", help="print per-level counts instead of matching lines")
    args = parser.parse_args()

    with open(args.logfile) as f:
        entries, unparsed = parse_lines(f)

    since = datetime.fromisoformat(args.since) if args.since else None
    until = datetime.fromisoformat(args.until) if args.until else None
    filtered = filter_entries(entries, level=args.level, since=since, until=until)

    if args.summary:
        counts = summarize(filtered)
        if not counts:
            print("No matching entries.")
        else:
            for level, count in counts.items():
                print(f"{level:9s}{count}")
    else:
        for e in filtered:
            print(e.raw)

    print()
    print(f"{len(filtered)} matching line(s), {unparsed} unparsed line(s) skipped.")


if __name__ == "__main__":
    main()
