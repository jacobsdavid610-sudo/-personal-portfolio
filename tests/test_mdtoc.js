const test = require("node:test");
const assert = require("node:assert");
const { extractHeadings, buildToc } = require("../scripts/mdtoc.js");

test("extracts headings and slugifies them GitHub-style", () => {
  const md = "# Title\n\n## Getting Started\n\n### Sub-section!\n";
  const headings = extractHeadings(md);

  assert.deepStrictEqual(headings, [
    { level: 1, text: "Title", slug: "title" },
    { level: 2, text: "Getting Started", slug: "getting-started" },
    { level: 3, text: "Sub-section!", slug: "sub-section" },
  ]);
});

test("de-duplicates repeated headings like GitHub does", () => {
  const md = "## Usage\n\n## Usage\n\n## Usage\n";
  const headings = extractHeadings(md);
  assert.deepStrictEqual(
    headings.map((h) => h.slug),
    ["usage", "usage-1", "usage-2"],
  );
});

test("ignores headings inside fenced code blocks", () => {
  const md = "## Real Heading\n\n```\n# Not a heading\n```\n\n## Another Real One\n";
  const headings = extractHeadings(md);
  assert.deepStrictEqual(
    headings.map((h) => h.text),
    ["Real Heading", "Another Real One"],
  );
});

test("buildToc respects min/max level and indents nested headings", () => {
  const headings = [
    { level: 2, text: "One", slug: "one" },
    { level: 3, text: "One A", slug: "one-a" },
    { level: 4, text: "Too Deep", slug: "too-deep" },
  ];
  const toc = buildToc(headings, { minLevel: 2, maxLevel: 3 });

  assert.strictEqual(toc, "- [One](#one)\n  - [One A](#one-a)");
});

test("buildToc returns empty string when nothing is in range", () => {
  const headings = [{ level: 1, text: "Title", slug: "title" }];
  assert.strictEqual(buildToc(headings, { minLevel: 2, maxLevel: 3 }), "");
});
