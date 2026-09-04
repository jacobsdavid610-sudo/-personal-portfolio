const test = require("node:test");
const assert = require("node:assert");
const { parsePath, query, queryOne } = require("../scripts/jsonpath.js");

const data = {
  store: {
    "book-count": 2,
    books: [
      { title: "A", author: "Ada" },
      { title: "B", author: "Bob" },
    ],
  },
  scores: { alice: 90, bob: 80 },
};

test("root path returns the whole document", () => {
  assert.deepStrictEqual(query(data, "$"), [data]);
});

test("dotted key path walks into nested objects", () => {
  assert.deepStrictEqual(query(data, "$.store.books"), [data.store.books]);
});

test("numeric array index selects one element", () => {
  assert.deepStrictEqual(query(data, "$.store.books[0].title"), ["A"]);
});

test("array wildcard collects a field across every element", () => {
  assert.deepStrictEqual(query(data, "$.store.books[*].title"), ["A", "B"]);
});

test("dot wildcard collects every value of an object", () => {
  const values = query(data, "$.scores.*");
  assert.deepStrictEqual(values.sort(), [80, 90]);
});

test("bracket-quoted key reaches a property name that isn't a valid dotted identifier", () => {
  assert.deepStrictEqual(query(data, "$.store['book-count']"), [2]);
});

test("out-of-range array index returns no matches", () => {
  assert.deepStrictEqual(query(data, "$.store.books[5]"), []);
});

test("a missing key at any depth returns no matches, not an error", () => {
  assert.deepStrictEqual(query(data, "$.nope.alsonope"), []);
});

test("wildcard over a non-existent path returns no matches", () => {
  assert.deepStrictEqual(query(data, "$.nope[*]"), []);
});

test("queryOne returns the first match or undefined", () => {
  assert.strictEqual(queryOne(data, "$.store.books[1].author"), "Bob");
  assert.strictEqual(queryOne(data, "$.nope"), undefined);
});

test("a path not starting with $ throws", () => {
  assert.throws(() => query(data, "store.books"), /must start with/);
});

test("an unrecognized token in the path throws", () => {
  assert.throws(() => query(data, "$.store.???"), /unexpected token/);
});

test("parsePath returns the parsed segment list", () => {
  assert.deepStrictEqual(parsePath("$.a[0][*]"), [
    { type: "key", name: "a" },
    { type: "index", value: 0 },
    { type: "wildcard" },
  ]);
});

test("wildcard chained into a deeper key filters out elements missing that key", () => {
  const withMissing = { items: [{ id: 1, tag: "x" }, { id: 2 }] };
  assert.deepStrictEqual(query(withMissing, "$.items[*].tag"), ["x"]);
});
