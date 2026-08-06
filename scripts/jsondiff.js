#!/usr/bin/env node
// Deep diff two JSON values and report added/removed/changed paths.
// No dependencies.

const fs = require("node:fs");

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function joinPath(base, key) {
  return base === "" ? String(key) : `${base}.${key}`;
}

function diff(a, b, path = "") {
  const changes = [];

  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const childPath = joinPath(path, key);
      if (!(key in a)) {
        changes.push({ type: "added", path: childPath, value: b[key] });
      } else if (!(key in b)) {
        changes.push({ type: "removed", path: childPath, value: a[key] });
      } else {
        changes.push(...diff(a[key], b[key], childPath));
      }
    }
    return changes;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      const childPath = joinPath(path, i);
      if (i >= a.length) {
        changes.push({ type: "added", path: childPath, value: b[i] });
      } else if (i >= b.length) {
        changes.push({ type: "removed", path: childPath, value: a[i] });
      } else {
        changes.push(...diff(a[i], b[i], childPath));
      }
    }
    return changes;
  }

  if (!deepEqual(a, b)) {
    changes.push({ type: "changed", path: path || "(root)", from: a, to: b });
  }
  return changes;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (isPlainObject(a) && isPlainObject(b)) {
    return diff(a, b).length === 0;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return diff(a, b).length === 0;
  }
  return false;
}

function formatChange(change) {
  switch (change.type) {
    case "added":
      return `+ ${change.path} = ${JSON.stringify(change.value)}`;
    case "removed":
      return `- ${change.path} = ${JSON.stringify(change.value)}`;
    case "changed":
      return `~ ${change.path}: ${JSON.stringify(change.from)} -> ${JSON.stringify(change.to)}`;
    default:
      return `? ${change.path}`;
  }
}

function main(argv) {
  const [fileA, fileB] = argv.slice(2);
  if (!fileA || !fileB) {
    console.error("Usage: jsondiff.js <a.json> <b.json>");
    return 1;
  }

  const a = JSON.parse(fs.readFileSync(fileA, "utf8"));
  const b = JSON.parse(fs.readFileSync(fileB, "utf8"));
  const changes = diff(a, b);

  if (changes.length === 0) {
    console.log("No differences.");
    return 0;
  }

  for (const change of changes) {
    console.log(formatChange(change));
  }
  console.log(`\n${changes.length} difference(s).`);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { diff, deepEqual };
