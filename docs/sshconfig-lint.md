# sshconfig-lint.sh

Lints an OpenSSH client config file for footguns that `ssh` itself won't
error on — it'll just quietly do the wrong thing. No dependencies beyond
bash/coreutils.

## Why

`ssh_config` resolves options first-match-wins per parameter, top to
bottom, across every `Host` block whose pattern matches — it does not
merge with "most specific wins" the way you'd expect from, say, CSS
specificity. That one rule produces two classic, silent misconfigurations:
putting `Host *` before a specific host locks in any option the wildcard
block already set, so the specific block's version of that option is
simply never seen; and declaring the same `Host` pattern twice means the
second block is dead for every option the first one already set. Neither
produces a warning from `ssh` itself — you just get mysteriously wrong
behavior (wrong user, wrong key, wrong port) and have to reverse-engineer
which block actually won. A referenced `IdentityFile` that doesn't exist
is a third, unrelated way the same config file quietly fails: `ssh` just
skips a missing key and tries the next auth method, so the fix (add the
key back, or fix the typo'd path) is easy to miss without a workflow that
actually checks paths exist.

## What it checks

- **SHADOWED** — a specific `Host` block declared after a `Host *`
  block. Anything the wildcard already set for that option wins, no
  matter what the specific block says.
- **DUPLICATE** — the exact same `Host` pattern declared more than once.
  The second declaration is dead for any option the first one already
  set.
- **MISSING** — an `IdentityFile` path that doesn't exist on disk once
  `~` is expanded to `$HOME` and a relative path is resolved against the
  config file's own directory (not the current working directory).

## CLI usage

```
sshconfig-lint.sh [config-file]
```

Defaults to `~/.ssh/config`. Prints one line per finding plus a trailing
count.

## Real example

```
$ cat ~/.ssh/config
Host *
    User alice

Host example.com
    HostName example.com

Host example.com
    Port 2222

$ sshconfig-lint.sh
SHADOWED: line 4: 'Host example.com' comes after the wildcard 'Host *' on line 1 - any option already set there wins over this block
SHADOWED: line 7: 'Host example.com' comes after the wildcard 'Host *' on line 1 - any option already set there wins over this block
DUPLICATE: line 7: 'Host example.com' was already declared on line 4 - this block is dead for any option the first one already set

2 finding(s).
```

## Design notes

- **`Host *` is checked by exact pattern match (`"*"`), not by a regex
  guess at "looks like a wildcard".** `ssh_config` supports much richer
  glob patterns (`Host *.example.com`, `Host !bastion *`), and trying to
  classify all of those as "wildcard enough to shadow everything" would
  produce a lot of false positives for patterns that only overlap with a
  few hosts. The one pattern that's unambiguously "matches literally
  everything" is a bare `*`, so that's the only one flagged.
- **`Key=Value` and `Key Value` are both parsed**, since real-world
  `ssh_config` files use either interchangeably (OpenSSH's parser
  accepts both) — checked directly with a `Host=example.com` /
  `IdentityFile=path` config in the tests, not just the space-separated
  form.
- **A relative `IdentityFile` path resolves against the config file's
  own directory, not the shell's current working directory.** Config
  files reference keys relative to where the config lives (commonly
  `~/.ssh/`), and the linter can reasonably be invoked from anywhere —
  resolving against `$PWD` instead would falsely flag every relative
  path as missing unless the linter happened to be run from inside
  `~/.ssh`.
- **No quoted-value or line-continuation support.** `ssh_config` allows
  quoting a value that contains spaces (`IdentityFile "path with
  spaces"`); this lint treats the rest of the line after the key as a
  single literal value and doesn't strip quotes. A deliberate scope
  limit, not an oversight — most real configs don't need it, and a
  false MISSING/DUPLICATE on a quoted edge case is a much smaller cost
  than a full ssh_config-grammar parser for a lint script.

## Exit codes

`0` if no findings, `1` if there's at least one finding, `2` for a
missing/unreadable config file or bad usage.

## Running the tests

```
bash tests/test_sshconfig-lint.sh
```

11 assertions: a clean config (specific host before the trailing
wildcard, no duplicates, key present) reporting zero findings and
exiting 0; a messy config catching SHADOWED, DUPLICATE, and MISSING all
in the same run with the right line numbers, exiting 1; a relative
`IdentityFile` path resolving against the config file's directory rather
than the working directory (checked by pointing `$HOME` somewhere the
file couldn't possibly be found, so the test would fail loudly if
resolution silently fell back to `$HOME`); comment lines and blank lines
not being mistaken for directives; `Key=Value` form matching `Key Value`
form; and a nonexistent config file or more than one argument being
rejected. All passing. Also ran the CLI by hand against scratch configs
covering the shadowed/duplicate/missing cases together and a clean
config before committing.
