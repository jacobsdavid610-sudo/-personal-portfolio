# ini_parser.py

Parses and serializes simple INI-style config files: `[section]`
headers, `key = value` pairs (`:` also accepted as the separator),
`;`/`#` comments, and optionally quoted values. Pure stdlib.

## API

```python
from ini_parser import parse, dump

sections = parse(open("app.ini").read())
sections["server"]["port"]  # "8080" - everything parses as a string
dump(sections)               # back to INI text
```

- `parse(text) -> {section: {key: value}}` — keys that appear before any
  `[section]` header live under the empty-string section `""`.
- `dump(sections) -> text` — the inverse. The `""` section (if non-empty)
  is written first, unquoted, followed by each other section.

## CLI usage

```
ini_parser.py <inifile> [--json]
```

Without `--json`, re-serializes the parsed config back to INI text
(useful as a normalizer — comments and blank lines are dropped, quoting
is stripped). With `--json`, prints the parsed structure as JSON instead.

## Real example

```
$ cat sample.ini
; sample app config
debug = true

[server]
host = localhost
port = 8080  # dev port

[database]
name = "my app db"
url = postgres://localhost/mydb#replica-1

$ ini_parser.py sample.ini
debug = true

[server]
host = localhost
port = 8080

[database]
name = my app db
url = postgres://localhost/mydb#replica-1
```

Note `port`'s trailing `# dev port` comment (preceded by whitespace) is
stripped, but `url`'s `#replica-1` (immediately after `mydb`, no
preceding whitespace) survives — see the design note below.

## Design notes

- **A comment marker only starts a comment when it's at the start of the
  line or preceded by whitespace.** Without that rule, any unquoted value
  containing `#` or `;` — a URL fragment, a Windows path, a regex — would
  get silently truncated. This is a real, if crude, heuristic rather than
  full shell-style quote-awareness.
- **A later key overwrites an earlier one in the same section**, and a
  repeated `[section]` header merges into the same dict rather than
  starting a fresh one — both match how most INI readers in the wild
  actually behave (last value wins, sections aren't scoped to a single
  contiguous block).
- `dump()` never re-adds quotes, so a value that legitimately needs them
  (leading/trailing whitespace, something that would otherwise look like
  a comment) won't round-trip byte-for-byte — this is a config-file tool
  for typical `key = value` settings, not a lossless format preserver.

## Exit codes

Standard Python behavior: `0` on success, non-zero (via an uncaught
`IniParseError` or missing file) otherwise.

## Running the tests

```
python -m unittest tests.test_ini_parser -v
```

16 tests: basic section/key parsing, keys before any section landing in
the `""` section, full-line and trailing comments being stripped, a
comment marker mid-value (no preceding whitespace) surviving, quoted
values being unquoted, blank lines being ignored, a later key overwriting
an earlier one, a repeated section header merging into the same dict, the
empty-input case, a malformed line raising with the correct line number,
`:` working as an alternate separator, and `dump()`'s basic output,
`""`-section-first ordering, empty-input case, and round-trip fidelity
for plain values.
