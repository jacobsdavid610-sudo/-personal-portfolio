#!/usr/bin/env node
// Turn arbitrary text into a URL/filename-safe slug: "Crème Brûlée & Co." ->
// "creme-brulee-co". Strips accents, collapses runs of punctuation into one
// separator, and can cap the length without cutting a word in half.
// No dependencies.

// Letters that don't decompose under NFKD, so they would otherwise vanish.
const SPECIAL = {
  "ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "đ": "d", "ð": "d", "þ": "th", "ł": "l",
};

/**
 * @param {string} text
 * @param {{separator?: string, maxLength?: number}} [opts]
 */
function slugify(text, opts = {}) {
  const separator = opts.separator === undefined ? "-" : opts.separator;
  const maxLength = opts.maxLength === undefined ? Infinity : opts.maxLength;
  if (!/^[-_.]$/.test(separator)) {
    throw new RangeError("separator must be one of: - _ .");
  }
  if (!(maxLength >= 1)) throw new RangeError("maxLength must be at least 1");

  const base = String(text)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[ßæœøđðþł]/g, (c) => SPECIAL[c]);

  const words = base.split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0) return "";

  let slug = words.join(separator);
  if (slug.length <= maxLength) return slug;

  // Cut on a word boundary when one fits; a single huge word gets cut hard.
  const cut = slug.slice(0, maxLength + 1);
  const boundary = cut.lastIndexOf(separator);
  slug = boundary > 0 ? cut.slice(0, boundary) : slug.slice(0, maxLength);
  return slug;
}

/**
 * Slugifies each title, adding -2, -3... to later duplicates so the results
 * are unique. A suffix is made to fit inside maxLength by trimming the slug.
 */
function uniqueSlugs(titles, opts = {}) {
  const separator = opts.separator === undefined ? "-" : opts.separator;
  const seen = new Set();
  return titles.map((title) => {
    const slug = slugify(title, opts) || "untitled";
    let candidate = slug;
    for (let n = 2; seen.has(candidate); n++) {
      const suffix = `${separator}${n}`;
      const room = (opts.maxLength === undefined ? Infinity : opts.maxLength) - suffix.length;
      const stem = room >= 1 ? slugify(slug, { ...opts, maxLength: room }) : slug;
      candidate = `${stem}${suffix}`;
    }
    seen.add(candidate);
    return candidate;
  });
}

function main(argv) {
  const opts = {};
  let unique = false;
  const inputs = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-s" || arg === "--separator") opts.separator = argv[++i];
    else if (arg === "-m" || arg === "--max-length") opts.maxLength = Number(argv[++i]);
    else if (arg === "-u" || arg === "--unique") unique = true;
    else inputs.push(arg);
  }

  try {
    let titles = inputs;
    if (titles.length === 0) {
      titles = require("node:fs").readFileSync(0, "utf8").split(/\r?\n/).filter((l) => l.trim());
    }
    const out = unique ? uniqueSlugs(titles, opts) : titles.map((t) => slugify(t, opts));
    if (out.length) console.log(out.join("\n"));
    return 0;
  } catch (err) {
    if (err instanceof RangeError) {
      console.error(`slugify: ${err.message}`);
      return 1;
    }
    throw err;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { slugify, uniqueSlugs };
