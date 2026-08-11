#!/usr/bin/env node
// Base64 encode/decode implemented from the actual bit-manipulation
// algorithm - no Buffer.from(...).toString("base64") or atob/btoa. Takes
// bytes in, processes 3 bytes -> 4 chars (or the reverse) by hand.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const PAD = "=";

function encode(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;

    const chunk = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);

    out += ALPHABET[(chunk >> 18) & 0x3f];
    out += ALPHABET[(chunk >> 12) & 0x3f];
    out += b1 === undefined ? PAD : ALPHABET[(chunk >> 6) & 0x3f];
    out += b2 === undefined ? PAD : ALPHABET[chunk & 0x3f];
  }
  return out;
}

function decode(str) {
  const clean = str.replace(/[^A-Za-z0-9+/=]/g, "");
  const bytes = [];

  for (let i = 0; i < clean.length; i += 4) {
    const chars = clean.slice(i, i + 4);
    const values = chars.split("").map((c) => (c === PAD ? 0 : ALPHABET.indexOf(c)));
    const padCount = (chars.match(/=/g) || []).length;

    const chunk = (values[0] << 18) | (values[1] << 12) | ((values[2] ?? 0) << 6) | (values[3] ?? 0);

    bytes.push((chunk >> 16) & 0xff);
    if (padCount < 2) bytes.push((chunk >> 8) & 0xff);
    if (padCount < 1) bytes.push(chunk & 0xff);
  }

  return Uint8Array.from(bytes);
}

function encodeText(text) {
  return encode(Uint8Array.from(Buffer.from(text, "utf8")));
}

function decodeText(str) {
  return Buffer.from(decode(str)).toString("utf8");
}

function main(argv) {
  const args = argv.slice(2);
  const mode = args[0];
  const input = args[1];

  if ((mode !== "encode" && mode !== "decode") || input === undefined) {
    console.error("Usage: base64.js <encode|decode> <text>");
    return 1;
  }

  console.log(mode === "encode" ? encodeText(input) : decodeText(input));
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { encode, decode, encodeText, decodeText };
