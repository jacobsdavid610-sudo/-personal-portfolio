#!/usr/bin/env node
// Deep structural equality for JS values. `JSON.stringify(a) ===
// JSON.stringify(b)` is order-sensitive on object keys and can't
// represent NaN, undefined, Dates, or circular references at all -
// `===` does no structural comparison whatsoever. This walks both
// values recursively and compares primitives with Object.is, so NaN
// equals NaN but +0 and -0 don't - the same SameValue rule Node's
// `assert.deepStrictEqual` uses, rather than the surprises `==`/`===`
// have around those two specific values. No dependencies.

const fs = require("node:fs");

function consumeMatch(item, pool, seen) {
  for (let i = 0; i < pool.length; i++) {
    if (deepEqual(item, pool[i], seen)) {
      pool.splice(i, 1);
      return true;
    }
  }
  return false;
}

function setsEqual(a, b, seen) {
  const bValues = [...b];
  for (const value of a) {
    if (!consumeMatch(value, bValues, seen)) return false;
  }
  return true;
}

function mapsEqual(a, b, seen) {
  const bEntries = [...b];
  for (const entry of a) {
    if (!consumeMatch(entry, bEntries, seen)) return false;
  }
  return true;
}

function deepEqual(a, b, seen = new Map()) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  // Cycle guard: if this exact (a, b) pair is already being compared
  // further up the call stack, assume equal rather than recursing
  // forever - the standard coinductive rule for comparing structures
  // that may contain circular references.
  if (seen.get(a) === b) return true;
  seen.set(a, b);

  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (a instanceof RegExp || b instanceof RegExp) {
    return a instanceof RegExp && b instanceof RegExp && a.source === b.source && a.flags === b.flags;
  }
  if (a instanceof Map || b instanceof Map) {
    return a instanceof Map && b instanceof Map && a.size === b.size && mapsEqual(a, b, seen);
  }
  if (a instanceof Set || b instanceof Set) {
    return a instanceof Set && b instanceof Set && a.size === b.size && setsEqual(a, b, seen);
  }

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i], seen)) return false;
    }
    return true;
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key], seen)
  );
}

function readJson(source) {
  const text = source === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(source, "utf8");
  return JSON.parse(text);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error("Usage: deepequal.js <a.json | -> <b.json | ->");
    process.exit(2);
  }
  const [aFile, bFile] = args;

  let a, b;
  try {
    a = readJson(aFile);
    b = readJson(bFile);
  } catch (err) {
    console.error(`failed to read/parse input: ${err.message}`);
    process.exit(2);
  }

  if (deepEqual(a, b)) {
    console.log("equal");
    process.exit(0);
  } else {
    console.log("not equal");
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { deepEqual };
