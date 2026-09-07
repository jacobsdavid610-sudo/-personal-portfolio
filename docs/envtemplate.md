# envtemplate.sh

Renders a template file's `${VAR}` placeholders from the environment,
writing the result to stdout. Unlike plain `envsubst`, an **unset**
variable is a hard error by default — a set-but-empty value is fine, but a
typo'd placeholder name shouldn't silently render as an empty string in
whatever config comes out the other end. No dependencies.

## Why

`envsubst` (and most hand-rolled equivalents) treat "unset" and "set to
empty" identically: both just vanish. That's exactly backwards for a
config template — `${DB_PASSWORD}` resolving to nothing because the
variable name was misspelled is a much worse failure mode than a template
that refuses to render at all, because the former produces a
plausible-looking config file that's subtly, silently wrong.

## Usage

```
envtemplate.sh <template-file> [--only VAR,VAR,...] [--allow-unset]
```

- Every `${VAR_NAME}` found in the template is substituted from the
  environment by default.
- `--only VAR,VAR,...` restricts substitution to just the named
  variables — anything else referenced in the template is left as literal
  `${OTHER}` text, untouched, and isn't subject to the missing-variable
  check either. Mirrors real `envsubst`'s `"$VARS"` argument, for when a
  template legitimately contains `${1}`-style text you don't want touched.
- `--allow-unset` falls back to `envsubst`'s normal behavior: a missing
  variable renders as an empty string instead of failing.
- Output goes to stdout, so pipe/redirect it to the real config file.

## Real example

```
$ cat config.tpl
host: ${DB_HOST}
name: ${DB_NAME}

$ DB_HOST=localhost envtemplate.sh config.tpl
ERROR: unset variable(s) referenced in config.tpl: DB_NAME
$ echo $?
1
```

## Design notes

- **Unset vs. empty is checked with `[ -v "$var" ]`**, not `[ -n
  "$var" ]` — a variable deliberately set to `""` is a legitimate value
  (an optional field, a flag meant to be blank) and shouldn't trip the
  same error as a variable that was never set at all.
- **Substitution is done with bash's own `${string//search/replace}`
  parameter expansion**, not `sed`, specifically to avoid the classic
  footgun of a substituted value containing `&`, `/`, or a backslash being
  misinterpreted as a `sed` backreference or delimiter — bash's pattern
  substitution treats both the search and replacement as literal text
  here (`${VAR}` contains no glob metacharacters), so an arbitrary
  secret value can't corrupt the output or the substitution itself.
- **`--only` genuinely excludes out-of-scope placeholders from the
  missing-variable check**, not just from substitution — a template
  referencing `${SOME_OTHER_TOOLS_VAR}` that this invocation doesn't care
  about shouldn't fail just because that variable happens to be unset in
  this environment.

## Exit codes

`0` on success. `1` if a referenced variable is unset and `--allow-unset`
wasn't given. `2` for a usage error or a missing template file.

## Running the tests

```
bash tests/test_envtemplate.sh
```

15 tests, against real scratch template files and a real environment (no
mocking needed): substitution with a set-but-empty value succeeding, a
genuinely unset variable failing with its name in the error message,
`--allow-unset` recovering by rendering it empty, `--only` substituting
the named variable while leaving an out-of-scope placeholder as literal
text, an unset variable outside `--only`'s scope correctly not tripping
the missing-variable check, a template with no placeholders passing
through unchanged, a missing template file, and a bare invocation with no
arguments at all being a usage error.
