# semverrange.js

npm-style semver ranges: does `1.4.2` satisfy `^1.2.3 || >=3 <4`? Handles
comparators, caret, tilde, x-ranges, hyphen ranges and `||`, with npm's rule
for prerelease versions. No dependencies.

## Why

`semver.py` in this repo compares versions, but dependency files are written
in ranges, and `^0.2.3` does not mean what `^1.2.3` means. I wanted the
desugaring spelled out in one small file, so I can see exactly what each
shorthand expands to instead of trusting a table in a README.

## API

```js
const { parse, compare, satisfies, maxSatisfying, minSatisfying, validRange } =
  require("./scripts/semverrange.js");

satisfies("1.9.0", "^1.2.3");                       // true
satisfies("2.0.0", "^1.2.3");                       // false
maxSatisfying(["1.2.3", "1.10.0", "2.0.0"], "^1.2.3"); // "1.10.0"
minSatisfying(["1.10.0", "1.2.3"], "^1.2.3");       // "1.2.3"
validRange("~1.2 || 3.x");                          // ">=1.2.0 <1.3.0-0 || >=3.0.0 <4.0.0-0"
validRange("1.x.3");                                // null
compare("1.0.0-beta.2", "1.0.0-beta.11");           // -1
```

- `satisfies` returns `false` for an invalid *version* but throws for an
  invalid *range* (`validRange` gives `null` instead if you want to test).
- `parse` returns `{major, minor, patch, pre}` or `null`. A leading `v` and
  `+build` metadata are accepted; metadata is ignored when comparing.

## CLI usage

```
semverrange.js [--max | --min | --normalize] RANGE [VERSION...]
```

Prints the versions that satisfy `RANGE`, one per line, in the order given.
`--max` / `--min` print only the highest / lowest match; `--normalize` prints
the expanded form of the range and needs no versions.

## Real example

```
$ node scripts/semverrange.js "^1.2.3" 1.2.2 1.2.3 1.9.0 2.0.0 2.0.0-alpha
1.2.3
1.9.0

$ node scripts/semverrange.js --max "^1.2.3" 1.2.3 1.10.0 1.9.0
1.10.0

$ node scripts/semverrange.js --normalize "^0.0.3"
>=0.0.3 <0.0.4-0

$ node scripts/semverrange.js "1.x.3"; echo "exit $?"
semverrange: invalid range "1.x.3"
exit 1
```

## Exit codes

- `0` - something was printed.
- `1` - nothing matched, or the range is invalid.
- `2` - usage error.

## Design notes

- **Everything becomes comparators.** Each shorthand is expanded into plain
  `>=`, `<`, `=` comparators, so there is exactly one matching function. The
  expansion table is the interesting part, and `--normalize` shows it.
- **Caret keeps the leftmost non-zero part fixed.** `^1.2.3` is `<2.0.0`,
  `^0.2.3` is `<0.3.0`, `^0.0.3` is `<0.0.4`; with missing parts, `^0.0` is
  `<0.1.0` and `^0` is `<1.0.0`.
- **Upper bounds end in `-0`.** `^1.2.3` becomes `<2.0.0-0`, because `2.0.0-0`
  is the lowest possible prerelease of 2.0.0. A plain `<2.0.0` would let
  `2.0.0-alpha` in, since it sorts below `2.0.0`.
- **The prerelease rule.** `1.5.0-beta` does not satisfy `^1.2.3`. A
  prerelease only matches a comparator set that itself contains a prerelease
  of the *same* `major.minor.patch`, checked per `||` branch. That is how npm
  keeps you off unstable builds unless you ask.
- **Partial versions on the left of an operator.** `>1.2` means `>=1.3.0`
  (nothing in 1.2.x is greater than "1.2"), and `<=1` means `<2.0.0-0`.
- **Strict.** `1.x.3`, `1.x-beta`, leading zeros and a bare operator are
  errors, not guesses.

## Running the tests

```
node --test tests/test_semverrange.js
```

57 tests: the semver spec's precedence chain, about 40 ranges each with
versions that must and must not match, the prerelease rule, invalid ranges,
the expanded forms (and that they are a fixed point), a brute-force check of
caret and tilde bounds over 64 versions, and the CLI output and exit codes.
