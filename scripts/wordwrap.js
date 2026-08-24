#!/usr/bin/env node
// Wrap plain text to a fixed column width, preserving paragraph breaks
// (blank lines) and hard-breaking any single word longer than the width.
// No dependencies.

/**
 * Wraps a single paragraph (no blank lines) to `width` columns.
 * A word longer than `width` on its own is hard-broken across lines
 * rather than left overflowing.
 */
function wrapParagraph(text, width) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines = [];
  let current = "";

  const pushCurrent = () => {
    if (current.length > 0) lines.push(current);
    current = "";
  };

  for (let word of words) {
    while (word.length > width) {
      // The word alone is longer than the line width: fill out the
      // current line with as much as fits, then hard-break the rest.
      const spaceLeft = width - current.length - (current.length > 0 ? 1 : 0);
      if (spaceLeft > 0) {
        const piece = word.slice(0, spaceLeft);
        current = current.length > 0 ? `${current} ${piece}` : piece;
        word = word.slice(spaceLeft);
      }
      pushCurrent();
      if (word.length > width) {
        lines.push(word.slice(0, width));
        word = word.slice(width);
      }
    }

    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += ` ${word}`;
    } else {
      pushCurrent();
      current = word;
    }
  }
  pushCurrent();

  return lines;
}

/**
 * Wraps `text` to `width` columns. Blank lines (paragraph breaks) are
 * preserved as-is; each non-blank paragraph is wrapped independently.
 * `indent` (a string) is prepended to every output line.
 */
function wrap(text, width, indent = "") {
  if (width <= 0) {
    throw new RangeError("width must be a positive integer");
  }
  const effectiveWidth = Math.max(1, width - indent.length);

  const paragraphs = text.split(/\n\s*\n/);
  const wrapped = paragraphs.map((para) => {
    const collapsed = para.replace(/\n/g, " ");
    return wrapParagraph(collapsed, effectiveWidth)
      .map((line) => indent + line)
      .join("\n");
  });

  return wrapped.join("\n\n");
}

module.exports = { wrap, wrapParagraph };

if (require.main === module) {
  const fs = require("fs");
  const args = process.argv.slice(2);

  let width = 80;
  let indent = "";
  let file = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-w" || args[i] === "--width") {
      width = parseInt(args[++i], 10);
    } else if (args[i] === "--indent") {
      indent = args[++i];
    } else if (args[i] === "-h" || args[i] === "--help") {
      console.error("Usage: wordwrap.js [file] [-w WIDTH] [--indent STR]");
      process.exit(0);
    } else {
      file = args[i];
    }
  }

  const text = file ? fs.readFileSync(file, "utf8") : fs.readFileSync(0, "utf8");

  try {
    console.log(wrap(text.replace(/\n$/, ""), width, indent));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
