#!/usr/bin/env node
"use strict";
// Punycode (RFC 3492) and the domain-name wrapping around it: `münchen.de`
// <-> `xn--mnchen-3ya.de`. `encode`/`decode` work on a single string;
// `toASCII`/`toUnicode` work label by label on a whole domain name.
// No dependencies.

const fs = require("node:fs");

const BASE = 36;
const TMIN = 1;
const TMAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;
const MAX = 0x7fffffff; // the RFC's overflow limit; keeps every sum exact
const ACE = "xn--";
const DOTS = /[.。．｡]/; // IDNA treats the ideographic full stops as dots too

const USAGE = `usage: punycode.js [-d] [--raw] [NAME...]

Converts each NAME (or each line of stdin) to its ASCII form, e.g.
münchen.de -> xn--mnchen-3ya.de.
  -d     the other way: xn--mnchen-3ya.de -> münchen.de
  --raw  bare Punycode with no xn-- prefix or dots (RFC 3492 only)
Exit 0 if every name converted, 1 if any could not, 2 for a usage error.`;

class PunycodeError extends Error {}

function adapt(delta, numPoints, firstTime) {
  delta = firstTime ? Math.floor(delta / DAMP) : Math.floor(delta / 2);
  delta += Math.floor(delta / numPoints);
  let k = 0;
  while (delta > ((BASE - TMIN) * TMAX) / 2) {
    delta = Math.floor(delta / (BASE - TMIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - TMIN + 1) * delta) / (delta + SKEW));
}

function threshold(k, bias) {
  if (k <= bias) return TMIN;
  if (k >= bias + TMAX) return TMAX;
  return k - bias;
}

function digitChar(d) {
  return String.fromCharCode(d < 26 ? 97 + d : 22 + d); // a-z, then 0-9
}

function digitValue(code) {
  if (code >= 48 && code <= 57) return code - 22; // 0-9
  if (code >= 65 && code <= 90) return code - 65; // A-Z
  if (code >= 97 && code <= 122) return code - 97; // a-z
  return -1;
}

// Code points, refusing lone surrogates: they can't be encoded and would
// decode to a different string.
function codePoints(str) {
  const out = [];
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c >= 0xd800 && c <= 0xdfff) throw new PunycodeError("lone surrogate in input");
    out.push(c);
  }
  return out;
}

function fromCodePoints(cps) {
  return cps.map((c) => String.fromCodePoint(c)).join("");
}

// RFC 3492 section 6.3. Basic (ASCII) code points are copied as they are,
// case included; everything else becomes lower-case digits after the last
// "-".
function encode(input) {
  if (typeof input !== "string") throw new TypeError("input must be a string");
  const cps = codePoints(input);
  let out = cps.filter((c) => c < 0x80).map((c) => String.fromCharCode(c)).join("");
  const b = out.length;
  let h = b;
  if (b > 0) out += "-";
  let n = INITIAL_N;
  let delta = 0;
  let bias = INITIAL_BIAS;
  while (h < cps.length) {
    let m = MAX + 1;
    for (const c of cps) if (c >= n && c < m) m = c;
    if (m - n > Math.floor((MAX - delta) / (h + 1))) throw new PunycodeError("input too long to encode");
    delta += (m - n) * (h + 1);
    n = m;
    for (const c of cps) {
      if (c < n && ++delta > MAX) throw new PunycodeError("input too long to encode");
      if (c !== n) continue;
      let q = delta;
      for (let k = BASE; ; k += BASE) {
        const t = threshold(k, bias);
        if (q < t) break;
        out += digitChar(t + ((q - t) % (BASE - t)));
        q = Math.floor((q - t) / (BASE - t));
      }
      out += digitChar(q);
      bias = adapt(delta, h + 1, h === b);
      delta = 0;
      h++;
    }
    delta++;
    n++;
  }
  return out;
}

// RFC 3492 section 6.2, including every failure case it lists. Digits are
// read in either case.
function decode(input) {
  if (typeof input !== "string") throw new TypeError("input must be a string");
  for (let j = 0; j < input.length; j++) {
    if (input.charCodeAt(j) >= 0x80) throw new PunycodeError("non-ASCII character in Punycode");
  }
  const d = input.lastIndexOf("-");
  const out = d > 0 ? codePoints(input.slice(0, d)) : [];
  let pos = d > 0 ? d + 1 : 0;
  let n = INITIAL_N;
  let i = 0;
  let bias = INITIAL_BIAS;
  while (pos < input.length) {
    const oldi = i;
    let w = 1;
    for (let k = BASE; ; k += BASE) {
      if (pos >= input.length) throw new PunycodeError("truncated Punycode");
      const digit = digitValue(input.charCodeAt(pos++));
      if (digit < 0) throw new PunycodeError(`invalid Punycode digit "${input[pos - 1]}"`);
      if (digit > Math.floor((MAX - i) / w)) throw new PunycodeError("Punycode overflow");
      i += digit * w;
      const t = threshold(k, bias);
      if (digit < t) break;
      if (w > Math.floor(MAX / (BASE - t))) throw new PunycodeError("Punycode overflow");
      w *= BASE - t;
    }
    const len = out.length + 1;
    bias = adapt(i - oldi, len, oldi === 0);
    if (Math.floor(i / len) > MAX - n) throw new PunycodeError("Punycode overflow");
    n += Math.floor(i / len);
    i %= len;
    if (n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) {
      throw new PunycodeError(`Punycode decodes to an invalid code point U+${n.toString(16).toUpperCase()}`);
    }
    out.splice(i, 0, n);
    i++;
  }
  return fromCodePoints(out);
}

function isASCII(s) {
  return /^[\x00-\x7f]*$/.test(s);
}

// The labels of a domain name, without the root's trailing dot. Empty
// labels in the middle (`a..b`) are an error rather than something to fold.
function labelsOf(domain) {
  if (typeof domain !== "string") throw new TypeError("domain must be a string");
  const labels = domain.split(DOTS);
  if (labels.length > 1 && labels[labels.length - 1] === "") labels.pop();
  if (labels.some((l) => l === "")) throw new PunycodeError(`empty label in "${domain}"`);
  return labels;
}

function checkLengths(labels, trailingDot) {
  for (const l of labels) {
    if (l.length > 63) throw new PunycodeError(`label longer than 63 characters: ${l}`);
  }
  const total = labels.join(".").length;
  if (total > 253) throw new PunycodeError(`name longer than 253 characters (${total})`);
  return labels.join(".") + (trailingDot ? "." : "");
}

// What a Unicode label is turned into before encoding: NFC, then lower
// case, so `MÜNCHEN` and `münchen` give the same ACE label.
function prepare(label) {
  return label.normalize("NFC").toLowerCase();
}

// An `xn--` label decoded, refusing anything that isn't the one canonical
// encoding of its result: pure ASCII (`xn--abc-`), upper case or
// non-NFC text, or digits that encode differently.
function decodeLabel(label) {
  const unicode = decode(label.slice(ACE.length));
  if (isASCII(unicode)) throw new PunycodeError(`${label} encodes plain ASCII`);
  if (ACE + encode(prepare(unicode)) !== label.toLowerCase()) {
    throw new PunycodeError(`${label} is not a canonical encoding`);
  }
  return unicode;
}

function hasTrailingDot(domain) {
  return domain.length > 1 && DOTS.test(domain[domain.length - 1]);
}

// `münchen.de` -> `xn--mnchen-3ya.de`. ASCII labels are lower-cased and
// checked if they already carry the xn-- prefix; others are NFC-normalised,
// lower-cased and encoded.
function toASCII(domain) {
  const labels = labelsOf(domain).map((label) => {
    if (!isASCII(label)) return ACE + encode(prepare(label));
    const lower = label.toLowerCase();
    if (lower.startsWith(ACE)) decodeLabel(lower);
    return lower;
  });
  return checkLengths(labels, hasTrailingDot(domain));
}

// `xn--mnchen-3ya.de` -> `münchen.de`. Other labels are left as they are.
function toUnicode(domain) {
  const labels = labelsOf(domain);
  checkLengths(labels.map((l) => (isASCII(l) ? l : ACE + encode(prepare(l)))), false);
  const out = labels.map((label) => (label.slice(0, ACE.length).toLowerCase() === ACE ? decodeLabel(label) : label));
  return out.join(".") + (hasTrailingDot(domain) ? "." : "");
}

function main(argv, input = null, out = process.stdout, err = process.stderr) {
  let reverse = false;
  let raw = false;
  const names = [];
  for (const [i, a] of argv.entries()) {
    if (a === "--") {
      names.push(...argv.slice(i + 1));
      break;
    } else if (a === "-d") reverse = true;
    else if (a === "--raw") raw = true;
    else if (a.startsWith("-") && a !== "-") {
      err.write(`punycode: unknown option ${a}\n${USAGE}\n`);
      return 2;
    } else names.push(a);
  }
  if (names.length === 0) {
    const text = input !== null ? input : fs.readFileSync(0, "utf8");
    names.push(...text.split(/\r?\n/).filter((l) => l !== ""));
  }
  const convert = raw ? (reverse ? decode : encode) : reverse ? toUnicode : toASCII;
  let failed = false;
  for (const name of names) {
    try {
      out.write(convert(name) + "\n");
    } catch (e) {
      if (!(e instanceof PunycodeError)) throw e;
      failed = true;
      err.write(`punycode: ${JSON.stringify(name)}: ${e.message}\n`);
    }
  }
  return failed ? 1 : 0;
}

module.exports = { encode, decode, toASCII, toUnicode, PunycodeError, main };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
