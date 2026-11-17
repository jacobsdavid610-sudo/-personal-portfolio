#!/usr/bin/env node
"use strict";
// Base32 (RFC 4648): the 32-character alphabet that survives being read
// aloud, typed by hand or stored in a case-insensitive filesystem. Both
// alphabets from the RFC are here, "std" (section 6) and "hex" (section 7).
// No dependencies.

const fs = require("node:fs");

const ALPHABETS = {
  std: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
  hex: "0123456789ABCDEFGHIJKLMNOPQRSTUV",
};

// How many data characters a final group of 1..4 bytes needs, and back.
// A 5-byte group is 8 characters; the others leave 2, 4, 5 or 7.
const CHARS_FOR_BYTES = [0, 2, 4, 5, 7];
const BYTES_FOR_CHARS = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4 };

const USAGE = `usage: base32.js [-d] [--hex] [--no-pad] [-w COLS] [FILE]

Encodes FILE (or stdin) as Base32; -d decodes instead.
  -d        decode
  --hex     use the "extended hex" alphabet (0-9A-V) instead of A-Z2-7
  --no-pad  leave off the trailing = when encoding
  -w COLS   wrap encoded output at COLS characters (0 = never; default 0)
Exit 0 on success, 1 for bad input, 2 for a usage error.`;

class Base32Error extends Error {}

function alphabet(variant) {
  const a = ALPHABETS[variant];
  if (a === undefined) throw new TypeError(`unknown variant ${JSON.stringify(variant)}`);
  return a;
}

function toBytes(data) {
  if (typeof data === "string") return Buffer.from(data, "utf8");
  if (data instanceof Uint8Array) return data;
  throw new TypeError("data must be a string or Uint8Array");
}

function encode(data, { variant = "std", pad = true } = {}) {
  const chars = alphabet(variant);
  const bytes = toBytes(data);
  let out = "";
  for (let i = 0; i < bytes.length; i += 5) {
    const n = Math.min(5, bytes.length - i);
    // Up to 40 bits don't fit a 32-bit int, so build the group in a BigInt.
    let group = 0n;
    for (let j = 0; j < 5; j++) group = (group << 8n) | BigInt(j < n ? bytes[i + j] : 0);
    const count = n === 5 ? 8 : CHARS_FOR_BYTES[n];
    for (let k = 0; k < count; k++) out += chars[Number((group >> BigInt(35 - 5 * k)) & 31n)];
    if (pad) out += "=".repeat(8 - count);
  }
  return out;
}

function decode(text, { variant = "std" } = {}) {
  const chars = alphabet(variant);
  if (typeof text !== "string") throw new TypeError("text must be a string");
  // Padding is optional, but if it is there it has to be exactly right.
  const m = /^([^=]*)(=*)$/.exec(text);
  if (!m) throw new Base32Error("padding (=) can only appear at the end");
  const body = m[1];
  const padding = m[2].length;
  const tail = body.length % 8;
  if (!(tail in BYTES_FOR_CHARS)) {
    throw new Base32Error(`${body.length} characters is not a valid Base32 length`);
  }
  if (padding !== 0 && padding !== (tail === 0 ? 0 : 8 - tail)) {
    throw new Base32Error(`expected ${tail === 0 ? 0 : 8 - tail} padding characters, got ${padding}`);
  }
  const bytes = [];
  for (let i = 0; i < body.length; i += 8) {
    const count = Math.min(8, body.length - i);
    let group = 0n;
    for (let j = 0; j < 8; j++) {
      let v = 0;
      if (j < count) {
        const ch = body[i + j];
        // The RFC alphabet is upper case; lower case is accepted since
        // people type it, but nothing else is.
        v = chars.indexOf(/[a-z]/.test(ch) ? ch.toUpperCase() : ch);
        if (v < 0) {
          throw new Base32Error(`invalid character ${JSON.stringify(ch)} at position ${i + j}`);
        }
      }
      group = (group << 5n) | BigInt(v);
    }
    const nbytes = count === 8 ? 5 : BYTES_FOR_CHARS[count];
    // Bits past the last whole byte must be zero, or two different strings
    // would decode to the same bytes ("MY" and "MZ" would both be "f").
    const spare = BigInt(count * 5 - nbytes * 8);
    if (count < 8 && (group >> BigInt(40 - count * 5)) & ((1n << spare) - 1n)) {
      throw new Base32Error("non-zero trailing bits in the last character");
    }
    for (let k = 0; k < nbytes; k++) bytes.push(Number((group >> BigInt(32 - 8 * k)) & 255n));
  }
  return Buffer.from(bytes);
}

function wrap(text, cols) {
  if (!cols) return text + "\n";
  let out = "";
  for (let i = 0; i < text.length; i += cols) out += text.slice(i, i + cols) + "\n";
  return out || "\n";
}

function main(argv, { out = process.stdout, err = process.stderr, input = null } = {}) {
  let reverse = false;
  let variant = "std";
  let pad = true;
  let cols = 0;
  let file = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-d") reverse = true;
    else if (a === "--hex") variant = "hex";
    else if (a === "--no-pad") pad = false;
    else if (a === "-w") {
      const v = argv[++i];
      if (v === undefined || !/^\d+$/.test(v)) {
        err.write(`base32: -w needs a number\n${USAGE}\n`);
        return 2;
      }
      cols = Number(v);
    } else if (a.startsWith("-") && a !== "-") {
      err.write(`base32: unknown option ${a}\n${USAGE}\n`);
      return 2;
    } else if (file === null) file = a;
    else {
      err.write(`base32: only one FILE allowed\n${USAGE}\n`);
      return 2;
    }
  }
  let data;
  try {
    data = input !== null ? input : fs.readFileSync(file === null || file === "-" ? 0 : file);
  } catch (e) {
    err.write(`base32: ${e.message}\n`);
    return 1;
  }
  if (reverse) {
    try {
      // Line breaks from wrapped output are not part of the encoding.
      const text = Buffer.from(data).toString("latin1").replace(/\r?\n/g, "");
      out.write(decode(text, { variant }));
    } catch (e) {
      if (!(e instanceof Base32Error)) throw e;
      err.write(`base32: ${e.message}\n`);
      return 1;
    }
  } else {
    out.write(wrap(encode(data, { variant, pad }), cols));
  }
  return 0;
}

module.exports = { encode, decode, Base32Error, main };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
