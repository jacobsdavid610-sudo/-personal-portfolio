// URL query string parse/stringify, built from scratch (no URLSearchParams).

/**
 * Parses a query string (with or without a leading "?") into a plain
 * object. A repeated key collects into an array; a key with no "="
 * (e.g. "flag" in "a=1&flag") is treated as present with value "".
 */
function parse(qs) {
  if (typeof qs !== "string") {
    throw new TypeError("query string must be a string");
  }
  const trimmed = qs.startsWith("?") ? qs.slice(1) : qs;
  const result = {};
  if (trimmed === "") return result;

  for (const pair of trimmed.split("&")) {
    if (pair === "") continue;
    const eq = pair.indexOf("=");
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawValue = eq === -1 ? "" : pair.slice(eq + 1);
    const key = decodeComponent(rawKey);
    const value = decodeComponent(rawValue);

    if (Object.prototype.hasOwnProperty.call(result, key)) {
      if (Array.isArray(result[key])) {
        result[key].push(value);
      } else {
        result[key] = [result[key], value];
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Stringifies a plain object into a query string (no leading "?"). An
 * array value becomes repeated `key=value` pairs, in array order.
 * `null`/`undefined` values are skipped entirely — not even the key is
 * emitted, since there's no meaningful way to round-trip "present but
 * null" through a query string anyway.
 */
function stringify(obj) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    throw new TypeError("value must be a plain object");
  }
  const parts = [];
  for (const [key, value] of Object.entries(obj)) {
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (v === null || v === undefined) continue;
      parts.push(`${encodeComponent(key)}=${encodeComponent(String(v))}`);
    }
  }
  return parts.join("&");
}

// application/x-www-form-urlencoded convention: space <-> "+", not "%20".
function decodeComponent(s) {
  return decodeURIComponent(s.replace(/\+/g, " "));
}

function encodeComponent(s) {
  return encodeURIComponent(s).replace(/%20/g, "+");
}

module.exports = { parse, stringify };
