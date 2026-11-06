# shellsplit.js

Splits a command line into words the way a POSIX shell does, and quotes
words back into a line that splits to the same thing. Nothing is expanded:
`$HOME`, `*` and backticks are just characters. No dependencies.

## Why

Whenever a program takes a command as one string (a config file, an env var,
a `--exec` flag) something has to turn it into an argument list, and
`str.split(" ")` breaks on the first quoted space. The reverse matters just as
much: building a command line from user-supplied words without opening a
shell-injection hole. I wanted both halves in one small file, with the
guarantee that `split(join(words))` always gives `words` back.

## API

```js
const { split, quote, join } = require("./scripts/shellsplit.js");

split(`git commit -m 'fix: it'\\''s done'`);
// ["git", "commit", "-m", "fix: it's done"]

quote("my file");        // 'my file'
quote("it's");           // 'it'\''s'
quote("plain");          // plain
quote("");               // ''
join(["ls", "-l", "my file"]);   // ls -l 'my file'
```

- `split(line)` - the words in `line`. Throws a `SyntaxError` naming the
  position for an unterminated quote or a trailing backslash, and a
  `TypeError` for a non-string.
- `quote(word)` - one word, quoted only if it needs it.
- `join(words)` - `words` quoted and joined with single spaces.

## CLI usage

```
shellsplit.js split [STRING]   print the words as a JSON array (stdin if no STRING)
shellsplit.js quote WORD...    print WORDs quoted as one command line
```

## Real example

```
$ node scripts/shellsplit.js split "rsync -av --exclude='*.tmp' \"my dir/\" host:backup"
["rsync","-av","--exclude=*.tmp","my dir/","host:backup"]

$ node scripts/shellsplit.js quote echo "it's" "a b" ""
echo 'it'\''s' 'a b' ''
```

## Exit codes

- `0` - success.
- `1` - `split` was given text with an unterminated quote or a trailing
  backslash (the message names the position).
- `2` - usage error.

## Design notes

- **Single quotes are literal.** Everything up to the next `'` is kept as
  is, backslashes included. There is no way to put a `'` inside, which is why
  `quote` closes the quote, writes `\'` and reopens it.
- **Inside double quotes only `\"`, `\\`, `\$`, `` \` `` and backslash-newline
  are escapes.** Any other backslash stays, so `"C:\dir"` is what it looks
  like.
- **Outside quotes a backslash escapes the next character**, and
  backslash-newline is a line continuation that does not end the word.
- **Quoted and bare parts glue together** (`a'b c'd` is one word), which is
  how `--name='Bob Smith'` works.
- **An empty quote is an empty word** (`''`), tracked separately from "the
  word has characters", otherwise `rm ''` and `rm` would look the same.
- **No expansion.** No variables, globs, tilde, braces, command substitution
  or comments (`#` is an ordinary character). A splitter that expanded things
  would need an environment and a filesystem to be meaningful.
- **`quote` leaves `[A-Za-z0-9_@%+=:,./-]` bare** and single-quotes anything
  else, so the output stays readable for ordinary words and is safe for the
  rest.
- **Unterminated input is an error**, not a best guess. A forgotten quote in a
  command line should be noticed.
- **The round trip is tested**, for a list of awkward words and for every
  string up to four characters over an alphabet of quotes, backslashes,
  spaces, `$` and newline.

## Running the tests

```
node --test tests/test_shellsplit.js
```

35 tests: plain words, each kind of quoting and escaping, joined parts,
empty words, no expansion, line continuations, unterminated input, Unicode,
`quote` for safe, risky and quote-containing words, the round trips, and the
CLI including exit codes.
