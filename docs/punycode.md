# punycode.js

Converts internationalised domain names to and from the ASCII form DNS
actually uses: `münchen.de` <-> `xn--mnchen-3ya.de`. Underneath is
Punycode (RFC 3492), which `encode`/`decode` expose on their own. No
dependencies.

## Why

Anything that compares, logs or allow-lists hostnames meets both spellings
of the same name: a certificate says `xn--mnchen-3ya.de`, a config file
says `münchen.de`, and a naive string compare says they differ. Node's
built-in `punycode` module is deprecated, and `url.domainToASCII` hides the
algorithm. I wanted the algorithm in one readable file, tested against the
RFC's own samples, and a decoder that refuses `xn--` labels that no
encoder would have produced, since two spellings of one name are exactly
how look-alike checks get bypassed.

## API

```js
const { encode, decode, toASCII, toUnicode, PunycodeError } = require("./scripts/punycode.js");

encode("münchen");                 // "mnchen-3ya"   (bare RFC 3492, no prefix)
decode("mnchen-3ya");              // "münchen"
toASCII("München.DE");             // "xn--mnchen-3ya.de"
toASCII("例え.テスト");             // "xn--r8jz45g.xn--zckzah"
toUnicode("xn--mnchen-3ya.de");    // "münchen.de"
toUnicode("xn--abc-.de");          // throws PunycodeError: xn--abc- encodes plain ASCII
```

Bad input throws `PunycodeError`; a non-string throws `TypeError`.

## CLI usage

```
punycode.js [-d] [--raw] [NAME...]

  -d     the other way: xn--mnchen-3ya.de -> münchen.de
  --raw  bare Punycode with no xn-- prefix or dots (RFC 3492 only)
  --     end of options
```

With no NAME, one name is read per line from stdin. Each result goes on its
own line; a name that can't be converted is reported on stderr and the rest
are still converted.

## Real example

```
$ node scripts/punycode.js münchen.de 例え.テスト Bücher.Example
xn--mnchen-3ya.de
xn--r8jz45g.xn--zckzah
xn--bcher-kva.example

$ node scripts/punycode.js -d xn--mnchen-3ya.de xn--e1afmkfd.xn--p1ai xn--abc-.de XN--MNCHEN-3YA.de; echo "exit $?"
münchen.de
пример.рф
punycode: "xn--abc-.de": xn--abc- encodes plain ASCII
münchen.de
exit 1

$ printf 'straße.de\ni❤.ws\n' | node scripts/punycode.js
xn--strae-oqa.de
xn--i-7iq.ws

$ node scripts/punycode.js --raw PorquénopuedensimplementehablarenEspañol
PorqunopuedensimplementehablarenEspaol-fmd56a
```

The last one is sample (J) from RFC 3492. A label that decodes to text in
the wrong form (here `mu` followed by a combining diaeresis instead of a
single `ü`) is refused, even though it decodes without error:

```
$ node scripts/punycode.js -d xn--munchen-gie.de; echo "exit $?"
punycode: "xn--munchen-gie.de": xn--munchen-gie is not a canonical encoding
exit 1
```

## Exit codes

- `0` - every name converted.
- `1` - at least one name couldn't be converted (each is named on stderr).
- `2` - unknown option.

## Design notes

- **The RFC, step for step.** `encode` and `decode` follow sections 6.2
  and 6.3, including the overflow checks. Limits are the RFC's 2^31 - 1, so
  every sum stays an exact integer in a JavaScript number.
- **Code points, not UTF-16 units.** Emoji and other characters outside
  the BMP are one code point each (`😀` is `e28h`). A lone surrogate
  can't be encoded, and `decode` refuses anything that would produce one or
  go past U+10FFFF.
- **Mixed-case annotation isn't written.** RFC sample (I) shows one digit
  in upper case to record that a letter was; the encoder writes every digit
  in lower case, which is what DNS uses. The decoder reads digits in either
  case. ASCII copied into the basic part keeps its case in `encode`.
- **Before encoding, a label is NFC-normalised and lower-cased**, so
  `MÜNCHEN.DE`, `München.De` and `mu` + U+0308 + `nchen.de` all give
  `xn--mnchen-3ya.de`. This is the common subset of the IDNA mapping, not
  all of UTS #46; a test checks it agrees with Node's `url.domainToASCII`
  on 20 real names and 300 random ones in seven scripts.
- **Only canonical `xn--` labels decode.** After decoding, the result is
  encoded again and must give back the same label (ignoring ASCII case).
  That refuses `xn--abc-` (plain ASCII dressed up), upper-case or non-NFC
  results, and anything else that isn't the one encoding of its text, so
  each name has exactly one ASCII spelling. `toASCII` checks labels that
  already carry the prefix the same way.
- **DNS ignores ASCII case**, so `XN--MNCHEN-3YA.de` decodes to
  `münchen.de`, not `MüNCHEN.de`.
- **Dots.** `.` and the three ideographic full stops (U+3002, U+FF0E,
  U+FF61) separate labels. A trailing dot (the root) is kept; an empty
  label anywhere else is an error.
- **Lengths are checked on the ASCII form**: 63 characters per label and
  253 for the name, so a label that's short in Unicode but long once
  encoded is caught.
- Not covered: the IDNA2008 rules on which characters are allowed at all,
  and bidi rules. This converts names; it doesn't police them.

## Running the tests

```
node --test tests/test_punycode.js
```

25 tests: all 19 RFC 3492 samples in both directions (the table was
checked row by row against the RFC text), upper-case digits, ASCII-only
strings, characters outside the BMP, lone surrogates, every failure case
in the decoder (bad digits, truncation, overflow, surrogates and code
points past U+10FFFF, built at the exact boundaries), 500 random
round trips, `toASCII`/`toUnicode` including case, NFC, dots, lengths and
non-canonical labels, agreement with `url.domainToASCII` and
`url.domainToUnicode`, and the CLI including exit codes.
