# colorconvert.js

Converts colors between hex, RGB, and HSL — pass any one of the three,
get all three back.

## Why

Every frontend/design workflow eventually needs "what's this hex color in
HSL so I can adjust its lightness," and the RGB↔HSL conversion (unlike
hex↔RGB, which is just base-16 parsing) is real, easy-to-get-wrong math —
worth implementing once from the actual formulas rather than reaching for
a color library every time.

## Usage

```js
const { hexToRgb, rgbToHex, rgbToHsl, hslToRgb } = require("./colorconvert.js");

rgbToHsl(hexToRgb("#3498db")); // { h: 204, s: 70, l: 53 }
```

As a CLI:

```
colorconvert.js <hex|rgb|hsl> <value>
```

## Real example

```
$ colorconvert.js hex "#3498db"
hex: #3498db
rgb: 52, 152, 219
hsl: 204, 70%, 53%

$ colorconvert.js hsl "204,70,53"
hex: #3398db
rgb: 51, 152, 219
hsl: 204, 70%, 53%
```

The second example shows expected, harmless rounding drift: HSL is a
lossy representation of RGB at integer precision, so hex → HSL → RGB
doesn't always land on the exact original byte values (52 vs. 51 here) —
converting the *result* back to HSL still gives the same `204, 70%, 53%`,
confirming it's rounding noise, not a conversion bug.

## API

- `hexToRgb(hex)` — accepts `"#rrggbb"`, `"rrggbb"`, `"#rgb"`, or `"rgb"`
  (3-digit shorthand is expanded, e.g. `f0a` → `ff00aa`), case-insensitive.
  Throws on anything else.
- `rgbToHex({ r, g, b })` — 0-255 integers in, lowercase `#rrggbb` out.
  Throws `RangeError` on a non-integer or out-of-0-255 component.
- `rgbToHsl({ r, g, b })` — 0-255 integers in, `{ h, s, l }` out (`h` in
  degrees 0-360, `s`/`l` as whole-number percentages).
- `hslToRgb({ h, s, l })` — the inverse; `h` outside 0-360 is normalized
  (wrapped), not rejected, matching how CSS itself treats hue angles.

## Exit codes (CLI)

- `0` — success.
- `1` — a value that failed to parse/validate for its stated format (e.g.
  an invalid hex string).
- `2` — usage error: missing arguments or an unrecognized format name.

## Design notes

- HSL conversion follows the standard formula directly (max/min channel,
  delta-based hue by which channel is max, saturation from delta vs.
  `1 - |2l - 1|`) rather than a shortcut approximation — it's the same
  math CSS and most color libraries use, so results match what you'd see
  in a browser's color picker.
- Achromatic colors (`delta === 0`: any gray, including black and white)
  short-circuit to hue `0`, saturation `0` rather than computing a
  meaningless hue from three equal channels — the formula would otherwise
  divide by zero.

## Running the tests

```
node --test tests/test_colorconvert.js
```

17 tests: hex parsing (6-digit, no-`#`, 3-digit shorthand expansion,
case-insensitivity, rejection of invalid input), hex formatting (padding,
rejection of out-of-range/non-integer components), RGB→HSL for pure red,
white, black, and neutral gray (each a known, hand-verifiable case), a
real-world color's exact HSL conversion, HSL→RGB round-tripping red/white/
black, hue values outside 0-360 wrapping to their normalized equivalent,
and a full hex→RGB→hex round trip landing on the exact original string.
