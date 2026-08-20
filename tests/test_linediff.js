const test = require("node:test");
const assert = require("node:assert");
const { diffLines, formatUnified, hasChanges } = require("../scripts/linediff.js");

test("identical inputs produce only 'same' ops", () => {
  const ops = diffLines(["a", "b", "c"], ["a", "b", "c"]);
  assert.deepStrictEqual(
    ops.map((o) => o.type),
    ["same", "same", "same"]
  );
  assert.strictEqual(hasChanges(ops), false);
});

test("a single added line in the middle", () => {
  const ops = diffLines(["a", "c"], ["a", "b", "c"]);
  assert.deepStrictEqual(
    ops.map((o) => [o.type, o.line]),
    [
      ["same", "a"],
      ["add", "b"],
      ["same", "c"],
    ]
  );
});

test("a single deleted line in the middle", () => {
  const ops = diffLines(["a", "b", "c"], ["a", "c"]);
  assert.deepStrictEqual(
    ops.map((o) => [o.type, o.line]),
    [
      ["same", "a"],
      ["del", "b"],
      ["same", "c"],
    ]
  );
});

test("a replaced line shows as a delete followed by an add", () => {
  const ops = diffLines(["hello"], ["goodbye"]);
  assert.deepStrictEqual(
    ops.map((o) => o.type),
    ["del", "add"]
  );
});

test("completely disjoint inputs: everything deleted then everything added", () => {
  const ops = diffLines(["x", "y"], ["p", "q"]);
  assert.deepStrictEqual(
    ops.map((o) => o.type),
    ["del", "del", "add", "add"]
  );
});

test("empty vs non-empty: every line is an addition", () => {
  const ops = diffLines([], ["a", "b"]);
  assert.deepStrictEqual(
    ops.map((o) => [o.type, o.line]),
    [
      ["add", "a"],
      ["add", "b"],
    ]
  );
});

test("non-empty vs empty: every line is a deletion", () => {
  const ops = diffLines(["a", "b"], []);
  assert.deepStrictEqual(
    ops.map((o) => [o.type, o.line]),
    [
      ["del", "a"],
      ["del", "b"],
    ]
  );
});

test("both empty: no ops, no changes", () => {
  const ops = diffLines([], []);
  assert.deepStrictEqual(ops, []);
  assert.strictEqual(hasChanges(ops), false);
});

test("hasChanges is true when there is at least one add or del", () => {
  assert.strictEqual(hasChanges(diffLines(["a"], ["a", "b"])), true);
  assert.strictEqual(hasChanges(diffLines(["a"], ["a"])), false);
});

test("formatUnified prefixes lines with +, -, and space", () => {
  const ops = diffLines(["a", "b", "c"], ["a", "x", "c"]);
  const lines = formatUnified(ops, 3);
  assert.deepStrictEqual(lines, [" a", "-b", "+x", " c"]);
});

test("formatUnified with zero context omits unchanged surrounding lines", () => {
  const ops = diffLines(["a", "b", "c"], ["a", "x", "c"]);
  const lines = formatUnified(ops, 0);
  assert.deepStrictEqual(lines, ["-b", "+x"]);
});

test("formatUnified with no changes at all produces no output", () => {
  const ops = diffLines(["a", "b"], ["a", "b"]);
  assert.deepStrictEqual(formatUnified(ops), []);
});

test("longer realistic diff keeps LCS-shared lines intact around a change", () => {
  const a = ["one", "two", "three", "four", "five"];
  const b = ["one", "two", "THREE", "four", "five"];
  const ops = diffLines(a, b);
  assert.deepStrictEqual(
    ops.map((o) => [o.type, o.line]),
    [
      ["same", "one"],
      ["same", "two"],
      ["del", "three"],
      ["add", "THREE"],
      ["same", "four"],
      ["same", "five"],
    ]
  );
});
