#!/usr/bin/env node
"use strict";
// A small Markdown-to-HTML converter for a practical CommonMark subset:
// ATX headings, paragraphs, fenced code, block quotes, bullet and numbered
// lists (nested, tight or loose), horizontal rules, and inline code,
// emphasis, strong, links, images, autolinks, backslash escapes and hard
// breaks. Raw HTML in the input is escaped, never passed through, and link
// targets with script-capable schemes are dropped. No dependencies.
//
// Left out on purpose: setext headings, indented code blocks, reference
// links, tables, HTML blocks and the full emphasis-nesting algorithm.

const fs = require("node:fs");

const USAGE = `usage: mdhtml.js [FILE]

Converts Markdown from FILE (or stdin) to an HTML fragment on stdout.
Exit 0 on success, 1 if the file cannot be read, 2 for a usage error.`;

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => s.replace(/[&<>"']/g, (c) => ESC[c]);

const SAFE_SCHEMES = new Set(["http", "https", "mailto", "ftp", "tel"]);

// Keep relative links and a short list of schemes; anything else (javascript:,
// data:, vbscript:, ...) becomes an empty target. Whitespace and control
// characters are stripped before the check, since browsers ignore them inside
// a scheme ("java\tscript:").
function safeUrl(url) {
  const probe = url.replace(/[\u0000- \u007f-\u009f]/g, "");
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(probe);
  if (m && !SAFE_SCHEMES.has(m[1].toLowerCase())) return "";
  return url.trim();
}

const PUNCT = /[!-\/:-@\[-`{-~]/;
const isWord = (c) => c !== undefined && /[A-Za-z0-9]/.test(c);
const isSpace = (c) => c === undefined || /\s/.test(c);

// ---- inline ---------------------------------------------------------------

// Index of the closing delimiter `delim` at or after `from`, skipping code
// spans and backslash escapes, or -1. The opener is already consumed.
function findClose(s, from, delim) {
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") {
      i++;
    } else if (c === "`") {
      const run = /^`+/.exec(s.slice(i))[0];
      const end = s.indexOf(run, i + run.length);
      if (end !== -1) i = end + run.length - 1;
      else i += run.length - 1;
    } else if (s.startsWith(delim, i) && !isSpace(s[i - 1]) && i > from) {
      if (delim[0] === "_" && isWord(s[i + delim.length])) continue;
      return i;
    }
  }
  return -1;
}

// Matching "]" for the "[" at s[open], counting nested brackets.
function findBracket(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "\\") i++;
    else if (s[i] === "[") depth++;
    else if (s[i] === "]" && --depth === 0) return i;
  }
  return -1;
}

// Parses "(url "title")" starting at s[open] === "(". Returns {url, title, end}.
function parseTarget(s, open) {
  let i = open + 1;
  while (/\s/.test(s[i] ?? "")) i++;
  let url = "";
  if (s[i] === "<") {
    const end = s.indexOf(">", i);
    if (end === -1 || s.slice(i, end).includes("\n")) return null;
    url = s.slice(i + 1, end);
    i = end + 1;
  } else {
    let depth = 0;
    const start = i;
    for (; i < s.length; i++) {
      if (s[i] === "\\") i++;
      else if (s[i] === "(") depth++;
      else if (s[i] === ")") {
        if (depth === 0) break;
        depth--;
      } else if (/\s/.test(s[i])) break;
    }
    url = s.slice(start, i).replace(/\\([!-\/:-@\[-`{-~])/g, "$1");
  }
  while (/\s/.test(s[i] ?? "")) i++;
  let title = null;
  if (s[i] === '"' || s[i] === "'") {
    const q = s[i];
    const end = s.indexOf(q, i + 1);
    if (end === -1) return null;
    title = s.slice(i + 1, end);
    i = end + 1;
    while (/\s/.test(s[i] ?? "")) i++;
  }
  if (s[i] !== ")") return null;
  return { url, title, end: i + 1 };
}

function plainText(html) {
  return html.replace(/<[^>]*>/g, "");
}

function inline(s) {
  let out = "";
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length && PUNCT.test(s[i + 1])) {
      out += esc(s[i + 1]);
      i += 2;
    } else if (c === "\\" && s[i + 1] === "\n") {
      out += "<br>\n";
      i += 2;
    } else if (c === "`") {
      const run = /^`+/.exec(s.slice(i))[0];
      const end = s.indexOf(run, i + run.length);
      if (end === -1) {
        out += run;
        i += run.length;
      } else {
        let code = s.slice(i + run.length, end).replace(/\n/g, " ");
        if (code.length > 2 && code.startsWith(" ") && code.endsWith(" ") && code.trim()) code = code.slice(1, -1);
        out += `<code>${esc(code)}</code>`;
        i = end + run.length;
      }
    } else if (c === "!" && s[i + 1] === "[" || c === "[") {
      const image = c === "!";
      const open = image ? i + 1 : i;
      const close = findBracket(s, open);
      const target = close !== -1 && s[close + 1] === "(" ? parseTarget(s, close + 1) : null;
      if (!target) {
        out += esc(c);
        i++;
        continue;
      }
      const label = inline(s.slice(open + 1, close));
      const title = target.title === null ? "" : ` title="${esc(target.title)}"`;
      const url = esc(safeUrl(target.url));
      out += image ? `<img src="${url}" alt="${plainText(label)}"${title}>` : `<a href="${url}"${title}>${label}</a>`;
      i = target.end;
    } else if (c === "<") {
      const m = /^<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*)>/.exec(s.slice(i));
      const mail = /^<([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>/.exec(s.slice(i));
      if (m) {
        out += `<a href="${esc(safeUrl(m[1]))}">${esc(m[1])}</a>`;
        i += m[0].length;
      } else if (mail) {
        out += `<a href="mailto:${esc(mail[1])}">${esc(mail[1])}</a>`;
        i += mail[0].length;
      } else {
        out += "&lt;";
        i++;
      }
    } else if (c === "*" || c === "_") {
      const run = /^[*_]+/.exec(s.slice(i))[0];
      const tag = run.startsWith(c.repeat(3)) ? 3 : run.startsWith(c.repeat(2)) ? 2 : 1;
      const delim = c.repeat(tag);
      const canOpen = !isSpace(s[i + tag]) && !(c === "_" && isWord(s[i - 1]));
      const close = canOpen ? findClose(s, i + tag, delim) : -1;
      if (close === -1) {
        out += run[0];
        i++;
      } else {
        const body = inline(s.slice(i + tag, close));
        out += tag === 3 ? `<em><strong>${body}</strong></em>` : tag === 2 ? `<strong>${body}</strong>` : `<em>${body}</em>`;
        i = close + tag;
      }
    } else if (c === " " && /^ {2,}\n/.test(s.slice(i))) {
      out += "<br>\n";
      i += s.slice(i).indexOf("\n") + 1;
    } else if (c === "\n") {
      out += "\n";
      i++;
    } else {
      out += esc(c);
      i++;
    }
  }
  return out;
}

// ---- blocks ---------------------------------------------------------------

const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}>/;
const ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+)(\S.*)$/;

function startsBlock(line) {
  if (FENCE.test(line) || HEADING.test(line) || HR.test(line) || QUOTE.test(line)) return true;
  const m = ITEM.exec(line);
  return Boolean(m) && (/^[-*+]$/.test(m[2]) || m[2] === "1." || m[2] === "1)");
}

function renderList(lines, start) {
  const first = ITEM.exec(lines[start]);
  const ordered = /\d/.test(first[2]);
  const marker = ordered ? first[2].slice(-1) : first[2];
  const items = [];
  let i = start;
  let loose = false;
  let sawBlank = false;
  while (i < lines.length) {
    const m = ITEM.exec(lines[i]);
    const same = m && ordered === /\d/.test(m[2]) && (ordered ? m[2].slice(-1) : m[2]) === marker;
    if (!same) break;
    if (sawBlank) loose = true;
    sawBlank = false;
    const indent = m[1].length + m[2].length + Math.min(m[3].length, 4);
    const body = [m[4]];
    i++;
    let inner = false;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === "") {
        // a blank line stays in the item only if indented content follows
        let j = i;
        while (j < lines.length && lines[j].trim() === "") j++;
        if (j < lines.length && lines[j].search(/\S/) >= indent) {
          for (; i < j; i++) body.push("");
          inner = true;
          continue;
        }
        sawBlank = true;
        i = j;
        break;
      }
      if (line.search(/\S/) >= indent) {
        body.push(line.slice(indent));
      } else if (!startsBlock(line) && !ITEM.test(line) && body[body.length - 1].trim() !== "") {
        body.push(line.trim()); // lazy continuation of a paragraph
      } else {
        break;
      }
      i++;
    }
    if (inner && body.some((l) => l === "")) loose = true;
    items.push(body);
    if (sawBlank && i < lines.length && !ITEM.test(lines[i])) break;
  }
  const tag = ordered ? "ol" : "ul";
  const num = ordered ? parseInt(first[2], 10) : 1;
  const open = ordered && num !== 1 ? `<ol start="${num}">` : `<${tag}>`;
  const html = items.map((body) => `<li>${renderItem(body, !loose)}</li>`).join("\n");
  return { html: `${open}\n${html}\n</${tag}>`, next: i };
}

function renderItem(body, tight) {
  const html = blocks(body, tight);
  if (!tight) return html.includes("\n") ? `\n${html}\n` : html;
  // a nested block closes on its own line; plain text stays on the <li> line
  return /(^|\n)<(ul|ol|pre|blockquote|h[1-6]|hr)/.test(html) ? `${html}\n` : html;
}

function blocks(lines, tight = false) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    let m;
    if ((m = FENCE.exec(line))) {
      const fence = m[1];
      const lang = m[2].replace(/[^\w+#.-]/g, "");
      const indent = line.search(/\S/);
      const code = [];
      i++;
      while (i < lines.length) {
        const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(lines[i]);
        if (close && close[1][0] === fence[0] && close[1].length >= fence.length) {
          i++;
          break;
        }
        code.push(lines[i].replace(new RegExp(`^ {0,${indent}}`), ""));
        i++;
      }
      const cls = lang ? ` class="language-${lang}"` : "";
      out.push(`<pre><code${cls}>${code.map((l) => esc(l) + "\n").join("")}</code></pre>`);
    } else if (HR.test(line)) {
      out.push("<hr>");
      i++;
    } else if ((m = HEADING.exec(line))) {
      out.push(`<h${m[1].length}>${inline((m[2] ?? "").trim())}</h${m[1].length}>`);
      i++;
    } else if (QUOTE.test(line)) {
      const inner = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        inner.push(lines[i].replace(/^ {0,3}> ?/, ""));
        i++;
      }
      out.push(`<blockquote>\n${blocks(inner)}\n</blockquote>`);
    } else if (ITEM.test(line)) {
      const r = renderList(lines, i);
      out.push(r.html);
      i = r.next;
    } else {
      const para = [line.trim()];
      i++;
      while (i < lines.length && lines[i].trim() !== "" && !startsBlock(lines[i])) {
        para.push(lines[i].trim());
        i++;
      }
      // a trailing double space marks a hard break, so re-add it where it was
      const text = para.map((l, k) => (k < para.length - 1 && /  $/.test(lines[i - para.length + k]) ? l + "  " : l)).join("\n");
      const html = inline(text);
      out.push(tight ? html : `<p>${html}</p>`);
    }
  }
  return out.join("\n");
}

function render(markdown) {
  if (typeof markdown !== "string") throw new TypeError("markdown must be a string");
  const lines = markdown
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/^( *)\t/, "$1    ").replace(/\0/g, "�"));
  const html = blocks(lines);
  return html === "" ? "" : html + "\n";
}

function main(argv) {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(USAGE);
    return 0;
  }
  if (argv.length > 1 || (argv[0] && argv[0].startsWith("-") && argv[0] !== "-")) {
    console.error(USAGE);
    return 2;
  }
  let text;
  try {
    text = fs.readFileSync(argv[0] === undefined || argv[0] === "-" ? 0 : argv[0], "utf8");
  } catch (err) {
    console.error(`mdhtml: ${err.message}`);
    return 1;
  }
  process.stdout.write(render(text));
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { render, inline, safeUrl, esc };
