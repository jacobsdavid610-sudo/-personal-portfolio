const test = require("node:test");
const assert = require("node:assert");
const { encode, decode, encodeText, decodeText } = require("../scripts/base64.js");

test("encodes a string with no padding needed (length divisible by 3)", () => {
  assert.strictEqual(encodeText("Man"), "TWFu");
});

test("encodes with one padding character", () => {
  assert.strictEqual(encodeText("Ma"), "TWE=");
});

test("encodes with two padding characters", () => {
  assert.strictEqual(encodeText("M"), "TQ==");
});

test("round-trips arbitrary text, including punctuation and spaces", () => {
  const text = "Hello, World! 123 & stuff.";
  assert.strictEqual(decodeText(encodeText(text)), text);
});

test("round-trips an empty string", () => {
  assert.strictEqual(encodeText(""), "");
  assert.strictEqual(decodeText(""), "");
});

test("round-trips raw bytes including 0x00 and 0xff", () => {
  const bytes = Uint8Array.from([0, 1, 2, 254, 255, 128, 64]);
  assert.deepStrictEqual(Array.from(decode(encode(bytes))), Array.from(bytes));
});

test("matches Node's built-in Buffer base64 implementation as an independent oracle", () => {
  const samples = ["", "a", "ab", "abc", "abcd", "The quick brown fox jumps over the lazy dog."];
  for (const s of samples) {
    const expected = Buffer.from(s, "utf8").toString("base64");
    assert.strictEqual(encodeText(s), expected, `mismatch encoding ${JSON.stringify(s)}`);
  }
});

test("decode ignores non-alphabet characters like whitespace/newlines", () => {
  assert.strictEqual(decodeText("TWFu\n"), "Man");
  assert.strictEqual(decodeText("T WF u"), "Man");
});
