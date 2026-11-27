#!/usr/bin/env node
"use strict";
// JSON Pointer (RFC 6901) and JSON Patch (RFC 6902), plus a diff that makes
// patches. apply() never changes its input and is all-or-nothing: if any
// operation fails, nothing comes back. No dependencies.

const fs = require("node:fs");

const USAGE = `usage: jsonpatch.js apply DOC.json PATCH.json
       jsonpatch.js diff  OLD.json NEW.json

apply  prints DOC with the patch applied.
diff   prints a patch that turns OLD into NEW.
Use - for stdin (once). Exit 0 on success, 1 if the patch fails or a file
can't be read, 2 for a usage error.`;

class PatchError extends Error {
  constructor(message, index) {
    super(index === undefined ? message : `operation ${index}: ${message}`);
    this.index = index;
  }
}

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// --- pointers ---------------------------------------------------------------

function parsePointer(ptr) {
  if (typeof ptr !== "string") throw new PatchError("pointer must be a string");
  if (ptr === "") return [];
  if (ptr[0] !== "/") throw new PatchError(`pointer must start with "/": ${JSON.stringify(ptr)}`);
  return ptr
    .slice(1)
    .split("/")
    .map((t) => {
      if (/~(?![01])/.test(t)) throw new PatchError(`bad escape in pointer: ${JSON.stringify(ptr)}`);
      return t.replace(/~1/g, "/").replace(/~0/g, "~");
    });
}

function formatPointer(tokens) {
  return tokens.map((t) => "/" + String(t).replace(/~/g, "~0").replace(/\//g, "~1")).join("");
}

function arrayIndex(token, length, allowEnd) {
  if (token === "-" && allowEnd) return length;
  if (!/^(0|[1-9][0-9]*)$/.test(token)) throw new PatchError(`bad array index ${JSON.stringify(token)}`);
  const n = Number(token);
  if (n > length || (n === length && !allowEnd)) throw new PatchError(`array index ${n} out of range`);
  return n;
}

// Walk to the parent of the last token. Returns [parent, lastToken].
function locate(doc, tokens) {
  let cur = doc;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    if (Array.isArray(cur)) cur = cur[arrayIndex(t, cur.length, false)];
    else if (isObj(cur) && hasOwn(cur, t)) cur = cur[t];
    else throw new PatchError(`path not found: ${formatPointer(tokens.slice(0, i + 1))}`);
  }
  return [cur, tokens[tokens.length - 1]];
}

function get(doc, ptr) {
  let cur = doc;
  for (const t of parsePointer(ptr)) {
    if (Array.isArray(cur)) cur = cur[arrayIndex(t, cur.length, false)];
    else if (isObj(cur) && hasOwn(cur, t)) cur = cur[t];
    else throw new PatchError(`path not found: ${ptr}`);
  }
  return cur;
}

function setKey(obj, key, value) {
  // defineProperty so a key of "__proto__" is data, not a prototype swap.
  Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
}

// --- equality and cloning ---------------------------------------------------

function equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((v, i) => equal(v, b[i]));
  }
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => hasOwn(b, k) && equal(a[k], b[k]));
  }
  return false;
}

function clone(v) {
  if (Array.isArray(v)) return v.map(clone);
  if (isObj(v)) {
    const out = {};
    for (const k of Object.keys(v)) setKey(out, k, clone(v[k]));
    return out;
  }
  return v;
}

// --- operations -------------------------------------------------------------

// Each helper edits `doc` in place (it is already a private copy) and returns
// the new root, because an operation on "" replaces the whole document.

function addAt(doc, tokens, value) {
  if (tokens.length === 0) return value;
  const [parent, last] = locate(doc, tokens);
  if (Array.isArray(parent)) parent.splice(arrayIndex(last, parent.length, true), 0, value);
  else if (isObj(parent)) setKey(parent, last, value);
  else throw new PatchError(`cannot add inside a ${parent === null ? "null" : typeof parent}`);
  return doc;
}

function removeAt(doc, tokens) {
  if (tokens.length === 0) throw new PatchError("cannot remove the document root");
  const [parent, last] = locate(doc, tokens);
  let removed;
  if (Array.isArray(parent)) [removed] = parent.splice(arrayIndex(last, parent.length, false), 1);
  else if (isObj(parent) && hasOwn(parent, last)) {
    removed = parent[last];
    delete parent[last];
  } else throw new PatchError(`path not found: ${formatPointer(tokens)}`);
  return [doc, removed];
}

function applyOne(doc, op) {
  if (!isObj(op)) throw new PatchError("operation must be an object");
  if (typeof op.op !== "string") throw new PatchError('missing "op"');
  if (!hasOwn(op, "path")) throw new PatchError('missing "path"');
  const path = parsePointer(op.path);
  const needValue = () => {
    if (!hasOwn(op, "value")) throw new PatchError(`"${op.op}" needs a "value"`);
    return clone(op.value);
  };
  switch (op.op) {
    case "add":
      return addAt(doc, path, needValue());
    case "remove":
      return removeAt(doc, path)[0];
    case "replace": {
      const value = needValue();
      if (path.length === 0) return value;
      get(doc, op.path); // must exist
      const [parent, last] = locate(doc, path);
      if (Array.isArray(parent)) parent[arrayIndex(last, parent.length, false)] = value;
      else setKey(parent, last, value);
      return doc;
    }
    case "move":
    case "copy": {
      if (typeof op.from !== "string") throw new PatchError(`"${op.op}" needs a "from"`);
      const from = parsePointer(op.from);
      if (op.op === "move" && from.length < path.length && from.every((t, i) => t === path[i])) {
        throw new PatchError("cannot move a value into itself");
      }
      let value = clone(get(doc, op.from));
      if (op.op === "move") {
        if (from.length === 0) return doc; // from is the root, so path is too
        value = removeAt(doc, from)[1];
      }
      return addAt(doc, path, value);
    }
    case "test": {
      if (!hasOwn(op, "value")) throw new PatchError('"test" needs a "value"');
      if (!equal(get(doc, op.path), op.value)) throw new PatchError(`test failed at ${op.path || "(root)"}`);
      return doc;
    }
    default:
      throw new PatchError(`unknown op ${JSON.stringify(op.op)}`);
  }
}

function apply(doc, patch) {
  if (!Array.isArray(patch)) throw new PatchError("a patch must be an array of operations");
  let cur = clone(doc);
  patch.forEach((op, i) => {
    try {
      cur = applyOne(cur, op);
    } catch (err) {
      if (err instanceof PatchError && err.index === undefined) throw new PatchError(err.message, i);
      throw err;
    }
  });
  return cur;
}

// --- diff -------------------------------------------------------------------

function diff(a, b, base = []) {
  if (equal(a, b)) return [];
  const here = formatPointer(base);
  if (isObj(a) && isObj(b)) {
    const ops = [];
    for (const k of Object.keys(a)) if (!hasOwn(b, k)) ops.push({ op: "remove", path: formatPointer([...base, k]) });
    for (const k of Object.keys(b)) {
      if (hasOwn(a, k)) ops.push(...diff(a[k], b[k], [...base, k]));
      else ops.push({ op: "add", path: formatPointer([...base, k]), value: clone(b[k]) });
    }
    return ops;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const ops = [];
    const common = Math.min(a.length, b.length);
    for (let i = 0; i < common; i++) ops.push(...diff(a[i], b[i], [...base, String(i)]));
    // Drop extras from the end so earlier indices stay valid.
    for (let i = a.length - 1; i >= common; i--) ops.push({ op: "remove", path: formatPointer([...base, String(i)]) });
    for (let i = common; i < b.length; i++) ops.push({ op: "add", path: formatPointer([...base, "-"]), value: clone(b[i]) });
    return ops;
  }
  return [{ op: "replace", path: here, value: clone(b) }];
}

// --- CLI --------------------------------------------------------------------

function readJson(file, stdinText) {
  const text = file === "-" ? stdinText() : fs.readFileSync(file, "utf8");
  return JSON.parse(text);
}

function main(argv) {
  if (argv.length !== 3 || !["apply", "diff"].includes(argv[0])) {
    console.error(USAGE);
    return 2;
  }
  if (argv[1] === "-" && argv[2] === "-") {
    console.error("jsonpatch: stdin can only be used once\n" + USAGE);
    return 2;
  }
  try {
    const stdin = () => fs.readFileSync(0, "utf8");
    const a = readJson(argv[1], stdin);
    const b = readJson(argv[2], stdin);
    const out = argv[0] === "apply" ? apply(a, b) : diff(a, b);
    console.log(JSON.stringify(out, null, 2));
    return 0;
  } catch (err) {
    console.error(`jsonpatch: ${err.message}`);
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { apply, diff, get, parsePointer, formatPointer, equal, PatchError };
