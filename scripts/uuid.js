#!/usr/bin/env node
// Generate and parse UUIDs per RFC 9562: random v4, and time-ordered v7
// (48-bit Unix ms timestamp up front, so they sort by creation time -
// much friendlier to B-tree database indexes than v4). No dependencies
// beyond node:crypto.

const crypto = require("crypto");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TIMESTAMP = 2 ** 48 - 1;
const COUNTER_MAX = 0xfff; // rand_a is 12 bits

function format(bytes) {
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function setVersionAndVariant(bytes, version) {
  bytes[6] = (bytes[6] & 0x0f) | (version << 4);
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 9562 variant: 10xx
  return bytes;
}

/** Random UUIDv4. */
function v4(options = {}) {
  const { random = crypto.randomBytes } = options;
  return format(setVersionAndVariant(random(16), 4));
}

/**
 * Builds a v7 generator with its own monotonic state.
 *
 * Within the same millisecond, rand_a (12 bits) is used as a counter
 * seeded from random bits (RFC 9562 section 6.2, method 1), so IDs from
 * one generator are strictly increasing even when called in a tight
 * loop. If the counter overflows, or the clock goes backwards, the
 * timestamp is nudged forward by 1ms from the last one issued rather
 * than ever emitting an ID that sorts before the previous one.
 *
 * @param {object} [options]
 * @param {Function} [options.clock=Date.now] - injectable for tests.
 * @param {Function} [options.random=crypto.randomBytes]
 */
function createV7Generator(options = {}) {
  const { clock = Date.now, random = crypto.randomBytes } = options;
  let lastTs = -1;
  let counter = 0;

  return function v7() {
    let ts = Math.floor(clock());
    if (!Number.isInteger(ts) || ts < 0 || ts > MAX_TIMESTAMP) {
      throw new RangeError(`clock returned ${ts}, outside the 48-bit ms range`);
    }

    const bytes = random(16);
    if (ts > lastTs) {
      // Seed the counter in the lower half of its range so there's
      // headroom to increment before overflowing within this ms.
      counter = ((bytes[6] << 8) | bytes[7]) & 0x7ff;
    } else {
      ts = lastTs;
      counter += 1;
      if (counter > COUNTER_MAX) {
        ts += 1;
        counter = 0;
      }
    }
    lastTs = ts;

    // 48-bit big-endian timestamp. Split into two parts because JS
    // bitwise ops only work on 32 bits.
    const hi = Math.floor(ts / 2 ** 16);
    bytes[0] = (hi >>> 24) & 0xff;
    bytes[1] = (hi >>> 16) & 0xff;
    bytes[2] = (hi >>> 8) & 0xff;
    bytes[3] = hi & 0xff;
    bytes[4] = (ts >>> 8) & 0xff;
    bytes[5] = ts & 0xff;
    bytes[6] = (counter >>> 8) & 0x0f;
    bytes[7] = counter & 0xff;

    return format(setVersionAndVariant(bytes, 7));
  };
}

const v7 = createV7Generator();

function isValid(str) {
  return typeof str === "string" && UUID_RE.test(str);
}

/**
 * Parses a UUID string. Returns { version, variant, bytes } plus
 * { timestamp, date } for v7. Throws on anything that isn't
 * 8-4-4-4-12 hex.
 */
function parse(str) {
  if (!isValid(str)) {
    throw new TypeError(`not a UUID: ${JSON.stringify(str)}`);
  }
  const bytes = Buffer.from(str.replace(/-/g, ""), "hex");
  const version = bytes[6] >>> 4;

  let variant;
  if ((bytes[8] & 0x80) === 0) variant = "ncs";
  else if ((bytes[8] & 0xc0) === 0x80) variant = "rfc9562";
  else if ((bytes[8] & 0xe0) === 0xc0) variant = "microsoft";
  else variant = "future";

  const result = { version, variant, bytes };
  if (version === 7 && variant === "rfc9562") {
    const timestamp = bytes.readUIntBE(0, 6);
    result.timestamp = timestamp;
    result.date = new Date(timestamp);
  }
  return result;
}

module.exports = { v4, v7, createV7Generator, parse, isValid, format };

if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0] || "v4";

  if (cmd === "parse") {
    if (!args[1]) {
      console.error("Usage: uuid.js parse <uuid>");
      process.exit(2);
    }
    let info;
    try {
      info = parse(args[1]);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    console.log(`version: ${info.version}`);
    console.log(`variant: ${info.variant}`);
    if (info.date) console.log(`created: ${info.date.toISOString()}`);
    process.exit(0);
  }

  if (cmd !== "v4" && cmd !== "v7") {
    console.error("Usage: uuid.js [v4|v7] [-n COUNT] | uuid.js parse <uuid>");
    process.exit(2);
  }
  const nIdx = args.indexOf("-n");
  const count = nIdx !== -1 ? Number(args[nIdx + 1]) : 1;
  if (!Number.isInteger(count) || count < 1) {
    console.error("-n must be a positive integer");
    process.exit(2);
  }
  const gen = cmd === "v7" ? v7 : v4;
  for (let i = 0; i < count; i++) console.log(gen());
}
