# globmatch.js

Matches paths against shell-style glob patterns: `*`, `?`, `[a-z]`,
`[!x]`, `{a,b}` and `**` for "any number of directories". Each pattern
is compiled to a single anchored `RegExp`. No dependencies, plain Node.

## Why

A lot of the scripts in here end up wanting "only these files" -
anything that walks a tree, counts source files, or reads an ignore
list. Shell globbing only works on files
that exist, and `find -name` doesn't understand `**` or braces. This
works on any list of path strings, so it can filter `git ls-files`
output, a manifest, or paths pulled out of a log.

## API

```js
const { isMatch, filter, createMatcher, compile, expandBraces } = require("./scripts/globmatch.js");

isMatch("src/x/y.js", "src/**/*.js");          // true
isMatch(".env", "*");                          // false
isMatch(".env", "*", { dot: true });           // true
isMatch("src/a.js", "*.js", { basename: true }); // true
filter(["a.js", "b.ts", "c.js"], "*.{js,ts}"); // ["a.js", "b.ts", "c.js"]
const isTest = createMatcher("tests/test_*");  // compile once, call many times
compile("*.[jt]s");                            // the RegExp itself
expandBraces("src/{a,b{1,2}}.js");             // ["src/a.js", "src/b1.js", "src/b2.js"]
```

Syntax:

| Pattern     | Matches                                                  |
|-------------|----------------------------------------------------------|
| `*`         | any run of characters except `/`                         |
| `?`         | one character except `/`                                 |
| `[abc]`, `[a-z]` | one character from the class                        |
| `[!abc]`, `[^abc]` | one character not in the class (never `/`)        |
| `{a,b}`     | either alternative; nests, `{,x}` allows empty           |
| `**`        | as a whole segment: zero or more directories             |
| `\x`        | a literal `x`                                            |

Options (all functions take the same object):

- `dot` - let wildcards match names that start with `.` (default
  `false`).
- `basename` - if the pattern contains no `/`, test it against the last
  path component only, gitignore-style.

`compile` throws on an empty pattern, an invalid class like `[z-a]`, or
a brace pattern that expands past 4096 alternatives.

## CLI usage

```
node scripts/globmatch.js [--dot] [--basename] [-v] <pattern> [path...]
```

Prints the paths that match (or, with `-v`, the ones that don't). With
no paths on the command line it reads them from stdin, one per line,
so it slots in after `git ls-files` or `find`.

## Real example

Run against this repo:

```
$ git ls-files | node scripts/globmatch.js "scripts/{j,u}*.js"
scripts/jsondiff.js
scripts/jsonpath.js
scripts/jwtdecode.js
scripts/jwtverify.js
scripts/uuid.js
$ git ls-files | node scripts/globmatch.js "**/*.sh" | wc -l
42
$ node scripts/globmatch.js --basename "*.md" docs/uuid.md scripts/uuid.js
docs/uuid.md
$ node scripts/globmatch.js "*" .env config.ini
config.ini
$ node scripts/globmatch.js "[z-a]" x
invalid glob "[z-a]": Invalid regular expression: ... Range out of order in character class
```

## Design notes

- **Braces are expanded first, then each result is compiled.** Treating
  `{a,b}` as a regex alternation inline would be shorter, but the
  dotfile rule and `**` both depend on "is this the start of a
  segment?", and `{.a,b}*` makes that awkward to answer mid-pattern.
  Expanding to plain patterns and joining their regexes with `|` keeps
  the compiler simple. The cost is that `{a,b}{c,d}...` grows
  exponentially, hence the 4096 cap rather than hanging.
- **`**` only counts as a whole segment.** `a/**/b` matches `a/b` and
  `a/x/y/b`; `a**b` is just `a*b` and never crosses a `/`. That's how
  bash's `globstar` and gitignore behave, and it stops `src/**.js` from
  silently meaning "every .js anywhere under src".
- **Dotfiles are opt-in, including through `**`.** `*`, `?` and `[...]`
  at the start of a segment won't match a leading `.`, and `**` won't
  descend into `.git/` or `.cache/` - otherwise `**/*.js` drags in
  `.git/hooks` and every tool cache. A literal `.` in the pattern
  (`.*`, `src/.cache/*.js`) still matches, same as the shell.
- **Classes never match `/`.** `a[/]b` and `a[!x]b` don't match `a/b`;
  a negated class is compiled as `[^/...]` and a positive one gets a
  `(?!/)` guard.
- **Unclosed `[` and `{` are literal text**, as in bash, rather than an
  error. `]` straight after `[` or `[!` is a member of the class, so
  `[]a]` works.
- **Leading `./` is stripped** from both sides, because `find .` prints
  `./src/a.js` and nobody writes their pattern that way.
- **Not handled:** extglob (`+(a|b)`, `!(x)`), Windows `\` separators
  (backslash is the escape character here), and case-insensitive
  matching. Patterns with many `*`s in one segment can backtrack, but
  path segments are short enough that it hasn't mattered.

## Exit codes

`0` at least one path printed, `1` nothing printed (like `grep`), `2`
usage error or invalid pattern.

## Running the tests

```
node --test tests/test_globmatch.js
```

15 tests: `*`/`?` staying inside a segment, `**` matching zero or more
directories (and only as a whole segment), dotfiles and dot-directories
being skipped unless `dot` is set, ranges and negated classes, classes
never matching `/`, `]` as a literal class member, unclosed `[`/`{`
being literal, backslash escapes, regex metacharacters being matched
literally, nested and empty-alternative brace expansion with
de-duplication, the expansion cap, leading `./` handling, basename mode
only applying to slash-less patterns, `filter`/`createMatcher` keeping
order, and clear errors for bad patterns. All passing.
