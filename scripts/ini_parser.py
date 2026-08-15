#!/usr/bin/env python3
"""Parse and serialize simple INI-style config files: [section] headers,
key = value pairs, ; and # comments, optional quoted values. Pure stdlib.
"""

import re

_SECTION_RE = re.compile(r"^\[(?P<name>[^\]]+)\]$")
_KV_RE = re.compile(r"^(?P<key>[^=:]+?)\s*[=:]\s*(?P<value>.*)$")


class IniParseError(ValueError):
    pass


def parse(text):
    """Parse INI text into {section: {key: value}}. Keys that appear
    before any [section] header live under the empty-string section "".
    A later occurrence of the same key (in the same section, including a
    repeated [section] header) overwrites the earlier one."""
    sections = {"": {}}
    current = ""
    for lineno, raw_line in enumerate(text.splitlines(), start=1):
        line = _strip_comment(raw_line).strip()
        if not line:
            continue

        m = _SECTION_RE.match(line)
        if m:
            current = m.group("name")
            sections.setdefault(current, {})
            continue

        m = _KV_RE.match(line)
        if not m:
            raise IniParseError(f"line {lineno}: not a section, comment, or key=value: {raw_line!r}")
        key = m.group("key").strip()
        value = _unquote(m.group("value").strip())
        sections[current][key] = value

    return sections


def dump(sections):
    """Serialize {section: {key: value}} back into INI text. The ""
    section (keys with no header) is written first, unquoted."""
    lines = []
    if sections.get("", {}):
        for key, value in sections[""].items():
            lines.append(f"{key} = {value}")
        lines.append("")

    for section, kv in sections.items():
        if section == "":
            continue
        lines.append(f"[{section}]")
        for key, value in kv.items():
            lines.append(f"{key} = {value}")
        lines.append("")

    if not lines:
        return ""
    return "\n".join(lines).rstrip("\n") + "\n"


def _strip_comment(line):
    # Only treat ';' or '#' as starting a comment when it's at the start
    # of the line or preceded by whitespace - so a literal '#' inside an
    # unquoted value (e.g. a URL fragment) survives. Not shell-quote-aware.
    for marker in (";", "#"):
        idx = line.find(marker)
        while idx != -1:
            if idx == 0 or line[idx - 1].isspace():
                return line[:idx]
            idx = line.find(marker, idx + 1)
    return line


def _unquote(value):
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        return value[1:-1]
    return value


def main():
    import argparse
    import json

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inifile")
    parser.add_argument("--json", action="store_true", help="print the parsed config as JSON instead of re-serialized INI")
    args = parser.parse_args()

    with open(args.inifile) as f:
        sections = parse(f.read())

    if args.json:
        print(json.dumps(sections, indent=2))
    else:
        print(dump(sections), end="")


if __name__ == "__main__":
    main()
