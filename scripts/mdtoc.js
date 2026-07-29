#!/usr/bin/env node
// Generate a GitHub-style table of contents for a Markdown file.
// No dependencies. Skips headings inside fenced code blocks and
// de-duplicates slugs the way GitHub does (repeat -> -1, -2, ...).

const fs = require("node:fs");

function slugify(text, seen) {
  let slug = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\- ]+/g, "")
    .replace(/\s+/g, "-");

  const count = seen.get(slug) || 0;
  seen.set(slug, count + 1);
  return count === 0 ? slug : `${slug}-${count}`;
}

function extractHeadings(markdown) {
  const headings = [];
  const seen = new Map();
  let inFence = false;

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();

    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (!match) continue;

    const level = match[1].length;
    const text = match[2];
    headings.push({ level, text, slug: slugify(text, seen) });
  }

  return headings;
}

function buildToc(headings, { minLevel, maxLevel }) {
  const lines = headings
    .filter((h) => h.level >= minLevel && h.level <= maxLevel)
    .map((h) => {
      const indent = "  ".repeat(h.level - minLevel);
      return `${indent}- [${h.text}](#${h.slug})`;
    });
  return lines.join("\n");
}

function writeInPlace(filePath, markdown, toc) {
  const start = "<!-- toc -->";
  const end = "<!-- tocstop -->";
  const block = `${start}\n${toc}\n${end}`;

  const hasMarkers = markdown.includes(start) && markdown.includes(end);
  const updated = hasMarkers
    ? markdown.replace(
        new RegExp(`${start}[\\s\\S]*?${end}`),
        block.replace(/\$/g, "$$$$"),
      )
    : `${block}\n\n${markdown}`;

  fs.writeFileSync(filePath, updated);
  return hasMarkers;
}

function main(argv) {
  const args = argv.slice(2);
  const write = args.includes("--write");
  const filePath = args.find((a) => !a.startsWith("--"));

  if (!filePath) {
    console.error("Usage: mdtoc.js <file.md> [--write] [--min-level N] [--max-level N]");
    return 1;
  }

  const minIdx = args.indexOf("--min-level");
  const maxIdx = args.indexOf("--max-level");
  const minLevel = minIdx !== -1 ? parseInt(args[minIdx + 1], 10) : 2;
  const maxLevel = maxIdx !== -1 ? parseInt(args[maxIdx + 1], 10) : 3;

  const markdown = fs.readFileSync(filePath, "utf8");
  const headings = extractHeadings(markdown);
  const toc = buildToc(headings, { minLevel, maxLevel });

  if (!toc) {
    console.error("No headings found in range.");
    return 1;
  }

  if (write) {
    const replaced = writeInPlace(filePath, markdown, toc);
    console.log(replaced ? "Updated existing TOC." : "Inserted new TOC at top of file.");
  } else {
    console.log(toc);
  }

  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { slugify, extractHeadings, buildToc };
