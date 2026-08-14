const test = require("node:test");
const assert = require("node:assert");
const { parse, stringify } = require("../scripts/querystring.js");

test("parse: single key=value pair", () => {
  assert.deepStrictEqual(parse("a=1"), { a: "1" });
});

test("parse: multiple distinct keys", () => {
  assert.deepStrictEqual(parse("a=1&b=2"), { a: "1", b: "2" });
});

test("parse: repeated key collects into an array, in order", () => {
  assert.deepStrictEqual(parse("tag=js&tag=node&tag=cli"), {
    tag: ["js", "node", "cli"],
  });
});

test("parse: leading '?' is stripped", () => {
  assert.deepStrictEqual(parse("?a=1&b=2"), { a: "1", b: "2" });
});

test("parse: a key with no '=' is present with an empty string value", () => {
  assert.deepStrictEqual(parse("a=1&flag"), { a: "1", flag: "" });
});

test("parse: percent-encoded and '+' characters are decoded", () => {
  assert.deepStrictEqual(parse("q=hello+world&sym=%26%3D"), {
    q: "hello world",
    sym: "&=",
  });
});

test("parse: empty string returns an empty object", () => {
  assert.deepStrictEqual(parse(""), {});
  assert.deepStrictEqual(parse("?"), {});
});

test("parse: non-string input throws a TypeError", () => {
  assert.throws(() => parse(123), TypeError);
});

test("stringify: basic object", () => {
  assert.strictEqual(stringify({ a: "1", b: "2" }), "a=1&b=2");
});

test("stringify: array value becomes repeated key=value pairs", () => {
  assert.strictEqual(stringify({ tag: ["js", "node"] }), "tag=js&tag=node");
});

test("stringify: null and undefined values are skipped entirely", () => {
  assert.strictEqual(stringify({ a: "1", b: null, c: undefined, d: "2" }), "a=1&d=2");
});

test("stringify: special characters are percent-encoded, spaces become '+'", () => {
  assert.strictEqual(stringify({ q: "hello world", sym: "&=" }), "q=hello+world&sym=%26%3D");
});

test("stringify: non-plain-object input throws a TypeError", () => {
  assert.throws(() => stringify(null), TypeError);
  assert.throws(() => stringify("a=1"), TypeError);
  assert.throws(() => stringify(["a", "b"]), TypeError);
});

test("round-trip: parse(stringify(obj)) reproduces the original for string/array values", () => {
  const original = { q: "hello world", tag: ["js", "node"], flag: "" };
  assert.deepStrictEqual(parse(stringify(original)), original);
});
