const test = require("node:test");
const assert = require("node:assert");
const { diff, deepEqual } = require("../scripts/jsondiff.js");

test("no differences between identical objects", () => {
  assert.deepStrictEqual(diff({ a: 1, b: 2 }, { a: 1, b: 2 }), []);
});

test("detects an added key", () => {
  const changes = diff({ a: 1 }, { a: 1, b: 2 });
  assert.deepStrictEqual(changes, [{ type: "added", path: "b", value: 2 }]);
});

test("detects a removed key", () => {
  const changes = diff({ a: 1, b: 2 }, { a: 1 });
  assert.deepStrictEqual(changes, [{ type: "removed", path: "b", value: 2 }]);
});

test("detects a changed primitive value", () => {
  const changes = diff({ a: 1 }, { a: 2 });
  assert.deepStrictEqual(changes, [{ type: "changed", path: "a", from: 1, to: 2 }]);
});

test("recurses into nested objects with dotted paths", () => {
  const changes = diff({ user: { name: "Ada" } }, { user: { name: "Grace" } });
  assert.deepStrictEqual(changes, [
    { type: "changed", path: "user.name", from: "Ada", to: "Grace" },
  ]);
});

test("diffs arrays index-by-index, including length changes", () => {
  const changes = diff([1, 2, 3], [1, 9, 3, 4]);
  assert.deepStrictEqual(changes, [
    { type: "changed", path: "1", from: 2, to: 9 },
    { type: "added", path: "3", value: 4 },
  ]);
});

test("handles a value changing type entirely (object -> array)", () => {
  const changes = diff({ a: { x: 1 } }, { a: [1] });
  assert.deepStrictEqual(changes, [
    { type: "changed", path: "a", from: { x: 1 }, to: [1] },
  ]);
});

test("deepEqual matches diff having zero changes", () => {
  assert.strictEqual(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), true);
  assert.strictEqual(deepEqual({ a: 1 }, { a: 2 }), false);
});
