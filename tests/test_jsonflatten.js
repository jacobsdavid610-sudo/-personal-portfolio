const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { flatten, unflatten, parsePath } = require("../scripts/jsonflatten.js");

const CLI = path.join(__dirname, "..", "scripts", "jsonflatten.js");

test("flatten: nested objects use dots", () => {
  assert.deepStrictEqual(flatten({ a: { b: { c: 1 } }, d: 2 }), { "a.b.c": 1, d: 2 });
});

test("flatten: arrays use bracket indexes", () => {
  assert.deepStrictEqual(flatten({ a: [10, { b: 20 }] }), { "a[0]": 10, "a[1].b": 20 });
});

test("flatten: a top-level array", () => {
  assert.deepStrictEqual(flatten([1, [2, 3]]), { "[0]": 1, "[1][0]": 2, "[1][1]": 3 });
});

test("flatten: null, false and 0 are leaves, not dropped", () => {
  assert.deepStrictEqual(flatten({ a: null, b: false, c: 0, d: "" }), {
    a: null, b: false, c: 0, d: "",
  });
});

test("flatten: empty objects and arrays are kept as leaves", () => {
  assert.deepStrictEqual(flatten({ a: {}, b: [], c: { d: {} } }), { a: {}, b: [], "c.d": {} });
});

test("flatten: a top-level scalar uses the empty path", () => {
  assert.deepStrictEqual(flatten(5), { "": 5 });
});

test("flatten: dots, brackets and backslashes in keys are escaped", () => {
  const flat = flatten({ "a.b": 1, "c[0]": 2, "d\\e": 3 });
  assert.deepStrictEqual(flat, { "a\\.b": 1, "c\\[0\\]": 2, "d\\\\e": 3 });
});

test("flatten: an empty key throws instead of producing an unreadable path", () => {
  assert.throws(() => flatten({ "": 1 }), RangeError);
  assert.throws(() => flatten({ a: { "": 1 } }), RangeError);
});

test("flatten: a numeric object key is not confused with an array index", () => {
  assert.deepStrictEqual(flatten({ 0: "x" }), { 0: "x" });
  assert.deepStrictEqual(flatten(["x"]), { "[0]": "x" });
});

test("parsePath: keys and indexes", () => {
  assert.deepStrictEqual(parsePath("a.b[2].c"), ["a", "b", 2, "c"]);
  assert.deepStrictEqual(parsePath("[0][1]"), [0, 1]);
  assert.deepStrictEqual(parsePath("a\\.b"), ["a.b"]);
});

test("parsePath: malformed paths throw SyntaxError", () => {
  for (const bad of ["a.", ".a", "a..b", "a[", "a[x]", "a[-1]", "a[01]", "a]", "a\\"]) {
    assert.throws(() => parsePath(bad), SyntaxError, `should reject ${JSON.stringify(bad)}`);
  }
});

test("unflatten: rebuilds nested objects and arrays", () => {
  assert.deepStrictEqual(unflatten({ "a.b[0]": 1, "a.b[1].c": 2 }), { a: { b: [1, { c: 2 }] } });
});

test("round trip: awkward structures come back identical", () => {
  const samples = [
    { a: { b: [1, { c: null }], "d.e": {}, "k[0]": 2, "w\\x": 3 }, x: [], 0: "zero" },
    [[], {}, [[1]], [{ a: [] }]],
    { "a.b": { c: 1 }, a: { b: { c: 2 } } },
    "just a string",
    null,
  ];
  for (const sample of samples) {
    assert.deepStrictEqual(unflatten(flatten(sample)), sample, JSON.stringify(sample));
  }
});

test("unflatten: conflicting paths throw", () => {
  assert.throws(() => unflatten({ a: 1, "a.b": 2 }), /conflicts/);
  assert.throws(() => unflatten({ "a.b": 2, a: 1 }), /conflicts/);
  assert.throws(() => unflatten({ a: {}, "a.b": 2 }), /conflicts/);
  assert.throws(() => unflatten({ "a.b": 1, "a[0]": 2 }), /conflicts/);
  assert.throws(() => unflatten({ "[0]": 1, a: 2 }), /conflicts/);
});

test("unflatten: a gap in array indexes throws", () => {
  assert.throws(() => unflatten({ "a[0]": 1, "a[2]": 3 }), /missing index 1/);
});

test("unflatten: __proto__ stays an ordinary key", () => {
  const out = unflatten({ "__proto__.polluted": true });
  assert.strictEqual(Object.getPrototypeOf(out), Object.prototype);
  assert.strictEqual({}.polluted, undefined);
  assert.strictEqual(Object.keys(out)[0], "__proto__");
});

test("unflatten: non-object input throws TypeError", () => {
  assert.throws(() => unflatten([1]), TypeError);
  assert.throws(() => unflatten(null), TypeError);
});

test("cli: flattens stdin", () => {
  const r = spawnSync("node", [CLI], { input: '{"a":{"b":1}}', encoding: "utf8" });
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(JSON.parse(r.stdout), { "a.b": 1 });
});

test("cli: --unflatten reverses it", () => {
  const r = spawnSync("node", [CLI, "--unflatten"], { input: '{"a[0]":1}', encoding: "utf8" });
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(JSON.parse(r.stdout), { a: [1] });
});

test("cli: invalid JSON and conflicting paths exit 1", () => {
  const bad = spawnSync("node", [CLI], { input: "{nope", encoding: "utf8" });
  assert.strictEqual(bad.status, 1);
  const clash = spawnSync("node", [CLI, "-u"], { input: '{"a":1,"a.b":2}', encoding: "utf8" });
  assert.strictEqual(clash.status, 1);
  assert.match(clash.stderr, /conflicts/);
});

test("cli: a missing file exits 2", () => {
  const r = spawnSync("node", [CLI, "/no/such/file.json"], { encoding: "utf8" });
  assert.strictEqual(r.status, 2);
});
