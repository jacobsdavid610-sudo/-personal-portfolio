#!/usr/bin/env node
// Parse/stringify application/x-www-form-urlencoded query strings into a
// plain object, where a repeated key (`a=1&a=2`) or bracket notation
// (`a[]=1&a[]=2`) collapses into an array rather than staying a flat list
// of pairs - which is what most backends actually expect, and what the
// built-in URLSearchParams deliberately doesn't do. No dependencies.

function decodeComponent(str) {
  return decodeURIComponent(str.replace(/\+/g, " "));
}

function encodeComponent(str) {
  return encodeURIComponent(str).replace(/%20/g, "+");
}

function parse(qs) {
  const result = {};
  const trimmed = qs.startsWith("?") ? qs.slice(1) : qs;
  if (trimmed === "") return result;

  for (const pair of trimmed.split("&")) {
    if (pair === "") continue;
    const eq = pair.indexOf("=");
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawValue = eq === -1 ? "" : pair.slice(eq + 1);

    let key = decodeComponent(rawKey);
    const value = decodeComponent(rawValue);
    const isArrayKey = key.endsWith("[]");
    if (isArrayKey) key = key.slice(0, -2);

    if (Object.prototype.hasOwnProperty.call(result, key)) {
      if (Array.isArray(result[key])) {
        result[key].push(value);
      } else {
        result[key] = [result[key], value];
      }
    } else if (isArrayKey) {
      result[key] = [value];
    } else {
      result[key] = value;
    }
  }

  return result;
}

function stringify(obj, { arrayFormat = "repeat" } = {}) {
  const parts = [];
  for (const [key, value] of Object.entries(obj)) {
    const values = Array.isArray(value) ? value : [value];
    const outKey = Array.isArray(value) && arrayFormat === "brackets" ? `${key}[]` : key;
    for (const v of values) {
      parts.push(`${encodeComponent(outKey)}=${encodeComponent(String(v))}`);
    }
  }
  return parts.join("&");
}

function main(argv) {
  const [, , command, arg] = argv;

  if (command === "parse" && arg !== undefined) {
    console.log(JSON.stringify(parse(arg)));
    return 0;
  }
  if (command === "stringify" && arg !== undefined) {
    console.log(stringify(JSON.parse(arg)));
    return 0;
  }

  console.error("Usage: queryparams.js parse '<query-string>'");
  console.error("       queryparams.js stringify '<json-object>'");
  return 1;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { parse, stringify };
