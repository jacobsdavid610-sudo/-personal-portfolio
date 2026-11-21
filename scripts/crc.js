#!/usr/bin/env node
"use strict";
// Table-driven CRCs from the Rocksoft parameter model: width, polynomial,
// initial value, whether input bytes and the result are bit-reflected, and
// a final XOR. A catalogue of common ones (CRC-32, CRC-32C, CRC-16/MODBUS,
// CRC-64/XZ ...) is built in, each carrying its published check value (the
// CRC of "123456789"), which `selfTest()` verifies. No dependencies.

const fs = require("node:fs");

const mask = (w) => (1n << BigInt(w)) - 1n;
const h = BigInt;

// name -> [width, poly, init, refin, refout, xorout, check]; all hex strings
// except the booleans. Values are from the public CRC catalogue.
const CATALOGUE = {
  "crc-8": [8, "07", "00", false, false, "00", "f4"],
  "crc-16/arc": [16, "8005", "0000", true, true, "0000", "bb3d"],
  "crc-16/ccitt-false": [16, "1021", "ffff", false, false, "0000", "29b1"],
  "crc-16/xmodem": [16, "1021", "0000", false, false, "0000", "31c3"],
  "crc-16/kermit": [16, "1021", "0000", true, true, "0000", "2189"],
  "crc-16/modbus": [16, "8005", "ffff", true, true, "0000", "4b37"],
  "crc-32": [32, "04c11db7", "ffffffff", true, true, "ffffffff", "cbf43926"],
  "crc-32c": [32, "1edc6f41", "ffffffff", true, true, "ffffffff", "e3069283"],
  "crc-32/bzip2": [32, "04c11db7", "ffffffff", false, false, "ffffffff", "fc891918"],
  "crc-32/mpeg-2": [32, "04c11db7", "ffffffff", false, false, "00000000", "0376e6e7"],
  "crc-32/jamcrc": [32, "04c11db7", "ffffffff", true, true, "00000000", "340bc6d9"],
  "crc-64/ecma-182": [64, "42f0e1eba9ea3693", "0000000000000000", false, false, "0000000000000000", "6c40df5f0b497347"],
  "crc-64/xz": [64, "42f0e1eba9ea3693", "ffffffffffffffff", true, true, "ffffffffffffffff", "995dc9bbdf1939fa"],
};

const USAGE = `usage: crc.js [-a NAME] [FILE...]
       crc.js --list | --check

Prints the CRC of each FILE (or of stdin) as hex followed by the name.
  -a NAME  algorithm, default crc-32 (see --list)
  --list   show the built-in algorithms
  --check  verify every algorithm against its published check value
Exit 0 on success, 1 if a file couldn't be read or a check failed, 2 for a usage error.`;

class CRCError extends Error {}

function reflect(value, width) {
  let out = 0n;
  for (let i = 0; i < width; i++) if ((value >> h(i)) & 1n) out |= 1n << h(width - 1 - i);
  return out;
}

function lookup(spec) {
  if (typeof spec === "string") {
    const row = CATALOGUE[spec.toLowerCase()];
    if (!row) throw new CRCError(`unknown algorithm ${JSON.stringify(spec)} (try --list)`);
    return { name: spec.toLowerCase(), width: row[0], poly: h("0x" + row[1]), init: h("0x" + row[2]),
      refin: row[3], refout: row[4], xorout: h("0x" + row[5]), check: h("0x" + row[6]) };
  }
  const m = { name: "custom", check: null, ...spec };
  if (!Number.isInteger(m.width) || m.width < 8 || m.width > 64) {
    throw new CRCError("width must be an integer from 8 to 64");
  }
  for (const k of ["poly", "init", "xorout"]) {
    m[k] = h(m[k]);
    if (m[k] < 0n || m[k] > mask(m.width)) throw new CRCError(`${k} doesn't fit in ${m.width} bits`);
  }
  m.refin = Boolean(m.refin);
  m.refout = Boolean(m.refout);
  return m;
}

class CRC {
  constructor(spec = "crc-32") {
    const m = lookup(spec);
    Object.assign(this, m);
    this.mask = mask(m.width);
    this.table = new Array(256);
    // Reflected algorithms shift right through the reflected polynomial.
    const poly = m.refin ? reflect(m.poly, m.width) : m.poly;
    const top = 1n << h(m.width - 1);
    for (let i = 0; i < 256; i++) {
      let r = m.refin ? h(i) : h(i) << h(m.width - 8);
      for (let k = 0; k < 8; k++) {
        if (m.refin) r = r & 1n ? (r >> 1n) ^ poly : r >> 1n;
        else r = r & top ? ((r << 1n) ^ poly) & this.mask : (r << 1n) & this.mask;
      }
      this.table[i] = r;
    }
    this.reset();
  }

  reset() {
    this.reg = this.refin ? reflect(this.init, this.width) : this.init;
    return this;
  }

  update(data) {
    const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : data;
    if (!(bytes instanceof Uint8Array)) throw new TypeError("data must be a string or Uint8Array");
    const t = this.table;
    let reg = this.reg;
    if (this.width <= 32) {
      // Plain numbers are much faster than BigInt for the common 16/32-bit CRCs.
      const tn = this._tn || (this._tn = t.map(Number));
      let r = Number(reg);
      if (this.refin) {
        for (let i = 0; i < bytes.length; i++) r = (tn[(r ^ bytes[i]) & 0xff] ^ (r >>> 8)) >>> 0;
      } else {
        const sh = this.width - 8;
        const m = Number(this.mask);
        for (let i = 0; i < bytes.length; i++) r = ((tn[((r >>> sh) ^ bytes[i]) & 0xff] ^ (r << 8)) & m) >>> 0;
      }
      this.reg = h(r);
      return this;
    }
    if (this.refin) {
      for (let i = 0; i < bytes.length; i++) reg = t[Number((reg ^ h(bytes[i])) & 0xffn)] ^ (reg >> 8n);
    } else {
      const sh = h(this.width - 8);
      for (let i = 0; i < bytes.length; i++) {
        reg = (t[Number(((reg >> sh) ^ h(bytes[i])) & 0xffn)] ^ (reg << 8n)) & this.mask;
      }
    }
    this.reg = reg;
    return this;
  }

  // The finished CRC as a BigInt. Doesn't disturb the running state.
  get value() {
    let r = this.reg;
    if (this.refin !== this.refout) r = reflect(r, this.width);
    return (r ^ this.xorout) & this.mask;
  }

  hex() {
    return this.value.toString(16).padStart(Math.ceil(this.width / 4), "0");
  }
}

function crc(spec, data) {
  return new CRC(spec).update(data).value;
}

function selfTest() {
  const bad = [];
  for (const name of Object.keys(CATALOGUE)) {
    const got = new CRC(name).update("123456789").value;
    if (got !== lookup(name).check) bad.push(`${name}: got ${got.toString(16)}, want ${lookup(name).check.toString(16)}`);
  }
  return bad;
}

function main(argv, { out = process.stdout, err = process.stderr, input = null } = {}) {
  let algo = "crc-32";
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") {
      for (const n of Object.keys(CATALOGUE)) out.write(`${n}\n`);
      return 0;
    } else if (a === "--check") {
      const bad = selfTest();
      for (const b of bad) err.write(`crc: ${b}\n`);
      out.write(bad.length ? "" : `all ${Object.keys(CATALOGUE).length} algorithms match their check values\n`);
      return bad.length ? 1 : 0;
    } else if (a === "-a") {
      algo = argv[++i];
      if (algo === undefined) {
        err.write(`crc: -a needs a name\n${USAGE}\n`);
        return 2;
      }
    } else if (a === "--") {
      files.push(...argv.slice(i + 1));
      break;
    } else if (a.startsWith("-") && a !== "-") {
      err.write(`crc: unknown option ${a}\n${USAGE}\n`);
      return 2;
    } else files.push(a);
  }
  let engine;
  try {
    engine = new CRC(algo);
  } catch (e) {
    if (!(e instanceof CRCError)) throw e;
    err.write(`crc: ${e.message}\n`);
    return 2;
  }
  let failed = false;
  for (const f of files.length ? files : ["-"]) {
    try {
      engine.reset();
      if (f === "-") engine.update(input !== null ? input : fs.readFileSync(0));
      else {
        // Stream in chunks so a large file isn't read into memory at once.
        const fd = fs.openSync(f, "r");
        try {
          const buf = Buffer.alloc(1 << 16);
          for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0; ) engine.update(buf.subarray(0, n));
        } finally {
          fs.closeSync(fd);
        }
      }
      out.write(`${engine.hex()}  ${f === "-" ? "-" : f}\n`);
    } catch (e) {
      if (e instanceof CRCError || e.code === undefined) throw e;
      failed = true;
      err.write(`crc: ${f}: ${e.code === "ENOENT" ? "no such file" : e.message}\n`);
    }
  }
  return failed ? 1 : 0;
}

module.exports = { CRC, CRCError, crc, selfTest, CATALOGUE, main };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
