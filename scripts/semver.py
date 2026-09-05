#!/usr/bin/env python3
"""Semantic Versioning (semver.org) parser and comparator: parses
MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD] and compares/sorts versions by the
spec's precedence rules (prerelease identifiers compared per dot-separated
field, build metadata ignored for ordering). Pure stdlib."""

import argparse
import functools
import json
import re

_SEMVER_RE = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-(?P<prerelease>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?"
    r"(?:\+(?P<build>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$"
)


class InvalidVersion(ValueError):
    pass


@functools.total_ordering
class Version:
    __slots__ = ("major", "minor", "patch", "prerelease", "build")

    def __init__(self, major, minor, patch, prerelease=(), build=None):
        self.major = major
        self.minor = minor
        self.patch = patch
        self.prerelease = tuple(prerelease)
        self.build = build

    @classmethod
    def parse(cls, text):
        m = _SEMVER_RE.match(text)
        if not m:
            raise InvalidVersion(f"not a valid semantic version: {text!r}")
        major, minor, patch = (int(x) for x in m.group(1, 2, 3))
        prerelease_str = m.group("prerelease")
        prerelease = tuple(prerelease_str.split(".")) if prerelease_str else ()
        return cls(major, minor, patch, prerelease, m.group("build"))

    def _identifier_keys(self):
        return tuple((0, int(part)) if part.isdigit() else (1, part) for part in self.prerelease)

    def _cmp_key(self):
        # A version with no prerelease outranks the same major.minor.patch
        # WITH a prerelease, so "no prerelease" (True) sorts after "has
        # one" (False) - hence the boolean sitting ahead of the identifiers.
        return (self.major, self.minor, self.patch, self.prerelease == (), self._identifier_keys())

    def __eq__(self, other):
        if not isinstance(other, Version):
            return NotImplemented
        return (self.major, self.minor, self.patch, self.prerelease) == (
            other.major,
            other.minor,
            other.patch,
            other.prerelease,
        )

    def __lt__(self, other):
        if not isinstance(other, Version):
            return NotImplemented
        return self._cmp_key() < other._cmp_key()

    def __hash__(self):
        return hash((self.major, self.minor, self.patch, self.prerelease))

    def __str__(self):
        text = f"{self.major}.{self.minor}.{self.patch}"
        if self.prerelease:
            text += "-" + ".".join(self.prerelease)
        if self.build:
            text += "+" + self.build
        return text

    def __repr__(self):
        return f"Version({str(self)!r})"


def compare(a, b):
    """Compare two version strings. Returns -1, 0, or 1."""
    va, vb = Version.parse(a), Version.parse(b)
    if va < vb:
        return -1
    if vb < va:
        return 1
    return 0


def sort_versions(versions, reverse=False):
    """Sort an iterable of version strings, lowest precedence first."""
    return [str(v) for v in sorted((Version.parse(v) for v in versions), reverse=reverse)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    parse_cmd = sub.add_parser("parse", help="parse a version and print its components")
    parse_cmd.add_argument("version")

    compare_cmd = sub.add_parser("compare", help="compare two versions")
    compare_cmd.add_argument("a")
    compare_cmd.add_argument("b")

    sort_cmd = sub.add_parser("sort", help="sort versions, lowest precedence first")
    sort_cmd.add_argument("versions", nargs="+")
    sort_cmd.add_argument("--reverse", action="store_true")

    args = parser.parse_args()

    if args.command == "parse":
        v = Version.parse(args.version)
        print(json.dumps({
            "major": v.major,
            "minor": v.minor,
            "patch": v.patch,
            "prerelease": list(v.prerelease),
            "build": v.build,
        }))
    elif args.command == "compare":
        result = compare(args.a, args.b)
        print({-1: "<", 0: "=", 1: ">"}[result])
    elif args.command == "sort":
        for v in sort_versions(args.versions, reverse=args.reverse):
            print(v)


if __name__ == "__main__":
    main()
