# sexpr.js

A reader and printer for S-expressions: `(define (f x) (+ x 1))` in, a tree
of arrays, numbers, strings and symbols out, and back again. Errors say which
line and column. There is also a pretty printer that breaks long lists the
way a Lisp editor would. No dependencies.

## Why

S-expressions are the smallest useful syntax there is: atoms and lists. The
reader is a good exercise in doing position tracking properly, and the printer
is a nice excuse to write an indenting algorithm. I also wanted something to
read config-like or Lisp-ish files with without pulling in a parser library.

## API

```js
const { parse, print, pretty, Sym, SexprError } = require("./scripts/sexpr.js");

parse("(a 1 \"s\" 'b)");
// [ [ Sym a, 1, 's', [ Sym quote, Sym b ] ] ]   (always an array of top-level forms)

print(parse("(a   (b c) 'd)")[0]);        // "(a (b c) 'd)"
pretty(form, 40);                         // multi-line string, aims for 40 columns
parse("(a (b");                           // throws SexprError: unclosed ( at 1:4
```

- Lists are JS arrays, strings are strings, numbers are numbers, everything
  else bare is a `Sym` (with a `.name`).
- `'x` reads as `(quote x)`, and `print` writes a two-element `quote` list
  back as `'x`.
- `parse` takes a string (anything else is a `TypeError`) and returns every
  top-level form; `SexprError` has `.line` and `.col`.

## CLI usage

```
sexpr.js [--pretty] [-w COLS] [--json] [FILE]

  --pretty  break long lists over several lines
  -w COLS   width --pretty aims for (default 72)
  --json    print the parsed forms as JSON (symbols as {"sym": "name"})
```

Reads `FILE`, or stdin if there is none (or it is `-`), and prints each
top-level form on its own line, normalised.

## Real example

```
$ printf '(define (f x)\n  ; double it\n  (* x 2)) '"'"'(1 2)\n' | node scripts/sexpr.js
(define (f x) (* x 2))
'(1 2)

$ printf '(define (fact n) (if (= n 0) 1 (* n (fact (- n 1)))) (display "hello world this is long"))' \
    | node scripts/sexpr.js --pretty -w 40
(define (fact n)
        (if (= n 0)
            1
            (* n (fact (- n 1))))
        (display "hello world this is long"))

$ printf '(a (b' | node scripts/sexpr.js; echo "exit $?"
sexpr: unclosed ( at 1:4
exit 1
```

## Exit codes

- `0` - success.
- `1` - a syntax error, or the file could not be read.
- `2` - unknown option or bad arguments.

## Design notes

- **One pass, one position.** `next()` is the only thing that moves through
  the text, and it keeps line and column as it goes, so errors can't drift
  from the real position. An unclosed list is reported at its opening
  parenthesis (the useful place); a stray `)` at the `)` itself.
- **Number or symbol.** An atom is a number only if it matches a strict
  pattern; `+`, `-`, `1+`, `1a` and `...` stay symbols. That is what Lisps do,
  and it means `(+ 1 2)` parses without special cases.
- **Delimiters end atoms.** `(a"b"c)` is three things, and `;` starts a
  comment even mid-atom run. Strings may span lines.
- **Strings are strict.** Only `\n \t \r \" \\` are escapes; anything else is
  an error instead of being silently kept.
- **Pretty printing is Lisp-style.** A list that fits stays flat. Otherwise
  the head stays on the first line and the arguments line up underneath the
  first one. A list whose head is itself a list just stacks its items.
  Quoted forms are never broken. An atom wider than the width is left alone,
  which is why the width is a target.
- **Normalising loses comments.** The reader drops them, so the CLI is not a
  safe in-place formatter for files you want to keep annotated.

## Running the tests

```
node --test tests/test_sexpr.js
```

26 tests: atoms and number/symbol edge cases, comments, quote forms, escapes,
exact error positions, print/parse round-trips over 300 random trees, the
pretty printer's layout and width, and the CLI's output and exit codes.
