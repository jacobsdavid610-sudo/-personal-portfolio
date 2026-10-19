const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { slugify, uniqueSlugs } = require("../scripts/slugify.js");

const CLI = path.join(__dirname, "..", "scripts", "slugify.js");

test("slugify: lowercases and joins words with a dash", () => {
  assert.strictEqual(slugify("Hello World"), "hello-world");
});

test("slugify: strips accents", () => {
  assert.strictEqual(slugify("Crème Brûlée"), "creme-brulee");
});

test("slugify: letters with no decomposition are transliterated, not dropped", () => {
  assert.strictEqual(slugify("Straße Ølfeld"), "strasse-olfeld");
  assert.strictEqual(slugify("Łódź"), "lodz");
});

test("slugify: runs of punctuation and whitespace become one separator", () => {
  assert.strictEqual(slugify("  a --- b ,, c!! "), "a-b-c");
});

test("slugify: no leading or trailing separator", () => {
  assert.strictEqual(slugify("--hello--"), "hello");
});

test("slugify: digits are kept", () => {
  assert.strictEqual(slugify("Top 10 Tips (2026)"), "top-10-tips-2026");
});

test("slugify: nothing usable gives an empty string", () => {
  assert.strictEqual(slugify(""), "");
  assert.strictEqual(slugify("!!! ???"), "");
  assert.strictEqual(slugify("日本語"), "");
});

test("slugify: custom separator", () => {
  assert.strictEqual(slugify("My Great File", { separator: "_" }), "my_great_file");
});

test("slugify: rejects a separator that isn't filename safe", () => {
  assert.throws(() => slugify("a b", { separator: "/" }), RangeError);
  assert.throws(() => slugify("a b", { separator: "--" }), RangeError);
});

test("slugify: maxLength cuts on a word boundary", () => {
  assert.strictEqual(slugify("the quick brown fox", { maxLength: 12 }), "the-quick");
  // exactly fits, including the boundary char right after the cut
  assert.strictEqual(slugify("the quick brown fox", { maxLength: 15 }), "the-quick-brown");
});

test("slugify: a single word longer than maxLength is cut hard", () => {
  assert.strictEqual(slugify("supercalifragilistic", { maxLength: 5 }), "super");
});

test("slugify: maxLength never leaves a trailing separator", () => {
  const s = slugify("ab cd ef", { maxLength: 6 });
  assert.strictEqual(s, "ab-cd");
  assert.ok(!s.endsWith("-"));
});

test("slugify: maxLength below 1 throws", () => {
  assert.throws(() => slugify("abc", { maxLength: 0 }), RangeError);
});

test("uniqueSlugs: later duplicates get -2, -3", () => {
  assert.deepStrictEqual(
    uniqueSlugs(["Hello World", "hello, world", "Hello World!"]),
    ["hello-world", "hello-world-2", "hello-world-3"]
  );
});

test("uniqueSlugs: a title with no usable characters becomes 'untitled'", () => {
  assert.deepStrictEqual(uniqueSlugs(["!!!", "???"]), ["untitled", "untitled-2"]);
});

test("uniqueSlugs: a suffixed slug still fits inside maxLength", () => {
  const out = uniqueSlugs(["abcdefgh", "abcdefgh"], { maxLength: 8 });
  assert.strictEqual(out[0], "abcdefgh");
  assert.strictEqual(out[1], "abcdef-2");
  assert.ok(out.every((s) => s.length <= 8));
});

test("uniqueSlugs: a generated suffix can't collide with a real title", () => {
  const out = uniqueSlugs(["a", "a", "a 2"]);
  assert.strictEqual(new Set(out).size, 3);
});

test("cli: slugs each argument on its own line", () => {
  const r = spawnSync("node", [CLI, "Hello World", "Café Society"], { encoding: "utf8" });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, "hello-world\ncafe-society\n");
});

test("cli: reads lines from stdin and supports --unique", () => {
  const r = spawnSync("node", [CLI, "-u"], { input: "Hi\nhi!\n\n", encoding: "utf8" });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, "hi\nhi-2\n");
});

test("cli: bad separator exits 1 with a message on stderr", () => {
  const r = spawnSync("node", [CLI, "-s", "x", "a"], { encoding: "utf8" });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /separator/);
});
