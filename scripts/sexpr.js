#!/usr/bin/env node
"use strict";
// S-expression reader and printer. Lists become arrays, strings stay strings,
// numbers become numbers and everything else bare is a Sym. 'x reads as
// (quote x). Errors carry a line and column. No dependencies.

const fs = require("node:fs");

const USAGE = `usage: sexpr.js [--pretty] [-w COLS] [--json] [FILE]

Reads S-expressions from FILE (or stdin) and prints each top-level form
normalised, one per line.
  --pretty  break long lists over several lines
  -w COLS   width --pretty aims for (default 72)
  --json    print the parsed forms as JSON (symbols as {"sym": "name"})
Exit 0 on success, 1 for a syntax error, 2 for a usage error.`;

class SexprError extends Error {
  constructor(message, line, col) {
    super(`${message} at ${line}:${col}`);
    this.line = line;
    this.col = col;
  }
}

class Sym {
  constructor(name) {
    this.name = name;
  }
  toString() {
    return this.name;
  }
}

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const DELIMS = new Set(["(", ")", '"', ";", "'"]);
const ESCAPES = { n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\" };

function parse(text) {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  let i = 0;
  let line = 1;
  let col = 1;

  const peek = () => text[i];
  const next = () => {
    const c = text[i++];
    if (c === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
    return c;
  };
  const fail = (msg, l = line, c = col) => {
    throw new SexprError(msg, l, c);
  };

  function skip() {
    while (i < text.length) {
      const c = peek();
      if (c === ";") {
        while (i < text.length && peek() !== "\n") next();
      } else if (/\s/.test(c)) {
        next();
      } else {
        return;
      }
    }
  }

  function readString() {
    const l = line;
    const c = col;
    next(); // opening quote
    let out = "";
    for (;;) {
      if (i >= text.length) fail("unterminated string", l, c);
      const ch = next();
      if (ch === '"') return out;
      if (ch !== "\\") {
        out += ch;
        continue;
      }
      if (i >= text.length) fail("unterminated string", l, c);
      const el = line;
      const ec = col - 1;
      const e = next();
      if (!(e in ESCAPES)) fail(`unknown escape \\${e}`, el, ec);
      out += ESCAPES[e];
    }
  }

  function readForm(depthOpen) {
    skip();
    if (i >= text.length) fail("unexpected end of input");
    const c = peek();
    if (c === ")") fail("unexpected )");
    if (c === "(") {
      const l = line;
      const cl = col;
      next();
      const items = [];
      for (;;) {
        skip();
        if (i >= text.length) fail("unclosed (", l, cl);
        if (peek() === ")") {
          next();
          return items;
        }
        items.push(readForm(depthOpen + 1));
      }
    }
    if (c === "'") {
      next();
      return [new Sym("quote"), readForm(depthOpen)];
    }
    if (c === '"') return readString();
    let atom = "";
    while (i < text.length && !/\s/.test(peek()) && !DELIMS.has(peek())) {
      atom += next();
    }
    return NUMBER.test(atom) ? Number(atom) : new Sym(atom);
  }

  const forms = [];
  for (;;) {
    skip();
    if (i >= text.length) return forms;
    forms.push(readForm(0));
  }
}

function printAtom(v) {
  if (typeof v === "string") {
    let out = '"';
    for (const ch of v) {
      if (ch === '"') out += '\\"';
      else if (ch === "\\") out += "\\\\";
      else if (ch === "\n") out += "\\n";
      else if (ch === "\t") out += "\\t";
      else if (ch === "\r") out += "\\r";
      else out += ch;
    }
    return out + '"';
  }
  if (typeof v === "number") return String(v);
  if (v instanceof Sym) return v.name;
  throw new TypeError(`cannot print ${Object.prototype.toString.call(v)}`);
}

function isQuote(v) {
  return Array.isArray(v) && v.length === 2 && v[0] instanceof Sym && v[0].name === "quote";
}

function print(v) {
  if (isQuote(v)) return "'" + print(v[1]);
  if (Array.isArray(v)) return "(" + v.map(print).join(" ") + ")";
  return printAtom(v);
}

// Lists that fit in `width` stay on one line. Otherwise the head and as many
// atoms as sit comfortably go on the first line, and the rest are indented
// under the first argument (Lisp style) or by two when the head is a list.
function pretty(v, width = 72, indent = 0) {
  const flat = print(v);
  if (!Array.isArray(v) || isQuote(v) || indent + flat.length <= width) return flat;
  if (v.length === 0) return "()";
  const head = v[0];
  const headText = Array.isArray(head) ? pretty(head, width, indent + 1) : print(head);
  if (Array.isArray(head) || v.length === 1) {
    const pad = " ".repeat(indent + 1);
    return "(" + v.map((x, k) => (k ? pad : "") + pretty(x, width, indent + 1)).join("\n") + ")";
  }
  const pad = " ".repeat(indent + 2 + headText.length);
  const rest = v.slice(1).map((x, k) => (k ? pad : " ") + pretty(x, width, indent + 2 + headText.length));
  const body = rest.map((s, k) => (k ? "\n" : "") + s).join("");
  return "(" + headText + body + ")";
}

function toJSON(v) {
  if (v instanceof Sym) return { sym: v.name };
  if (Array.isArray(v)) return v.map(toJSON);
  return v;
}

function main(argv) {
  let usePretty = false;
  let asJson = false;
  let width = 72;
  let file = null;
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    if (a === "-h" || a === "--help") {
      console.log(USAGE);
      return 0;
    } else if (a === "--pretty") usePretty = true;
    else if (a === "--json") asJson = true;
    else if (a === "-w") {
      const n = Number(argv[++k]);
      if (!Number.isInteger(n) || n < 1) {
        console.error("sexpr: -w needs a positive integer\n" + USAGE);
        return 2;
      }
      width = n;
    } else if (a === "-" || !a.startsWith("-")) {
      if (file !== null) {
        console.error("sexpr: only one input file\n" + USAGE);
        return 2;
      }
      file = a;
    } else {
      console.error(`sexpr: unknown option ${a}\n` + USAGE);
      return 2;
    }
  }
  let text;
  try {
    text = fs.readFileSync(file === null || file === "-" ? 0 : file, "utf8");
  } catch (err) {
    console.error(`sexpr: ${err.message}`);
    return 1;
  }
  let forms;
  try {
    forms = parse(text);
  } catch (err) {
    if (!(err instanceof SexprError)) throw err;
    console.error(`sexpr: ${err.message}`);
    return 1;
  }
  if (asJson) console.log(JSON.stringify(forms.map(toJSON), null, 2));
  else for (const f of forms) console.log(usePretty ? pretty(f, width) : print(f));
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { parse, print, pretty, Sym, SexprError };
