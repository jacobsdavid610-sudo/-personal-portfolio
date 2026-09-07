# semver.py

A [Semantic Versioning](https://semver.org) parser and comparator:
parses `MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]` and compares/sorts
versions by the spec's actual precedence rules — not just a string or
tuple comparison, which gets prerelease ordering and numeric identifiers
wrong. Pure stdlib.

## Why

`"1.0.0-beta.2" < "1.0.0-beta.11"` is true under semver's rules but false
under plain string comparison (`"2" > "1"` lexically beats `"11"`), and a
naive `tuple(int(x) for x in v.split("."))` approach falls over completely
the moment a prerelease or build suffix shows up. Getting this right
matters anywhere versions get sorted or gated on (release scripts, "is
this dependency new enough" checks) — silently wrong ordering there is the
kind of bug that only shows up once someone ships a `-beta.11` after a
`-beta.2`.

## API

```python
from semver import Version, compare, sort_versions

compare("1.2.3", "1.2.4")            # -1
compare("1.0.0", "1.0.0-alpha")      # 1  - a real release outranks any prerelease
compare("1.0.0-beta.2", "1.0.0-beta.11")  # -1 - numeric identifiers compare numerically
compare("1.0.0+build1", "1.0.0+build2")   # 0  - build metadata never affects precedence

sort_versions(["1.0.0", "1.0.0-beta", "2.0.0", "1.0.0-alpha"])
# ["1.0.0-alpha", "1.0.0-beta", "1.0.0", "2.0.0"]

Version.parse("1.2.3-rc.1") < Version.parse("1.2.3")  # True - Version objects are directly orderable
```

- `Version.parse(text) -> Version` — raises `InvalidVersion` on anything
  that isn't a valid semver string (missing a component, a leading zero in
  a numeric component, non-numeric major/minor/patch).
- `Version` instances support `==`, `<`, `<=`, `>`, `>=` directly (via
  `functools.total_ordering`), so `sorted()` and `max()` work on them with
  no extra key function.
- `compare(a, b) -> -1 | 0 | 1` and `sort_versions(strings, reverse=False)
  -> list[str]` are string-in-string-out convenience wrappers around
  `Version` for callers that don't want to hold onto `Version` objects.
- `str(Version.parse(text)) == text` for any valid input — parsing and
  formatting round-trip exactly, prerelease and build included.

## CLI usage

```
semver.py parse <version>
semver.py compare <a> <b>
semver.py sort <version> [<version> ...] [--reverse]
```

## Real example

```
$ semver.py parse 2.1.0-rc.1+exp.sha.5114f85
{"major": 2, "minor": 1, "patch": 0, "prerelease": ["rc", "1"], "build": "exp.sha.5114f85"}

$ semver.py sort 1.0.0 1.0.0-beta 2.0.0 1.0.0-alpha
1.0.0-alpha
1.0.0-beta
1.0.0
2.0.0
```

## Design notes

- **Prerelease identifiers are compared per dot-separated field**, each
  one either as an integer (if it's all digits) or as an ASCII string —
  never as a whole dotted string — which is what makes `beta.2 < beta.11`
  come out correctly instead of following string-sort order.
- **A numeric identifier always has lower precedence than an alphanumeric
  one at the same position** (`1.0.0-alpha.1 < 1.0.0-alpha.beta`), and a
  **longer, matching-prefix prerelease outranks a shorter one**
  (`1.0.0-alpha < 1.0.0-alpha.1`) — both directly from the spec, and both
  fall out for free from how Python compares tuples of `(0, int)` /
  `(1, str)` pairs of differing lengths.
- **Build metadata is parsed and preserved for `str()`, but never affects
  comparison or equality** — per spec, `1.0.0+a` and `1.0.0+b` are the
  same version.
- Validation follows the spec's official regex closely: a leading zero in
  a numeric major/minor/patch component (`01.2.3`) is rejected, matching
  semver.org's own grammar rather than accepting it as an implementation
  shortcut.

## Exit codes

`0` on success; a non-zero uncaught `InvalidVersion` on a malformed
version string.

## Running the tests

```
python -m unittest tests.test_semver -v
```

17 tests: basic parsing, prerelease/build capture (together and
separately), rejecting a missing patch component and a leading zero,
`str()` round-tripping every form exactly, numeric major/minor/patch
comparison, a prerelease outranked by the same release, numeric prerelease
identifiers comparing numerically rather than lexically, an alphanumeric
identifier outranking a numeric one at the same position, more prerelease
fields outranking fewer when the prefix matches, build metadata being
fully ignored for precedence and equality, `Version` objects being
directly orderable with Python's comparison operators, sorting the actual
worked example from semver.org's own precedence spec (shuffled with a
fixed seed) back into its canonical order, and a reverse sort.
