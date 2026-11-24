const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { encode, decode, Ext, MsgpackError } = require("../scripts/msgpack.js");

const CLI = path.join(__dirname, "..", "scripts", "msgpack.js");

function run(args, input) {
  const r = spawnSync(process.execPath, [CLI, ...args], { input });
  return { code: r.status, out: r.stdout, err: r.stderr.toString() };
}

const hex = (v) => encode(v).toString("hex");
const unhex = (h) => Buffer.from(h, "hex");

// value, expected encoding (hex). Chosen to sit on each size boundary.
const VECTORS = [
  [null, "c0"],
  [false, "c2"],
  [true, "c3"],
  [0, "00"],
  [127, "7f"],
  [128, "cc80"],
  [255, "ccff"],
  [256, "cd0100"],
  [65535, "cdffff"],
  [65536, "ce00010000"],
  [4294967295, "ceffffffff"],
  [4294967296, "cf0000000100000000"],
  [-1, "ff"],
  [-32, "e0"],
  [-33, "d0df"],
  [-128, "d080"],
  [-129, "d1ff7f"],
  [-32768, "d18000"],
  [-32769, "d2ffff7fff"],
  [-2147483648, "d280000000"],
  [-2147483649, "d3ffffffff7fffffff"],
  [1.5, "cb3ff8000000000000"],
  [0.1, "cb3fb999999999999a"],
  [-0, "cb8000000000000000"],
  ["", "a0"],
  ["a", "a161"],
  ["compact", "a7636f6d70616374"],
  ["é", "a2c3a9"],
  ["x".repeat(31), "bf" + "78".repeat(31)],
  ["x".repeat(32), "d920" + "78".repeat(32)],
  ["x".repeat(256), "da0100" + "78".repeat(256)],
  ["x".repeat(65536), "db00010000" + "78".repeat(65536)],
  [[], "90"],
  [[1, 2, 3], "93010203"],
  [{}, "80"],
  [{ a: 1 }, "81a16101"],
  [{ compact: true, schema: 0 }, "82a7636f6d70616374c3a6736368656d6100"],
  [Buffer.from([1, 2, 3]), "c403010203"],
  [Buffer.alloc(0), "c400"],
  [2n ** 63n, "cf8000000000000000"],
  [2n ** 64n - 1n, "cf" + "ff".repeat(8)],
  [-(2n ** 63n), "d38000000000000000"],
];

for (const [value, h] of VECTORS) {
  const label = typeof value === "string" && value.length > 20 ? `string of ${value.length}` : String(value instanceof Buffer ? `bin ${value.length}` : JSON.stringify(value, (k, v) => (typeof v === "bigint" ? `${v}n` : v)));
  test(`encodes ${label}`, () => {
    assert.strictEqual(hex(value), h);
  });
}

test("every vector decodes back to its value", () => {
  for (const [value, h] of VECTORS) {
    const back = decode(unhex(h));
    if (Buffer.isBuffer(value)) assert.deepStrictEqual(back, value);
    else if (Object.is(value, -0)) assert.ok(Object.is(back, -0));
    else assert.deepStrictEqual(back, value, h.slice(0, 20));
  }
});

test("the shortest encoding is used for lists and maps around the 15/16 boundary", () => {
  assert.strictEqual(hex(new Array(15).fill(0)).slice(0, 2), "9f");
  assert.strictEqual(hex(new Array(16).fill(0)).slice(0, 6), "dc0010");
  const m15 = Object.fromEntries(Array.from({ length: 15 }, (_, i) => ["k" + i, i]));
  const m16 = Object.fromEntries(Array.from({ length: 16 }, (_, i) => ["k" + i, i]));
  assert.strictEqual(hex(m15).slice(0, 2), "8f");
  assert.strictEqual(hex(m16).slice(0, 6), "de0010");
  assert.deepStrictEqual(decode(encode(m16)), m16);
  assert.strictEqual(hex(new Array(65536).fill(0)).slice(0, 10), "dd00010000");
});

test("floats: float32 decodes, NaN and Infinity survive", () => {
  assert.strictEqual(decode(unhex("ca3fc00000")), 1.5);
  assert.ok(Number.isNaN(decode(encode(NaN))));
  assert.strictEqual(decode(encode(-Infinity)), -Infinity);
  assert.strictEqual(decode(encode(2 ** 53)), 2 ** 53); // not a safe integer, so a double
  assert.strictEqual(hex(2 ** 53).slice(0, 2), "cb");
});

test("64-bit integers: safe ones come back as numbers, the rest as BigInt", () => {
  assert.strictEqual(decode(unhex("cf000000000000ffff")), 65535);
  assert.strictEqual(decode(unhex("cf001fffffffffffff")), Number.MAX_SAFE_INTEGER);
  assert.strictEqual(decode(unhex("cf0020000000000000")), 2n ** 53n);
  assert.strictEqual(decode(unhex("d3ffe0000000000000")), -(2n ** 53n));
  assert.strictEqual(decode(unhex("d3ffe0000000000001")), -Number.MAX_SAFE_INTEGER);
  assert.throws(() => encode(2n ** 64n), MsgpackError);
  assert.throws(() => encode(-(2n ** 63n) - 1n), MsgpackError);
});

test("nil: undefined encodes as nil", () => {
  assert.strictEqual(hex(undefined), "c0");
  assert.deepStrictEqual(decode(encode([undefined])), [null]);
});

test("maps: string keys by default, any keys with {map: true}", () => {
  const m = new Map([[1, "a"], ["b", [2]]]);
  const back = decode(encode(m), { map: true });
  assert.ok(back instanceof Map);
  assert.deepStrictEqual([...back], [...m]);
  assert.throws(() => decode(encode(m)), /map key is not a string/);
});

test("a __proto__ key is plain data, not the prototype", () => {
  const evil = unhex("81a95f5f70726f746f5f5f01");
  const obj = decode(evil);
  assert.strictEqual(Object.getPrototypeOf(obj), Object.prototype);
  assert.deepStrictEqual(Object.keys(obj), ["__proto__"]);
  assert.strictEqual({}.polluted, undefined);
});

test("timestamps: 32, 64 and 96 bit forms", () => {
  assert.strictEqual(hex(new Date(0)), "d6ff00000000");
  assert.strictEqual(hex(new Date(1500)), "d7ff7735940000000001"); // 500e6 ns << 34 | 1 s
  assert.strictEqual(hex(new Date(-1500)).slice(0, 6), "c70cff"); // before 1970: 12-byte form
  for (const ms of [0, 1, 999, 1500, 1700000000123, -1500, -86400000, 253402300799999, 17179869184000]) {
    const d = new Date(ms);
    assert.strictEqual(decode(encode(d)).getTime(), ms, String(ms));
  }
});

test("timestamps: bad ones are rejected", () => {
  assert.throws(() => encode(new Date(NaN)), MsgpackError);
  assert.throws(() => decode(unhex("d5ff0000")), /4, 8 or 12 bytes/);
  assert.throws(() => decode(unhex("d7ff" + "ffffffff" + "00000001")), /nanoseconds out of range/);
});

test("extensions round-trip as Ext", () => {
  const sizes = [1, 2, 4, 8, 16, 3, 17, 300];
  const tags = { 1: "d4", 2: "d5", 4: "d6", 8: "d7", 16: "d8", 3: "c703", 17: "c711", 300: "c8012c" };
  for (const n of sizes) {
    const e = new Ext(5, Buffer.alloc(n, 7));
    assert.ok(hex(e).startsWith(tags[n] + "05"), `size ${n}`);
    const back = decode(encode(e));
    assert.ok(back instanceof Ext);
    assert.strictEqual(back.type, 5);
    assert.deepStrictEqual(back.data, e.data);
  }
  assert.strictEqual(decode(unhex("d4807f")).type, -128);
  assert.throws(() => new Ext(200, []), RangeError);
});

test("strings: UTF-8 round trip, including astral characters", () => {
  for (const s of ["héllo", "日本語", "😀", "a\u0000b"]) assert.strictEqual(decode(encode(s)), s);
});

test("strict decoding: truncated input", () => {
  for (const h of ["", "cd01", "a3616", "92c0", "81a161", "c40301", "d6ff0000"]) {
    assert.throws(() => decode(unhex(h.length % 2 ? h.slice(0, -1) : h)), /truncated/, h);
  }
});

test("strict decoding: trailing bytes, reserved byte and bad UTF-8", () => {
  assert.throws(() => decode(unhex("c0c0")), /1 trailing byte/);
  assert.throws(() => decode(unhex("c1")), /invalid type byte 0xc1 at offset 0/);
  assert.throws(() => decode(unhex("a1ff")), /invalid UTF-8/);
  assert.throws(() => decode(unhex("a2c328")), /invalid UTF-8/);
});

test("a huge declared length does not allocate; it fails as truncated", () => {
  assert.throws(() => decode(unhex("dbffffffff00")), /truncated/);
  assert.throws(() => decode(unhex("ddffffffff")), /truncated/);
});

test("depth limit: deeply nested input is refused", () => {
  const deep = Buffer.alloc(100000, 0x91);
  assert.throws(() => decode(Buffer.concat([deep, unhex("c0")])), /nested too deeply/);
  let v = [];
  for (let i = 0; i < 1000; i++) v = [v];
  assert.throws(() => encode(v), /nested too deeply/);
});

test("encode rejects values it cannot represent", () => {
  assert.throws(() => encode(() => 1), TypeError);
  assert.throws(() => encode(Symbol("x")), TypeError);
});

test("random values round-trip", () => {
  let seed = 424242;
  const rnd = (n) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const gen = (d) => {
    switch (rnd(d > 3 ? 7 : 9)) {
      case 0: return null;
      case 1: return rnd(2) === 0;
      case 2: return rnd(2 ** 31) * (rnd(2) ? 1 : -1);
      case 3: return rnd(1e9) * 4096 * (rnd(2) ? 1 : -1);
      case 4: return rnd(1000) / 8;
      case 5: return "s".repeat(rnd(70)) + "é";
      case 6: return Buffer.alloc(rnd(300), rnd(256));
      case 7: return Array.from({ length: rnd(20) }, () => gen(d + 1));
      default: return Object.fromEntries(Array.from({ length: rnd(20) }, (_, i) => ["k" + i, gen(d + 1)]));
    }
  };
  for (let i = 0; i < 400; i++) {
    const v = gen(0);
    assert.deepStrictEqual(decode(encode(v)), v);
  }
});

test("CLI: JSON to hex and back", () => {
  const enc = run(["--hex"], '{"compact":true,"schema":0}');
  assert.deepStrictEqual([enc.code, enc.out.toString()], [0, "82a7636f6d70616374c3a6736368656d6100\n"]);
  const dec = run(["-d", "--hex"], "82a7636f6d70616374c3a6736368656d6100\n");
  assert.deepStrictEqual([dec.code, dec.out.toString()], [0, '{"compact":true,"schema":0}\n']);
});

test("CLI: raw bytes in and out", () => {
  const enc = run([], "[1,2,3]");
  assert.deepStrictEqual(enc.out, unhex("93010203"));
  assert.strictEqual(run(["-d"], unhex("93010203")).out.toString(), "[1,2,3]\n");
});

test("CLI: binary, extensions and big integers print as JSON", () => {
  const out = run(["-d", "--hex"], "93" + "c401ff" + "d50500" + "00" + "cf" + "ff".repeat(8)).out.toString();
  assert.deepStrictEqual(JSON.parse(out), [{ $bin: "/w==" }, { $ext: 5, data: "AAA=" }, "18446744073709551615"]);
});

test("CLI: errors exit 1, usage errors exit 2", () => {
  assert.strictEqual(run(["-d", "--hex"], "c1").code, 1);
  assert.strictEqual(run(["-d", "--hex"], "zz").code, 1);
  assert.strictEqual(run([], "{not json").code, 1);
  assert.strictEqual(run(["--nope"], "").code, 2);
  assert.strictEqual(run(["a", "b"], "").code, 2);
  assert.strictEqual(run(["no-such-file.json"], "").code, 1);
});
