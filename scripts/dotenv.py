#!/usr/bin/env python3
"""Parse .env files: KEY=VALUE lines with comments, an optional `export`
prefix, single and double quotes, and ${VAR} expansion. Pure stdlib
(argparse, json, os, re, sys)."""

import argparse
import json
import os
import re
import sys

_KEY = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
_VAR = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}")
_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", '"': '"', "\\": "\\", "$": "$"}


class ParseError(ValueError):
    def __init__(self, lineno, message):
        super().__init__("line %d: %s" % (lineno, message))
        self.lineno = lineno


def _read_value(raw, lineno):
    """Return (value, expandable) from the text after the `=`."""
    raw = raw.lstrip(" \t")
    if raw.startswith("'"):
        end = raw.find("'", 1)
        if end == -1:
            raise ParseError(lineno, "unterminated single quote")
        _check_tail(raw[end + 1:], lineno)
        return raw[1:end], False  # single quotes are fully literal
    if raw.startswith('"'):
        out = []
        i = 1
        while i < len(raw):
            ch = raw[i]
            if ch == "\\" and i + 1 < len(raw):
                nxt = raw[i + 1]
                # An unknown escape keeps its backslash ("C:\Users" stays
                # put), but \t and \n are a tab and a newline, as in a shell.
                out.append(_ESCAPES.get(nxt, "\\" + nxt))
                i += 2
                continue
            if ch == '"':
                _check_tail(raw[i + 1:], lineno)
                return "".join(out), True
            out.append(ch)
            i += 1
        raise ParseError(lineno, "unterminated double quote")
    # Unquoted: a ` #` starts a comment, a bare `#` inside a value doesn't.
    value = re.split(r"\s#", raw, maxsplit=1)[0]
    return value.strip(), True


def _check_tail(tail, lineno):
    tail = tail.strip()
    if tail and not tail.startswith("#"):
        raise ParseError(lineno, "unexpected text after closing quote")


def _expand(value, env):
    def repl(match):
        name, default = match.group(1), match.group(2)
        found = env.get(name)
        if found:
            return found
        return default if default is not None else ""
    return _VAR.sub(repl, value)


def parse(text, base_env=None):
    """Return an ordered dict of the variables defined in `text`.

    `${NAME}` and `${NAME:-fallback}` expand from variables defined
    earlier in the file, then from `base_env`. Later definitions of the
    same key win. Single-quoted values are never expanded.
    """
    base = base_env or {}
    result = {}
    for lineno, line in enumerate(text.splitlines(), 1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("export") and stripped[6:7] in (" ", "\t"):
            stripped = stripped[6:].lstrip()
        key_part, eq, rest = stripped.partition("=")
        key = key_part.strip()
        if not eq:
            raise ParseError(lineno, "expected KEY=VALUE")
        if not _KEY.fullmatch(key):
            raise ParseError(lineno, "invalid variable name %r" % key)
        value, expandable = _read_value(rest, lineno)
        if expandable:
            value = _expand(value, {**base, **result})
        result[key] = value
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description="Parse a .env file.")
    parser.add_argument("file", help="path to a .env file, or - for stdin")
    parser.add_argument("--json", action="store_true", help="print JSON instead of KEY=VALUE")
    parser.add_argument("--no-env", action="store_true",
                        help="don't fall back to the process environment for ${VAR}")
    args = parser.parse_args(argv)
    try:
        if args.file == "-":
            text = sys.stdin.read()
        else:
            with open(args.file, encoding="utf-8") as fh:
                text = fh.read()
        values = parse(text, None if args.no_env else dict(os.environ))
    except OSError as err:
        print("dotenv: %s" % err, file=sys.stderr)
        return 2
    except ParseError as err:
        print("dotenv: %s" % err, file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(values, indent=2))
    else:
        for key, value in values.items():
            print("%s=%s" % (key, json.dumps(value)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
