const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { CRC, CRCError, crc, selfTest, CATALOGUE, main } = require("../scripts/crc.js");

const CLI = path.join(__dirname, "..", "scripts", "crc.js");

function run(args, input) {
  const r = spawnSync(process.execPath, [CLI, ...args], { input });
  return { code: r.status, out: r.stdout.toString().replace(/\r\n/g, "\n"), err: r.stderr.toString() };
}

// Published check values: the CRC of the ASCII string "123456789".
const CHECKS = {
  "crc-8": "f4",
  "crc-16/arc": "bb3d",
  "crc-16/ccitt-false": "29b1",
  "crc-16/xmodem": "31c3",
  "crc-16/kermit": "2189",
  "crc-16/modbus": "4b37",
  "crc-32": "cbf43926",
  "crc-32c": "e3069283",
  "crc-32/bzip2": "fc891918",
  "crc-32/mpeg-2": "0376e6e7",
  "crc-32/jamcrc": "340bc6d9",
  "crc-64/ecma-182": "6c40df5f0b497347",
  "crc-64/xz": "995dc9bbdf1939fa",
};

// A bit-at-a-time CRC straight from the Rocksoft definition, to check the
// table-driven code against for models nobody has published.
function reflect(v, w) {
  let r = 0n;
  for (let i = 0n; i < BigInt(w); i++) if ((v >> i) & 1n) r |= 1n << (BigInt(w) - 1n - i);
  return r;
}
function slow(m, data) {
  const w = BigInt(m.width);
  const mask = (1n << w) - 1n;
  let reg = BigInt(m.init);
  for (const byte of data) {
    const b = m.refin ? Number(reflect(BigInt(byte), 8)) : byte;
    for (let i = 7; i >= 0; i--) {
      const top = (reg >> (w - 1n)) & 1n;
      const bit = BigInt((b >> i) & 1);
      reg = (reg << 1n) & mask;
      if (top ^ bit) reg ^= BigInt(m.poly);
    }
  }
  if (m.refout) reg = reflect(reg, m.width);
  return (reg ^ BigInt(m.xorout)) & mask;
}

test("every catalogued algorithm gives its published check value", () => {
  assert.deepStrictEqual(Object.keys(CHECKS).sort(), Object.keys(CATALOGUE).sort());
  for (const [name, want] of Object.entries(CHECKS)) {
    assert.strictEqual(new CRC(name).update("123456789").hex(), want, name);
  }
  assert.deepStrictEqual(selfTest(), []);
});

test("crc-32 and crc-32c agree with zlib and with known strings", () => {
  const rng = crypto.randomBytes(100_000);
  assert.strictEqual(crc("crc-32", rng), BigInt(zlib.crc32(rng)));
  assert.strictEqual(crc("crc-32", ""), 0n);
  assert.strictEqual(new CRC("crc-32").update("The quick brown fox jumps over the lazy dog").hex(), "414fa339");
  assert.strictEqual(new CRC("crc-32c").update(Buffer.alloc(32)).hex(), "8a9136aa"); // iSCSI test vector: 32 zero bytes
  assert.strictEqual(new CRC("crc-32c").update(Buffer.alloc(32, 0xff)).hex(), "62a8ab43"); // and 32 bytes of 0xff
});

test("algorithm names are case-insensitive; unknown names are an error", () => {
  assert.strictEqual(new CRC("CRC-32").update("a").hex(), new CRC("crc-32").update("a").hex());
  assert.throws(() => new CRC("crc-99"), CRCError);
});

test("streaming in any split gives the one-shot answer", () => {
  const data = crypto.randomBytes(5000);
  for (const name of Object.keys(CATALOGUE)) {
    const whole = crc(name, data);
    const c = new CRC(name);
    for (let i = 0; i < data.length; ) {
      const n = 1 + Math.floor(Math.random() * 700);
      c.update(data.subarray(i, i + n));
      i += n;
    }
    assert.strictEqual(c.value, whole, name);
  }
});

test("value can be read mid-stream, and reset starts again", () => {
  const c = new CRC("crc-32");
  c.update("1234");
  const first = c.value;
  assert.strictEqual(c.value, first);
  c.update("56789");
  assert.strictEqual(c.hex(), "cbf43926");
  c.reset().update("123456789");
  assert.strictEqual(c.hex(), "cbf43926");
  assert.strictEqual(new CRC("crc-32").value, 0n); // empty input
});

test("strings are UTF-8; other types are refused", () => {
  assert.strictEqual(crc("crc-32", "é"), crc("crc-32", Buffer.from([0xc3, 0xa9])));
  assert.throws(() => new CRC("crc-32").update(5), TypeError);
  assert.throws(() => new CRC("crc-32").update([1, 2]), TypeError);
});

test("hex is zero-padded to the width", () => {
  // find an input whose CRC starts with a zero nibble
  for (let i = 0; ; i++) {
    const c = new CRC("crc-32").update(String(i));
    if (c.value < 0x10000000n) {
      assert.strictEqual(c.hex().length, 8);
      assert.ok(c.hex().startsWith("0"));
      return;
    }
  }
});

test("custom parameters: the same as a catalogue entry, validated", () => {
  const spec = { width: 16, poly: 0x8005, init: 0, refin: true, refout: true, xorout: 0 };
  assert.strictEqual(new CRC(spec).update("123456789").hex(), "bb3d");
  assert.throws(() => new CRC({ ...spec, width: 7 }), CRCError);
  assert.throws(() => new CRC({ ...spec, width: 65 }), CRCError);
  assert.throws(() => new CRC({ ...spec, width: 12.5 }), CRCError);
  assert.throws(() => new CRC({ ...spec, poly: 0x10000 }), CRCError);
  assert.throws(() => new CRC({ ...spec, init: -1 }), CRCError);
});

test("random models agree with the bit-at-a-time definition", () => {
  const rnd = (bits) => {
    let v = 0n;
    for (let i = 0; i < bits; i += 8) v = (v << 8n) | BigInt(crypto.randomInt(256));
    return v & ((1n << BigInt(bits)) - 1n);
  };
  const widths = [8, 9, 10, 12, 15, 16, 17, 24, 31, 32, 33, 40, 63, 64];
  let n = 0;
  for (let round = 0; round < 6; round++) {
    for (const width of widths) {
      const m = { width, poly: rnd(width) | 1n, init: rnd(width), xorout: rnd(width), refin: Math.random() < 0.5, refout: Math.random() < 0.5 };
      const data = crypto.randomBytes(crypto.randomInt(0, 60));
      assert.strictEqual(new CRC(m).update(data).value, slow(m, data), JSON.stringify({ ...m, poly: m.poly.toString(16) }, (k, v) => (typeof v === "bigint" ? v.toString(16) : v)));
      n++;
    }
  }
  assert.strictEqual(n, 84);
});

test("the slow reference reproduces the catalogue too (so the reference is trustworthy)", () => {
  for (const name of Object.keys(CATALOGUE)) {
    const [width, poly, init, refin, refout, xorout] = CATALOGUE[name];
    const m = { width, poly: BigInt("0x" + poly), init: BigInt("0x" + init), refin, refout, xorout: BigInt("0x" + xorout) };
    assert.strictEqual(slow(m, Buffer.from("123456789")).toString(16).padStart(width / 4, "0"), CHECKS[name], name);
  }
});

test("a single flipped bit always changes the CRC (checked over every bit of 64 bytes)", () => {
  const data = crypto.randomBytes(64);
  for (const name of ["crc-16/arc", "crc-32", "crc-64/xz"]) {
    const base = crc(name, data);
    for (let i = 0; i < 64 * 8; i++) {
      const copy = Buffer.from(data);
      copy[i >> 3] ^= 1 << (i & 7);
      assert.notStrictEqual(crc(name, copy), base, `${name} bit ${i}`);
    }
  }
});

test("main() with injected streams", () => {
  const out = [];
  const code = main([], { out: { write: (s) => out.push(s) }, err: { write() {} }, input: Buffer.from("123456789") });
  assert.strictEqual(code, 0);
  assert.strictEqual(out.join(""), "cbf43926  -\n");
});

test("CLI: stdin, algorithm choice, files, big files", () => {
  assert.deepStrictEqual(run([], "123456789"), { code: 0, out: "cbf43926  -\n", err: "" });
  assert.strictEqual(run(["-a", "crc-32c"], "123456789").out, "e3069283  -\n");
  assert.strictEqual(run(["-a", "CRC-16/MODBUS"], "123456789").out, "4b37  -\n");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crc-"));
  try {
    const small = path.join(dir, "a.txt");
    const big = path.join(dir, "big.bin");
    fs.writeFileSync(small, "123456789");
    const bytes = crypto.randomBytes(300_000); // several 64 KiB chunks
    fs.writeFileSync(big, bytes);
    const r = run([small, big]);
    assert.strictEqual(r.code, 0);
    assert.strictEqual(r.out, `cbf43926  ${small}\n${zlib.crc32(bytes).toString(16).padStart(8, "0")}  ${big}\n`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: --list and --check", () => {
  const list = run(["--list"]).out.trim().split("\n");
  assert.deepStrictEqual(list, Object.keys(CATALOGUE));
  assert.match(run(["--check"]).out, /all 13 algorithms match/);
});

test("CLI: exit codes", () => {
  const missing = run(["no-such-file.bin", "-"], "123456789");
  assert.strictEqual(missing.code, 1);
  assert.match(missing.err, /no-such-file.bin: no such file/);
  assert.strictEqual(missing.out, "cbf43926  -\n"); // the rest are still done
  assert.strictEqual(run(["-a", "nope"], "").code, 2);
  assert.strictEqual(run(["-a"], "").code, 2);
  assert.strictEqual(run(["--wat"], "").code, 2);
});
