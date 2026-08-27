const test = require("node:test");
const assert = require("node:assert");
const { hexToRgb, rgbToHex, rgbToHsl, hslToRgb } = require("../scripts/colorconvert.js");

test("hexToRgb parses a 6-digit hex color", () => {
  assert.deepStrictEqual(hexToRgb("#3498db"), { r: 52, g: 152, b: 219 });
});

test("hexToRgb works without the leading #", () => {
  assert.deepStrictEqual(hexToRgb("3498db"), { r: 52, g: 152, b: 219 });
});

test("hexToRgb expands a 3-digit shorthand", () => {
  assert.deepStrictEqual(hexToRgb("#f0a"), { r: 255, g: 0, b: 170 });
});

test("hexToRgb is case-insensitive", () => {
  assert.deepStrictEqual(hexToRgb("#3498DB"), { r: 52, g: 152, b: 219 });
});

test("hexToRgb rejects an invalid hex string", () => {
  assert.throws(() => hexToRgb("#zzzzzz"), /Invalid hex color/);
  assert.throws(() => hexToRgb("#12345"), /Invalid hex color/);
});

test("rgbToHex formats a lowercase 6-digit hex string", () => {
  assert.strictEqual(rgbToHex({ r: 52, g: 152, b: 219 }), "#3498db");
});

test("rgbToHex pads single-digit hex components with a leading zero", () => {
  assert.strictEqual(rgbToHex({ r: 0, g: 5, b: 255 }), "#0005ff");
});

test("rgbToHex rejects out-of-range or non-integer components", () => {
  assert.throws(() => rgbToHex({ r: 256, g: 0, b: 0 }), RangeError);
  assert.throws(() => rgbToHex({ r: -1, g: 0, b: 0 }), RangeError);
  assert.throws(() => rgbToHex({ r: 1.5, g: 0, b: 0 }), RangeError);
});

test("rgbToHsl: pure red is hue 0, full saturation, mid lightness", () => {
  assert.deepStrictEqual(rgbToHsl({ r: 255, g: 0, b: 0 }), { h: 0, s: 100, l: 50 });
});

test("rgbToHsl: white is zero saturation, full lightness", () => {
  assert.deepStrictEqual(rgbToHsl({ r: 255, g: 255, b: 255 }), { h: 0, s: 0, l: 100 });
});

test("rgbToHsl: black is zero saturation, zero lightness", () => {
  assert.deepStrictEqual(rgbToHsl({ r: 0, g: 0, b: 0 }), { h: 0, s: 0, l: 0 });
});

test("rgbToHsl: a neutral gray has zero saturation regardless of lightness", () => {
  assert.deepStrictEqual(rgbToHsl({ r: 128, g: 128, b: 128 }), { h: 0, s: 0, l: 50 });
});

test("rgbToHsl: a known real-world color converts correctly", () => {
  assert.deepStrictEqual(rgbToHsl({ r: 52, g: 152, b: 219 }), { h: 204, s: 70, l: 53 });
});

test("hslToRgb: pure red round-trips from hsl(0, 100%, 50%)", () => {
  assert.deepStrictEqual(hslToRgb({ h: 0, s: 100, l: 50 }), { r: 255, g: 0, b: 0 });
});

test("hslToRgb: white and black round-trip from their hsl forms", () => {
  assert.deepStrictEqual(hslToRgb({ h: 0, s: 0, l: 100 }), { r: 255, g: 255, b: 255 });
  assert.deepStrictEqual(hslToRgb({ h: 0, s: 0, l: 0 }), { r: 0, g: 0, b: 0 });
});

test("hslToRgb wraps a hue outside 0-360 the same as its normalized equivalent", () => {
  assert.deepStrictEqual(hslToRgb({ h: 360, s: 100, l: 50 }), hslToRgb({ h: 0, s: 100, l: 50 }));
  assert.deepStrictEqual(hslToRgb({ h: -60, s: 100, l: 50 }), hslToRgb({ h: 300, s: 100, l: 50 }));
});

test("hex -> rgb -> hex round-trips exactly for an arbitrary color", () => {
  const original = "#3498db";
  assert.strictEqual(rgbToHex(hexToRgb(original)), original);
});
