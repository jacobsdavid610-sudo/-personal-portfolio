#!/usr/bin/env node
// Flatten nested JSON into one level of path keys and back:
// {"a": {"b": [1, 2]}} <-> {"a.b[0]": 1, "a.b[1]": 2}. Round-trips exactly,
// including empty objects/arrays and keys that contain dots or brackets.
// No dependencies.

const fs = require("node:fs");

const SPECIAL = /[.\[\]\\]/g;

function escapeKey(key) {
  return key.replace(SPECIAL, (c) => `\\${c}`);
}

/** Flattens `value` into a plain object of path -> leaf. */
function flatten(value) {
  const out = {};
  const walk = (node, path) => {
    if (Array.isArray(node) && node.length > 0) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
    } else if (isPlainObject(node) && Object.keys(node).length > 0) {
      for (const key of Object.keys(node)) {
        // "" is the path of a top-level scalar, so an empty key would be
        // ambiguous; refuse it rather than produce something that can't
        // be read back.
        if (key === "") throw new RangeError("empty object keys can't be flattened");
        const part = escapeKey(key);
        walk(node[key], path === "" ? part : `${path}.${part}`);
      }
    } else {
      // Scalars, null, and empty containers are leaves, so {} and [] survive.
      setOwn(out, path, node);
    }
  };
  walk(value, "");
  return out;
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// Assign with defineProperty so a key like "__proto__" becomes an ordinary
// own property instead of rewriting the prototype.
function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, {
    value, writable: true, enumerable: true, configurable: true,
  });
}

/** Splits a path into keys (strings) and array indexes (numbers). */
function parsePath(path) {
  const tokens = [];
  let i = 0;

  // Reads one non-empty key, up to an unescaped "." or "[".
  const readKey = () => {
    let key = "";
    while (i < path.length && path[i] !== "." && path[i] !== "[") {
      if (path[i] === "]") throw new SyntaxError(`unmatched "]" in "${path}"`);
      if (path[i] === "\\") {
        if (i + 1 >= path.length) throw new SyntaxError(`dangling backslash in "${path}"`);
        i++;
      }
      key += path[i++];
    }
    if (key === "") throw new SyntaxError(`empty key in "${path}"`);
    return key;
  };

  if (path.length > 0 && path[0] !== "[") tokens.push(readKey());
  while (i < path.length) {
    if (path[i] === ".") {
      i++;
      tokens.push(readKey());
    } else {
      // path[i] === "[": readKey only stops on "." or "[", and a key can't
      // run straight into anything else.
      const end = path.indexOf("]", i);
      const digits = end === -1 ? "" : path.slice(i + 1, end);
      if (!/^(0|[1-9]\d*)$/.test(digits)) throw new SyntaxError(`bad array index in "${path}"`);
      tokens.push(Number(digits));
      i = end + 1;
    }
  }
  return tokens;
}

/** Inverse of flatten. Throws if paths contradict each other. */
function unflatten(flat) {
  if (!isPlainObject(flat)) throw new TypeError("unflatten expects an object");
  let root;
  let rootSet = false;
  const built = new WeakSet();
  for (const path of Object.keys(flat)) {
    const tokens = parsePath(path);
    if (tokens.length === 0) {
      if (Object.keys(flat).length > 1) throw new Error('"" can only be the only key');
      return flat[path];
    }
    if (!rootSet) {
      root = typeof tokens[0] === "number" ? [] : {};
      built.add(root);
      rootSet = true;
    }
    let node = root;
    tokens.forEach((token, depth) => {
      const isLast = depth === tokens.length - 1;
      if (typeof token === "number" !== Array.isArray(node)) {
        throw new Error(`"${path}" conflicts with another path`);
      }
      if (isLast) {
        if (hasChild(node, token)) throw new Error(`"${path}" conflicts with another path`);
        assign(node, token, flat[path]);
      } else {
        if (!hasChild(node, token)) {
          const child = typeof tokens[depth + 1] === "number" ? [] : {};
          built.add(child);
          assign(node, token, child);
        }
        node = node[token];
        // Only containers made here can be descended into; anything else
        // is a leaf from another path (a scalar, or a literal {} / []).
        if (!built.has(node)) throw new Error(`"${path}" conflicts with another path`);
      }
    });
  }
  assertNoHoles(root);
  return root;
}

function hasChild(node, token) {
  return Object.prototype.hasOwnProperty.call(node, token);
}

function assign(node, token, value) {
  if (Array.isArray(node)) node[token] = value;
  else setOwn(node, token, value);
}

function assertNoHoles(node) {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (!(i in node)) throw new Error(`array is missing index ${i}`);
    }
  }
  Object.values(node).forEach(assertNoHoles);
}

function main(argv) {
  let reverse = false;
  let file = null;
  for (const arg of argv) {
    if (arg === "-u" || arg === "--unflatten") reverse = true;
    else file = arg;
  }
  try {
    const text = fs.readFileSync(file === null || file === "-" ? 0 : file, "utf8");
    const data = JSON.parse(text);
    console.log(JSON.stringify(reverse ? unflatten(data) : flatten(data), null, 2));
    return 0;
  } catch (err) {
    if (err instanceof SyntaxError || err instanceof TypeError || err instanceof RangeError
        || err.message.includes("conflicts") || err.message.includes("missing index")
        || err.message.includes("only key")) {
      console.error(`jsonflatten: ${err.message}`);
      return 1;
    }
    if (err.code === "ENOENT" || err.code === "EISDIR" || err.code === "EACCES") {
      console.error(`jsonflatten: ${err.message}`);
      return 2;
    }
    throw err;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { flatten, unflatten, parsePath };
