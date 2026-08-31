const test = require("node:test");
const assert = require("node:assert");
const { renderTable } = require("../scripts/asciitable.js");

test("renders a simple table with inferred columns from the first row", () => {
  const rows = [
    { name: "Ada", age: 36 },
    { name: "Grace", age: 85 },
  ];
  const table = renderTable(rows);
  const lines = table.split("\n");
  assert.strictEqual(lines[0], "+-------+-----+");
  assert.strictEqual(lines[1], "| name  | age |");
  assert.strictEqual(lines[2], "+-------+-----+");
  assert.strictEqual(lines[3], "| Ada   | 36  |");
  assert.strictEqual(lines[4], "| Grace | 85  |");
  assert.strictEqual(lines[5], "+-------+-----+");
});

test("column width is the max of header length and every cell in that column", () => {
  const rows = [{ x: "a" }, { x: "a much longer value" }];
  const table = renderTable(rows);
  const headerLine = table.split("\n")[1];
  // "a much longer value" is 19 chars; column interior should be exactly
  // 19 wide (plus one space of padding on each side).
  assert.strictEqual(headerLine, "| x                   |");
});

test("explicit column list controls order, independent of key insertion order", () => {
  const rows = [{ b: "2", a: "1" }];
  const table = renderTable(rows, ["a", "b"]);
  const headerLine = table.split("\n")[1];
  assert.ok(headerLine.indexOf(" a ") < headerLine.indexOf(" b "));
});

test("explicit column list can rename headers via {key, header}", () => {
  const rows = [{ id: 1 }];
  const table = renderTable(rows, [{ key: "id", header: "ID" }]);
  const headerLine = table.split("\n")[1];
  assert.ok(headerLine.includes("ID"));
});

test("explicit column list can select a subset of keys, dropping the rest", () => {
  const rows = [{ a: "1", b: "2", c: "3" }];
  const table = renderTable(rows, ["a", "c"]);
  const headerLine = table.split("\n")[1];
  assert.ok(headerLine.includes("a"));
  assert.ok(headerLine.includes("c"));
  assert.ok(!headerLine.includes("b"));
});

test("null and undefined cells render as empty strings, not the literal text", () => {
  const rows = [{ x: null, y: undefined }];
  const table = renderTable(rows);
  const dataLine = table.split("\n")[3];
  assert.ok(!dataLine.includes("null"));
  assert.ok(!dataLine.includes("undefined"));
});

test("numbers are stringified for width calculation and display", () => {
  const rows = [{ n: 42 }];
  const table = renderTable(rows);
  assert.ok(table.includes("42"));
});

test("an empty row array with no explicit columns renders a placeholder", () => {
  assert.strictEqual(renderTable([]), "(no rows)");
});

test("an empty row array with explicit columns still renders header and borders", () => {
  const table = renderTable([], ["name", "age"]);
  const lines = table.split("\n");
  assert.strictEqual(lines.length, 3); // border, header, border - no data rows
  assert.ok(lines[1].includes("name"));
});

test("border row width matches the column width exactly on both sides", () => {
  const rows = [{ x: "ab" }];
  const table = renderTable(rows);
  const border = table.split("\n")[0];
  // "ab" is 2 chars; border segment should be 2 + 2 padding = 4 dashes.
  assert.strictEqual(border, "+----+");
});
