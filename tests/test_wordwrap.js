const test = require("node:test");
const assert = require("node:assert");
const { wrap, wrapParagraph } = require("../scripts/wordwrap.js");

test("wrapParagraph: no wrapping needed when text fits on one line", () => {
  assert.deepStrictEqual(wrapParagraph("short text", 80), ["short text"]);
});

test("wrapParagraph: breaks at word boundaries, never exceeding width", () => {
  const lines = wrapParagraph("the quick brown fox jumps over the lazy dog", 15);
  for (const line of lines) {
    assert.ok(line.length <= 15, `line too long: "${line}" (${line.length})`);
  }
  assert.deepStrictEqual(lines, ["the quick brown", "fox jumps over", "the lazy dog"]);
});

test("wrapParagraph: collapses multiple/irregular whitespace between words", () => {
  const lines = wrapParagraph("one   two\tthree", 80);
  assert.deepStrictEqual(lines, ["one two three"]);
});

test("wrapParagraph: empty input produces no lines", () => {
  assert.deepStrictEqual(wrapParagraph("", 80), []);
  assert.deepStrictEqual(wrapParagraph("   ", 80), []);
});

test("wrapParagraph: a single word longer than width is hard-broken", () => {
  const lines = wrapParagraph("supercalifragilisticexpialidocious", 10);
  assert.deepStrictEqual(lines, ["supercalif", "ragilistic", "expialidoc", "ious"]);
  for (const line of lines) assert.ok(line.length <= 10);
});

test("wrapParagraph: a long word after a partial line fills the line then breaks", () => {
  const lines = wrapParagraph("hi supercalifragilisticexpialidocious", 10);
  // "hi " (3 cols) is topped up with 7 more characters of the long word
  // to fill the first line exactly, then the rest hard-breaks in chunks.
  assert.deepStrictEqual(lines, ["hi superca", "lifragilis", "ticexpiali", "docious"]);
  for (const line of lines) assert.ok(line.length <= 10);
  assert.strictEqual(
    lines.join("").replace("hi ", ""),
    "supercalifragilisticexpialidocious"
  );
});

test("wrap: preserves blank-line paragraph breaks", () => {
  const text = "para one has some words.\n\npara two also has words.";
  const result = wrap(text, 80);
  assert.strictEqual(result, "para one has some words.\n\npara two also has words.");
});

test("wrap: a paragraph's internal newlines are collapsed before wrapping", () => {
  const text = "this is\na single\nparagraph with a hard line break";
  const result = wrap(text, 80);
  assert.strictEqual(result, "this is a single paragraph with a hard line break");
});

test("wrap: indent is prepended to every output line", () => {
  const text = "one two three four five";
  const result = wrap(text, 14, "  ");
  const lines = result.split("\n");
  for (const line of lines) {
    assert.ok(line.startsWith("  "), `line missing indent: "${line}"`);
    assert.ok(line.length <= 14, `indented line too long: "${line}"`);
  }
});

test("wrap: throws RangeError for a non-positive width", () => {
  assert.throws(() => wrap("text", 0), RangeError);
  assert.throws(() => wrap("text", -5), RangeError);
});

test("wrap: multiple paragraphs each wrap independently", () => {
  const text = "alpha beta gamma delta\n\nepsilon zeta eta theta";
  const result = wrap(text, 12);
  const [p1, p2] = result.split("\n\n");
  assert.strictEqual(p1, "alpha beta\ngamma delta");
  assert.strictEqual(p2, "epsilon zeta\neta theta");
});
