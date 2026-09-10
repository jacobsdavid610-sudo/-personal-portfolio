const test = require("node:test");
const assert = require("node:assert");
const { parse, stringify } = require("../scripts/queryparams.js");

test("parses plain scalar key/value pairs", () => {
  assert.deepStrictEqual(parse("a=1&b=2"), { a: "1", b: "2" });
});

test("a repeated key collapses into an array", () => {
  assert.deepStrictEqual(parse("a=1&a=2"), { a: ["1", "2"] });
});

test("a repeated key three or more times keeps accumulating", () => {
  assert.deepStrictEqual(parse("a=1&a=2&a=3"), { a: ["1", "2", "3"] });
});

test("bracket notation also collapses into an array", () => {
  assert.deepStrictEqual(parse("a[]=1&a[]=2"), { a: ["1", "2"] });
});

test("a key with no '=' is treated as an empty-string value", () => {
  assert.deepStrictEqual(parse("flag"), { flag: "" });
});

test("percent-encoded characters are decoded", () => {
  assert.deepStrictEqual(parse("name=John%20Doe"), { name: "John Doe" });
});

test("a '+' decodes to a space, per application/x-www-form-urlencoded", () => {
  assert.deepStrictEqual(parse("q=a+b"), { q: "a b" });
});

test("a leading '?' is stripped", () => {
  assert.deepStrictEqual(parse("?a=1"), { a: "1" });
});

test("an empty string parses to an empty object", () => {
  assert.deepStrictEqual(parse(""), {});
});

test("stringify produces plain key=value pairs joined with '&'", () => {
  assert.strictEqual(stringify({ a: "1", b: "2" }), "a=1&b=2");
});

test("stringify repeats the key for an array value by default", () => {
  assert.strictEqual(stringify({ a: ["1", "2"] }), "a=1&a=2");
});

test("stringify with arrayFormat 'brackets' appends [] to the key", () => {
  assert.strictEqual(stringify({ a: ["1", "2"] }, { arrayFormat: "brackets" }), "a%5B%5D=1&a%5B%5D=2");
});

test("stringify encodes a space as '+' to match how parse decodes it", () => {
  assert.strictEqual(stringify({ name: "Ada Lovelace" }), "name=Ada+Lovelace");
});

test("stringify percent-encodes delimiter characters in a value", () => {
  const qs = stringify({ q: "a&b=c" });
  assert.strictEqual(qs, "q=a%26b%3Dc");
});

test("parse and stringify round-trip a mixed scalar/array object", () => {
  const original = { name: "John Doe", tags: ["x", "y"], q: "a&b=c" };
  assert.deepStrictEqual(parse(stringify(original)), original);
});
