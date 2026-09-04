#!/usr/bin/env node
// A small subset of JSONPath: dot keys, bracket['keys with dots or dashes'],
// numeric array indices, and `*` wildcards (`.* `or `[*]`) over arrays and
// objects. No dependencies - a `jq`-lite for querying JSON from a script
// without shelling out to a tool that might not be installed.

const fs = require("node:fs");

const TOKEN_RE = /^(?:\.(\*)|\.([A-Za-z0-9_]+)|\[(\*)\]|\[(\d+)\]|\['([^']*)'\])/;

function parsePath(path) {
  if (!path.startsWith("$")) {
    throw new Error(`path must start with '$': ${path}`);
  }
  let rest = path.slice(1);
  const segments = [];

  while (rest.length > 0) {
    const m = TOKEN_RE.exec(rest);
    if (!m) {
      throw new Error(`unexpected token in path at: ${rest}`);
    }
    if (m[1] !== undefined || m[3] !== undefined) {
      segments.push({ type: "wildcard" });
    } else if (m[2] !== undefined || m[5] !== undefined) {
      segments.push({ type: "key", name: m[2] !== undefined ? m[2] : m[5] });
    } else {
      segments.push({ type: "index", value: Number(m[4]) });
    }
    rest = rest.slice(m[0].length);
  }

  return segments;
}

function query(obj, path) {
  const segments = parsePath(path);
  let current = [obj];

  for (const seg of segments) {
    const next = [];
    for (const value of current) {
      if (seg.type === "key") {
        if (isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, seg.name)) {
          next.push(value[seg.name]);
        }
      } else if (seg.type === "index") {
        if (Array.isArray(value) && seg.value >= 0 && seg.value < value.length) {
          next.push(value[seg.value]);
        }
      } else if (Array.isArray(value)) {
        next.push(...value);
      } else if (isPlainObject(value)) {
        next.push(...Object.values(value));
      }
    }
    current = next;
  }

  return current;
}

function queryOne(obj, path) {
  return query(obj, path)[0];
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function main(argv) {
  const [, , filePath, path] = argv;
  if (!filePath || !path) {
    console.error("Usage: jsonpath.js <file.json> <path>");
    return 1;
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const matches = query(data, path);

  for (const match of matches) {
    console.log(JSON.stringify(match));
  }

  return matches.length > 0 ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { parsePath, query, queryOne };
