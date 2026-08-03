const test = require("node:test");
const assert = require("node:assert");
const { parseCsv, toObjects } = require("../scripts/csvparse.js");

test("parses simple unquoted rows", () => {
  const rows = parseCsv("a,b,c\n1,2,3\n");
  assert.deepStrictEqual(rows, [
    ["a", "b", "c"],
    ["1", "2", "3"],
  ]);
});

test("handles quoted fields containing commas", () => {
  const rows = parseCsv('name,note\nJan,"hello, world"\n');
  assert.deepStrictEqual(rows, [
    ["name", "note"],
    ["Jan", "hello, world"],
  ]);
});

test("handles escaped quotes inside quoted fields", () => {
  const rows = parseCsv('field\n"she said ""hi"""\n');
  assert.deepStrictEqual(rows, [["field"], ['she said "hi"']]);
});

test("handles embedded newlines inside quoted fields", () => {
  const rows = parseCsv('field\n"line one\nline two"\n');
  assert.deepStrictEqual(rows, [["field"], ["line one\nline two"]]);
});

test("handles CRLF line endings", () => {
  const rows = parseCsv("a,b\r\n1,2\r\n");
  assert.deepStrictEqual(rows, [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("handles a file with no trailing newline", () => {
  const rows = parseCsv("a,b\n1,2");
  assert.deepStrictEqual(rows, [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("toObjects zips header with each row", () => {
  const rows = parseCsv("name,age\nAda,36\nGrace,85\n");
  assert.deepStrictEqual(toObjects(rows), [
    { name: "Ada", age: "36" },
    { name: "Grace", age: "85" },
  ]);
});

test("toObjects returns empty array for empty input", () => {
  assert.deepStrictEqual(toObjects([]), []);
});
