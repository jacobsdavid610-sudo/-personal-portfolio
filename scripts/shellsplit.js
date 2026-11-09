#!/usr/bin/env node
"use strict";
// Split a command line into words the way a POSIX shell would, and quote
// words back into a line that splits to the same thing. No expansion of any
// kind: `$HOME`, `*` and backticks are just characters. No dependencies.

const SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;
const DOUBLE_QUOTE_ESCAPES = new Set(['"', "\\", "$", "`"]);

function isSpace(ch) {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

// Words in `line`. Throws a SyntaxError (naming the position) for an
// unterminated quote or a trailing backslash.
function split(line) {
  if (typeof line !== "string") throw new TypeError("line must be a string");
  const words = [];
  let word = "";
  let inWord = false; // true after '' too, so an empty quote is an empty word
  let i = 0;
  const flush = () => {
    if (inWord) words.push(word);
    word = "";
    inWord = false;
  };
  while (i < line.length) {
    const ch = line[i];
    if (isSpace(ch)) {
      flush();
      i++;
    } else if (ch === "\\") {
      if (i + 1 >= line.length) throw new SyntaxError(`trailing backslash at position ${i}`);
      const next = line[i + 1];
      if (next === "\n") {
        // line continuation: removed, and does not end the word
      } else if (next === "\r" && line[i + 2] === "\n") {
        i++;
      } else {
        word += next;
        inWord = true;
      }
      i += 2;
    } else if (ch === "'") {
      const end = line.indexOf("'", i + 1);
      if (end === -1) throw new SyntaxError(`unterminated ' quote starting at position ${i}`);
      word += line.slice(i + 1, end);
      inWord = true;
      i = end + 1;
    } else if (ch === '"') {
      const start = i;
      inWord = true;
      i++;
      for (;;) {
        if (i >= line.length) throw new SyntaxError(`unterminated " quote starting at position ${start}`);
        const c = line[i];
        if (c === '"') {
          i++;
          break;
        }
        if (c === "\\" && i + 1 < line.length) {
          const next = line[i + 1];
          if (DOUBLE_QUOTE_ESCAPES.has(next)) {
            word += next;
            i += 2;
            continue;
          }
          if (next === "\n") {
            i += 2;
            continue;
          }
        }
        word += c; // a backslash before anything else stays a backslash
        i++;
      }
    } else {
      word += ch;
      inWord = true;
      i++;
    }
  }
  flush();
  return words;
}

// One word, quoted so `split` gives it back unchanged.
function quote(word) {
  if (typeof word !== "string") throw new TypeError("word must be a string");
  if (word === "") return "''";
  if (SAFE.test(word)) return word;
  return "'" + word.replace(/'/g, "'\\''") + "'";
}

function join(words) {
  return words.map(quote).join(" ");
}

const USAGE = `usage: shellsplit.js split [STRING]   print the words as a JSON array (stdin if no STRING)
       shellsplit.js quote WORD...    print WORDs quoted as one command line`;

function readStdin() {
  const fs = require("node:fs");
  try {
    return fs.readFileSync(0, "utf8");
  } catch (err) {
    if (err.code === "EOF" || err.code === "EAGAIN") return "";
    throw err;
  }
}

function main(argv, out = process.stdout, err = process.stderr) {
  const [command, ...rest] = argv;
  if (command === "split" && rest.length <= 1) {
    const text = rest.length ? rest[0] : readStdin();
    try {
      out.write(JSON.stringify(split(text)) + "\n");
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      err.write(`shellsplit: ${e.message}\n`);
      return 1;
    }
    return 0;
  }
  if (command === "quote" && rest.length > 0) {
    out.write(join(rest) + "\n");
    return 0;
  }
  err.write(USAGE + "\n");
  return 2;
}

module.exports = { split, quote, join, main };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
