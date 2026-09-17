const test = require("node:test");
const assert = require("node:assert");
const { deepEqual } = require("../scripts/deepequal.js");

test("primitives: equal values of the same type are equal", () => {
  assert.strictEqual(deepEqual(1, 1), true);
  assert.strictEqual(deepEqual("a", "a"), true);
  assert.strictEqual(deepEqual(true, true), true);
  assert.strictEqual(deepEqual(null, null), true);
  assert.strictEqual(deepEqual(undefined, undefined), true);
});

test("primitives: different types are never equal, even with the same string form", () => {
  assert.strictEqual(deepEqual(1, "1"), false);
  assert.strictEqual(deepEqual(null, undefined), false);
  assert.strictEqual(deepEqual(0, false), false);
});

test("primitives: NaN equals NaN, unlike ===", () => {
  assert.strictEqual(deepEqual(NaN, NaN), true);
});

test("primitives: +0 and -0 are not equal, unlike ===", () => {
  assert.strictEqual(deepEqual(0, -0), false);
  assert.strictEqual(deepEqual(-0, -0), true);
});

test("objects: same keys and values in a different order are equal", () => {
  assert.strictEqual(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
});

test("objects: a missing key is not equal to an explicit undefined value", () => {
  assert.strictEqual(deepEqual({ a: 1 }, { a: 1, b: undefined }), false);
});

test("objects: an extra key makes objects unequal", () => {
  assert.strictEqual(deepEqual({ a: 1 }, { a: 1, b: 2 }), false);
});

test("objects: nested structures compare recursively", () => {
  const a = { x: { y: [1, 2, { z: "deep" }] } };
  const b = { x: { y: [1, 2, { z: "deep" }] } };
  assert.strictEqual(deepEqual(a, b), true);
  b.x.y[2].z = "different";
  assert.strictEqual(deepEqual(a, b), false);
});

test("arrays: same elements in a different order are not equal", () => {
  assert.strictEqual(deepEqual([1, 2, 3], [3, 2, 1]), false);
});

test("arrays: different lengths are never equal", () => {
  assert.strictEqual(deepEqual([1, 2], [1, 2, 3]), false);
});

test("arrays: an array and an object with the same numeric keys are not equal", () => {
  assert.strictEqual(deepEqual([1, 2], { 0: 1, 1: 2 }), false);
});

test("dates: compared by their timestamp, not by reference", () => {
  assert.strictEqual(deepEqual(new Date(2020, 0, 1), new Date(2020, 0, 1)), true);
  assert.strictEqual(deepEqual(new Date(2020, 0, 1), new Date(2020, 0, 2)), false);
});

test("regexps: compared by source and flags", () => {
  assert.strictEqual(deepEqual(/abc/gi, /abc/gi), true);
  assert.strictEqual(deepEqual(/abc/g, /abc/i), false);
  assert.strictEqual(deepEqual(/abc/, /abd/), false);
});

test("sets: equal regardless of insertion order", () => {
  assert.strictEqual(deepEqual(new Set([1, 2, 3]), new Set([3, 1, 2])), true);
  assert.strictEqual(deepEqual(new Set([1, 2]), new Set([1, 2, 3])), false);
});

test("sets: object elements are matched by deep equality, not by reference", () => {
  assert.strictEqual(deepEqual(new Set([{ a: 1 }]), new Set([{ a: 1 }])), true);
  assert.strictEqual(deepEqual(new Set([{ a: 1 }, { a: 1 }]), new Set([{ a: 1 }])), false);
});

test("maps: equal regardless of insertion order", () => {
  const a = new Map([["x", 1], ["y", 2]]);
  const b = new Map([["y", 2], ["x", 1]]);
  assert.strictEqual(deepEqual(a, b), true);
});

test("maps: a differing value for a shared key makes them unequal", () => {
  const a = new Map([["x", 1]]);
  const b = new Map([["x", 2]]);
  assert.strictEqual(deepEqual(a, b), false);
});

test("circular references: self-referencing objects with the same shape are equal", () => {
  const a = { name: "a" };
  a.self = a;
  const b = { name: "a" };
  b.self = b;
  assert.strictEqual(deepEqual(a, b), true);
});

test("circular references: mutually referencing objects with the same shape are equal", () => {
  const a = { name: "shared" };
  const b = { name: "shared" };
  a.other = b;
  b.other = a;
  const x = { name: "shared" };
  const y = { name: "shared" };
  x.other = y;
  y.other = x;
  assert.strictEqual(deepEqual(a, x), true);
});

test("circular references: a cycle does not cause infinite recursion or a stack overflow", () => {
  const a = { list: [] };
  a.list.push(a);
  const b = { list: [] };
  b.list.push(b);
  assert.doesNotThrow(() => deepEqual(a, b));
});
