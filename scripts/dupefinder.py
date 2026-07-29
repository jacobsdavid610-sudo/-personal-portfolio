#!/usr/bin/env python3
"""Find duplicate files under a directory by content hash. No external
dependencies. Groups by size first so unique-sized files never get hashed."""

import argparse
import hashlib
import os
import sys
from collections import defaultdict


def iter_files(root):
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            path = os.path.join(dirpath, name)
            if os.path.isfile(path):
                yield path


def hash_file(path, chunk_size=65536):
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def find_duplicates(root):
    """Return {hash: [paths]} for every hash with more than one file."""
    by_size = defaultdict(list)
    for path in iter_files(root):
        by_size[os.path.getsize(path)].append(path)

    by_hash = defaultdict(list)
    for paths in by_size.values():
        if len(paths) < 2:
            continue
        for path in paths:
            by_hash[hash_file(path)].append(path)

    return {digest: paths for digest, paths in by_hash.items() if len(paths) > 1}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", help="Directory to scan")
    parser.add_argument(
        "--delete",
        action="store_true",
        help="Delete duplicates, keeping the first file found in each group",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip the confirmation prompt when used with --delete",
    )
    args = parser.parse_args()

    if not os.path.isdir(args.directory):
        print(f"Not a directory: {args.directory}", file=sys.stderr)
        return 1

    groups = find_duplicates(args.directory)
    if not groups:
        print("No duplicates found.")
        return 0

    total_wasted = 0
    for digest, paths in groups.items():
        keep, rest = paths[0], paths[1:]
        wasted = os.path.getsize(keep) * len(rest)
        total_wasted += wasted
        print(f"\n{digest[:12]}  ({len(paths)} copies, {wasted} bytes reclaimable)")
        print(f"  keep    {keep}")
        for path in rest:
            print(f"  dupe    {path}")

    print(f"\n{len(groups)} duplicate group(s), {total_wasted} bytes reclaimable total.")

    if not args.delete:
        return 0

    if not args.yes:
        answer = input("\nDelete all duplicate copies listed above? [y/N] ")
        if answer.strip().lower() != "y":
            print("Aborted, nothing deleted.")
            return 0

    deleted = 0
    for paths in groups.values():
        for path in paths[1:]:
            os.remove(path)
            deleted += 1
    print(f"Deleted {deleted} file(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
