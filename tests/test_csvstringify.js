const test = require("node:test");
const assert = require("node:assert");
const { quoteField, stringifyRow, stringify, fromObjects, stringifyObjects } = require("../scripts/csvstringify.js");
const { parseCsv, toObjects } = require("../scripts/csvparse.js");

test("plain values are left unquoted", () => {
  assert.strictEqual(quoteField("plain"), "plain");
  assert.strictEqual(quoteField(42), "42");
});

test("null and undefined become an empty field", () => {
  assert.strictEqual(quoteField(null), "");
  assert.strictEqual(quoteField(undefined), "");
});

test("a value containing a comma is quoted", () => {
  assert.strictEqual(quoteField("has,comma"), '"has,comma"');
});

test("a value containing a double quote is quoted and the quote is doubled", () => {
  assert.strictEqual(quoteField('has"quote'), '"has""quote"');
});

test("a value containing a newline or CR is quoted", () => {
  assert.strictEqual(quoteField("line\nbreak"), '"line\nbreak"');
  assert.strictEqual(quoteField("line\rbreak"), '"line\rbreak"');
});

test("stringifyRow joins quoted fields with commas", () => {
  assert.strictEqual(stringifyRow(["a", "b,c", "d"]), 'a,"b,c",d');
});

test("stringify joins rows with CRLF and ends with a trailing CRLF", () => {
  const text = stringify([
    ["a", "b"],
    ["1", "2"],
  ]);
  assert.strictEqual(text, "a,b\r\n1,2\r\n");
});

test("stringify of an empty row list returns an empty string", () => {
  assert.strictEqual(stringify([]), "");
});

test("stringify round-trips through parseCsv unchanged", () => {
  const rows = [
    ["name", "note"],
    ["Ada", 'loves "commas, and quotes"'],
    ["Bob", "plain"],
  ];
  const text = stringify(rows);
  assert.deepStrictEqual(parseCsv(text), rows);
});

test("fromObjects infers headers from the union of keys in first-seen order", () => {
  const rows = fromObjects([{ a: 1 }, { b: 2, a: 3 }]);
  assert.deepStrictEqual(rows, [
    ["a", "b"],
    [1, ""],
    [3, 2],
  ]);
});

test("fromObjects accepts an explicit header order, including columns not in every record", () => {
  const rows = fromObjects([{ a: 1, b: 2 }], ["b", "a"]);
  assert.deepStrictEqual(rows, [
    ["b", "a"],
    [2, 1],
  ]);
});

test("stringifyObjects round-trips through toObjects(parseCsv(...))", () => {
  const records = [
    { name: "Ada", age: 30 },
    { name: "Bob", age: 25 },
  ];
  const text = stringifyObjects(records);
  const roundtrip = toObjects(parseCsv(text));
  assert.deepStrictEqual(roundtrip, [
    { name: "Ada", age: "30" },
    { name: "Bob", age: "25" },
  ]);
});
