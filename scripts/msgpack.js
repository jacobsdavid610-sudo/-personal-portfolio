#!/usr/bin/env node
"use strict";
// MessagePack (https://github.com/msgpack/msgpack/blob/master/spec.md):
// encode and decode, always using the smallest form for a value. Integers
// beyond 2^53 are BigInt, Buffers are bin, Date is the timestamp extension
// (type -1), and other extensions round-trip as Ext objects. Decoding is
// strict: truncated input, trailing bytes and invalid UTF-8 are errors.
// No dependencies.

const fs = require("node:fs");

const USAGE = `usage: msgpack.js [-d] [--hex] [FILE]

Encodes JSON from FILE (or stdin) as MessagePack; -d decodes instead and
prints JSON. Binary values show as {"$bin": "<base64>"}, extensions as
{"$ext": TYPE, "data": "<base64>"}, and integers beyond 2^53 as strings.
  -d     decode
  --hex  read/write the MessagePack as hex text instead of raw bytes
Exit 0 on success, 1 for bad input, 2 for a usage error.`;

class MsgpackError extends Error {}

class Ext {
  constructor(type, data) {
    if (!Number.isInteger(type) || type < -128 || type > 127) throw new RangeError("ext type must be -128..127");
    this.type = type;
    this.data = Buffer.from(data);
  }
}

const MAX_DEPTH = 512;
const utf8 = new TextDecoder("utf-8", { fatal: true });

// ---- encode ---------------------------------------------------------------

function encode(value) {
  const chunks = [];
  write(value, chunks, 0);
  return Buffer.concat(chunks);
}

function byte(...b) {
  return Buffer.from(b);
}

function sized(n, bytes) {
  const b = Buffer.alloc(bytes);
  if (bytes === 1) b.writeUInt8(n);
  else if (bytes === 2) b.writeUInt16BE(n);
  else b.writeUInt32BE(n);
  return b;
}

function writeInt(n, out) {
  if (typeof n === "number") {
    if (n >= 0) {
      if (n < 128) return out.push(byte(n));
      if (n < 0x100) return out.push(byte(0xcc), sized(n, 1));
      if (n < 0x10000) return out.push(byte(0xcd), sized(n, 2));
      if (n < 0x100000000) return out.push(byte(0xce), sized(n, 4));
    } else {
      if (n >= -32) return out.push(byte(n & 0xff));
      if (n >= -128) return out.push(byte(0xd0, n & 0xff));
      if (n >= -32768) {
        const b = Buffer.alloc(2);
        b.writeInt16BE(n);
        return out.push(byte(0xd1), b);
      }
      if (n >= -2147483648) {
        const b = Buffer.alloc(4);
        b.writeInt32BE(n);
        return out.push(byte(0xd2), b);
      }
    }
    n = BigInt(n);
  }
  const b = Buffer.alloc(8);
  if (n >= 0n) {
    if (n > 0xffffffffffffffffn) throw new MsgpackError("integer does not fit in 64 bits");
    b.writeBigUInt64BE(n);
    return out.push(byte(0xcf), b);
  }
  if (n < -0x8000000000000000n) throw new MsgpackError("integer does not fit in 64 bits");
  b.writeBigInt64BE(n);
  return out.push(byte(0xd3), b);
}

function header(len, fix, fixMax, tags, out) {
  // fix: base of the fix form (or null); tags: [8-bit, 16-bit, 32-bit] markers (null if absent)
  if (fix !== null && len <= fixMax) return out.push(byte(fix | len));
  if (tags[0] !== null && len < 0x100) return out.push(byte(tags[0]), sized(len, 1));
  if (len < 0x10000) return out.push(byte(tags[1]), sized(len, 2));
  if (len < 0x100000000) return out.push(byte(tags[2]), sized(len, 4));
  throw new MsgpackError("too long to encode");
}

function writeExt(type, data, out) {
  const fixed = { 1: 0xd4, 2: 0xd5, 4: 0xd6, 8: 0xd7, 16: 0xd8 }[data.length];
  const t = Buffer.alloc(1);
  t.writeInt8(type);
  if (fixed) out.push(byte(fixed), t, data);
  else {
    header(data.length, null, 0, [0xc7, 0xc8, 0xc9], out);
    out.push(t, data);
  }
}

function writeDate(d, out) {
  const ms = d.getTime();
  if (Number.isNaN(ms)) throw new MsgpackError("cannot encode an invalid Date");
  const sec = Math.floor(ms / 1000);
  const nsec = (ms - sec * 1000) * 1e6;
  let data;
  if (nsec === 0 && sec >= 0 && sec < 0x100000000) {
    data = Buffer.alloc(4);
    data.writeUInt32BE(sec);
  } else if (sec >= 0 && sec < 2 ** 34) {
    data = Buffer.alloc(8);
    data.writeBigUInt64BE((BigInt(nsec) << 34n) | BigInt(sec));
  } else {
    data = Buffer.alloc(12);
    data.writeUInt32BE(nsec);
    data.writeBigInt64BE(BigInt(sec), 4);
  }
  writeExt(-1, data, out);
}

function write(v, out, depth) {
  if (depth > MAX_DEPTH) throw new MsgpackError("nested too deeply");
  if (v === null || v === undefined) return out.push(byte(0xc0));
  if (v === false) return out.push(byte(0xc2));
  if (v === true) return out.push(byte(0xc3));
  if (typeof v === "bigint") return writeInt(v, out);
  if (typeof v === "number") {
    if (Number.isSafeInteger(v) && !Object.is(v, -0)) return writeInt(v, out);
    const b = Buffer.alloc(8);
    b.writeDoubleBE(v);
    return out.push(byte(0xcb), b);
  }
  if (typeof v === "string") {
    const s = Buffer.from(v, "utf8");
    header(s.length, 0xa0, 31, [0xd9, 0xda, 0xdb], out);
    return out.push(s);
  }
  if (v instanceof Uint8Array) {
    header(v.length, null, 0, [0xc4, 0xc5, 0xc6], out);
    return out.push(Buffer.from(v));
  }
  if (v instanceof Date) return writeDate(v, out);
  if (v instanceof Ext) return writeExt(v.type, v.data, out);
  if (Array.isArray(v)) {
    header(v.length, 0x90, 15, [null, 0xdc, 0xdd], out);
    for (const item of v) write(item, out, depth + 1);
    return;
  }
  if (typeof v === "object") {
    const entries = v instanceof Map ? [...v] : Object.entries(v);
    header(entries.length, 0x80, 15, [null, 0xde, 0xdf], out);
    for (const [k, val] of entries) {
      write(k, out, depth + 1);
      write(val, out, depth + 1);
    }
    return;
  }
  throw new TypeError(`cannot encode a ${typeof v}`);
}

// ---- decode ---------------------------------------------------------------

function decode(input, options = {}) {
  const buf = Buffer.from(input);
  let pos = 0;

  const need = (n) => {
    if (pos + n > buf.length) throw new MsgpackError(`truncated: need ${n} more byte(s) at offset ${pos}`);
  };
  const take = (n) => {
    need(n);
    const s = buf.subarray(pos, pos + n);
    pos += n;
    return s;
  };
  const num = (n) => (n <= Number.MAX_SAFE_INTEGER && n >= Number.MIN_SAFE_INTEGER ? Number(n) : n);
  const str = (n) => {
    const raw = take(n);
    try {
      return utf8.decode(raw);
    } catch {
      throw new MsgpackError(`invalid UTF-8 in string ending at offset ${pos}`);
    }
  };
  const array = (n, depth) => {
    const out = [];
    for (let i = 0; i < n; i++) out.push(item(depth + 1));
    return out;
  };
  const map = (n, depth) => {
    const out = options.map ? new Map() : {};
    for (let i = 0; i < n; i++) {
      const k = item(depth + 1);
      const v = item(depth + 1);
      if (options.map) out.set(k, v);
      else {
        if (typeof k !== "string") throw new MsgpackError("map key is not a string (decode with {map: true})");
        // defineProperty so a key like "__proto__" stays plain data
        Object.defineProperty(out, k, { value: v, enumerable: true, writable: true, configurable: true });
      }
    }
    return out;
  };
  const ext = (n) => {
    const type = take(1).readInt8();
    const data = Buffer.from(take(n));
    return type === -1 ? timestamp(data) : new Ext(type, data);
  };

  function item(depth) {
    if (depth > MAX_DEPTH) throw new MsgpackError("nested too deeply");
    const t = take(1)[0];
    if (t < 0x80) return t;
    if (t >= 0xe0) return t - 256;
    if (t <= 0x8f) return map(t & 0x0f, depth);
    if (t <= 0x9f) return array(t & 0x0f, depth);
    if (t <= 0xbf) return str(t & 0x1f);
    switch (t) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xc4: return Buffer.from(take(take(1).readUInt8()));
      case 0xc5: return Buffer.from(take(take(2).readUInt16BE()));
      case 0xc6: return Buffer.from(take(take(4).readUInt32BE()));
      case 0xc7: return ext(take(1).readUInt8());
      case 0xc8: return ext(take(2).readUInt16BE());
      case 0xc9: return ext(take(4).readUInt32BE());
      case 0xca: return take(4).readFloatBE();
      case 0xcb: return take(8).readDoubleBE();
      case 0xcc: return take(1).readUInt8();
      case 0xcd: return take(2).readUInt16BE();
      case 0xce: return take(4).readUInt32BE();
      case 0xcf: return num(take(8).readBigUInt64BE());
      case 0xd0: return take(1).readInt8();
      case 0xd1: return take(2).readInt16BE();
      case 0xd2: return take(4).readInt32BE();
      case 0xd3: return num(take(8).readBigInt64BE());
      case 0xd4: return ext(1);
      case 0xd5: return ext(2);
      case 0xd6: return ext(4);
      case 0xd7: return ext(8);
      case 0xd8: return ext(16);
      case 0xd9: return str(take(1).readUInt8());
      case 0xda: return str(take(2).readUInt16BE());
      case 0xdb: return str(take(4).readUInt32BE());
      case 0xdc: return array(take(2).readUInt16BE(), depth);
      case 0xdd: return array(take(4).readUInt32BE(), depth);
      case 0xde: return map(take(2).readUInt16BE(), depth);
      case 0xdf: return map(take(4).readUInt32BE(), depth);
      default:
        throw new MsgpackError(`invalid type byte 0x${t.toString(16)} at offset ${pos - 1}`);
    }
  }

  const value = item(0);
  if (pos !== buf.length) throw new MsgpackError(`${buf.length - pos} trailing byte(s) after the value`);
  return value;
}

function timestamp(data) {
  let sec;
  let nsec;
  if (data.length === 4) {
    sec = data.readUInt32BE();
    nsec = 0;
  } else if (data.length === 8) {
    const v = data.readBigUInt64BE();
    nsec = Number(v >> 34n);
    sec = Number(v & 0x3ffffffffn);
    if (nsec > 999999999) throw new MsgpackError("timestamp nanoseconds out of range");
  } else if (data.length === 12) {
    nsec = data.readUInt32BE();
    sec = Number(data.readBigInt64BE(4));
    if (nsec > 999999999) throw new MsgpackError("timestamp nanoseconds out of range");
  } else {
    throw new MsgpackError(`timestamp must be 4, 8 or 12 bytes, not ${data.length}`);
  }
  const d = new Date(sec * 1000 + Math.floor(nsec / 1e6));
  if (Number.isNaN(d.getTime())) throw new MsgpackError("timestamp is outside the range of a Date");
  return d;
}

// ---- CLI ------------------------------------------------------------------

function toJSONable(v) {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Ext) return { $ext: v.type, data: v.data.toString("base64") };
  if (Buffer.isBuffer(v)) return { $bin: v.toString("base64") };
  if (Array.isArray(v)) return v.map(toJSONable);
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toJSONable(x)]));
  return v;
}

function main(argv) {
  let decoding = false;
  let hex = false;
  let file = null;
  for (const a of argv) {
    if (a === "-h" || a === "--help") {
      console.log(USAGE);
      return 0;
    } else if (a === "-d") decoding = true;
    else if (a === "--hex") hex = true;
    else if (a === "-" || !a.startsWith("-")) {
      if (file !== null) {
        console.error(`msgpack: only one input file\n${USAGE}`);
        return 2;
      }
      file = a;
    } else {
      console.error(`msgpack: unknown option ${a}\n${USAGE}`);
      return 2;
    }
  }
  let raw;
  try {
    raw = fs.readFileSync(file === null || file === "-" ? 0 : file);
  } catch (err) {
    console.error(`msgpack: ${err.message}`);
    return 1;
  }
  try {
    if (decoding) {
      let bytes = raw;
      if (hex) {
        const text = raw.toString("utf8").replace(/\s+/g, "");
        if (!/^([0-9a-fA-F]{2})*$/.test(text)) throw new MsgpackError("input is not valid hex");
        bytes = Buffer.from(text, "hex");
      }
      console.log(JSON.stringify(toJSONable(decode(bytes))));
    } else {
      const out = encode(JSON.parse(raw.toString("utf8")));
      if (hex) console.log(out.toString("hex"));
      else process.stdout.write(out);
    }
  } catch (err) {
    if (!(err instanceof MsgpackError || err instanceof SyntaxError)) throw err;
    console.error(`msgpack: ${err.message}`);
    return 1;
  }
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { encode, decode, Ext, MsgpackError };
