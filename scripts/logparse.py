#!/usr/bin/env python3
"""Parse Apache/Nginx "combined" access log lines and report summary stats:
status code counts, top client IPs, top request paths, and total bytes
transferred. Pure stdlib (re), no dependencies."""

import argparse
import re
import sys
from collections import Counter

# Matches the standard "combined" log format:
# 127.0.0.1 - frank [10/Oct/2023:13:55:36 -0700] "GET /index.html HTTP/1.1" 200 2326 "-" "curl/7.68.0"
LOG_RE = re.compile(
    r'^(?P<ip>\S+) \S+ \S+ \[(?P<time>[^\]]+)\] '
    r'"(?P<method>[A-Z]+) (?P<path>\S+) \S+" '
    r'(?P<status>\d{3}) (?P<bytes>\d+|-)'
)


def parse_line(line):
    """Return a dict of fields for a matching log line, or None."""
    m = LOG_RE.match(line)
    if not m:
        return None
    fields = m.groupdict()
    fields["status"] = int(fields["status"])
    fields["bytes"] = 0 if fields["bytes"] == "-" else int(fields["bytes"])
    return fields


class LogStats:
    def __init__(self):
        self.total_lines = 0
        self.matched = 0
        self.status_counts = Counter()
        self.ip_counts = Counter()
        self.path_counts = Counter()
        self.total_bytes = 0

    def add(self, entry):
        self.matched += 1
        self.status_counts[entry["status"]] += 1
        self.ip_counts[entry["ip"]] += 1
        self.path_counts[entry["path"]] += 1
        self.total_bytes += entry["bytes"]

    @property
    def unmatched(self):
        return self.total_lines - self.matched


def analyze(lines):
    stats = LogStats()
    for line in lines:
        stats.total_lines += 1
        entry = parse_line(line)
        if entry is not None:
            stats.add(entry)
    return stats


def format_report(stats, top_n=5):
    out = []
    out.append(f"Lines: {stats.total_lines} total, {stats.matched} parsed, "
               f"{stats.unmatched} skipped (unmatched format)")
    out.append(f"Total bytes transferred: {stats.total_bytes}")

    out.append("")
    out.append("Status codes:")
    for status, count in sorted(stats.status_counts.items()):
        out.append(f"  {status}: {count}")

    out.append("")
    out.append(f"Top {top_n} client IPs:")
    for ip, count in stats.ip_counts.most_common(top_n):
        out.append(f"  {count:6d}  {ip}")

    out.append("")
    out.append(f"Top {top_n} paths:")
    for path, count in stats.path_counts.most_common(top_n):
        out.append(f"  {count:6d}  {path}")

    return "\n".join(out)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", nargs="?", help="Access log file (default: stdin)")
    parser.add_argument("-n", "--top", type=int, default=5,
                        help="How many top IPs/paths to show (default: 5)")
    args = parser.parse_args()

    if args.file:
        with open(args.file, encoding="utf-8") as f:
            stats = analyze(f)
    else:
        stats = analyze(sys.stdin)

    print(format_report(stats, args.top))


if __name__ == "__main__":
    main()
