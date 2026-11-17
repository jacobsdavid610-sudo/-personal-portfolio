const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const path = require("node:path");
const { encode, decode, Base32Error, main } = require("../scripts/base32.js");

const CLI = path.join(__dirname, "..", "scripts", "base32.js");

function run(args, input) {
  const r = spawnSync(process.execPath, [CLI, ...args], { input });
  return { code: r.status, out: r.stdout.toString("latin1").replace(/\r\n/g, "\n"), err: r.stderr.toString() };
}

// RFC 4648 section 10 test vectors: input, base32, base32hex.
const VECTORS = [
  ["", "", ""],
  ["f", "MY======", "CO======"],
  ["fo", "MZXQ====", "CPNG===="],
  ["foo", "MZXW6===", "CPNMU==="],
  ["foob", "MZXW6YQ=", "CPNMUOG="],
  ["fooba", "MZXW6YTB", "CPNMUOJ1"],
  ["foobar", "MZXW6YTBOI======", "CPNMUOJ1E8======"],
];

test("RFC 4648 vectors encode, both alphabets", () => {
  for (const [raw, std, hex] of VECTORS) {
    assert.strictEqual(encode(raw), std, raw);
    assert.strictEqual(encode(raw, { variant: "hex" }), hex, raw);
  }
});

test("RFC 4648 vectors decode, both alphabets", () => {
  for (const [raw, std, hex] of VECTORS) {
    assert.strictEqual(decode(std).toString(), raw);
    assert.strictEqual(decode(hex, { variant: "hex" }).toString(), raw);
  }
});

test("pad: false drops the =, and the decoder takes it either way", () => {
  for (const [raw, std] of VECTORS) {
    const bare = encode(raw, { pad: false });
    assert.strictEqual(bare, std.replace(/=+$/, ""));
    assert.strictEqual(decode(bare).toString(), raw);
  }
});

test("accepts lower case, nothing else", () => {
  assert.strictEqual(decode("mzxw6ytb").toString(), "fooba");
  assert.strictEqual(decode("MzXw6YtB").toString(), "fooba");
  for (const bad of ["MZXW1YTB", "MZXW8YTB", "MZXW0YTB", "MZXW 6YTB", "MZXW6YT\n", "MZXW6YTı"]) {
    assert.throws(() => decode(bad), Base32Error, JSON.stringify(bad));
  }
  // 0, 1, 8 and 9 are only valid in the hex alphabet
  assert.strictEqual(decode("CPNMUOJ1", { variant: "hex" }).toString(), "fooba");
  assert.throws(() => decode("CPNMUOJ1"), Base32Error);
  assert.throws(() => decode("MZXW6YTW", { variant: "hex" }), Base32Error);
});

test("lengths that no encoder produces are refused", () => {
  for (const n of [1, 3, 6, 9, 11, 14, 17]) {
    assert.throws(() => decode("A".repeat(n)), /not a valid Base32 length/, String(n));
  }
});

test("padding must be exactly right, and only at the end", () => {
  assert.throws(() => decode("MY====="), /expected 6 padding/);
  assert.throws(() => decode("MY======="), /expected 6 padding/);
  assert.throws(() => decode("MZXW6YTB="), /expected 0 padding/);
  assert.throws(() => decode("M=Y====="), Base32Error);
  assert.throws(() => decode("MY==X==="), Base32Error);
  assert.throws(() => decode("MY======MY======"), Base32Error);
  assert.throws(() => decode("======"), Base32Error);
});

test("non-zero trailing bits are refused, so each input has one spelling", () => {
  // After "M" one byte is kept, so the last 2 bits of the second character
  // must be zero: only A, I, Q and Y (values divisible by 4) are accepted.
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const seen = new Set();
  for (let i = 0; i < 32; i++) {
    if (i % 4 === 0) seen.add(decode("M" + A[i]).toString("hex"));
    else assert.throws(() => decode("M" + A[i]), /trailing bits/, A[i]);
  }
  assert.strictEqual(seen.size, 8);
  assert.strictEqual(decode("MY").toString(), "f");
  assert.throws(() => decode("MZXR===="), /trailing bits/);
  assert.throws(() => decode("MZXW6YR="), /trailing bits/);
  assert.throws(() => decode("MZXW6YTBOJ======"), /trailing bits/);
});

test("every length from 0 to 40 round trips", () => {
  for (let n = 0; n <= 40; n++) {
    const buf = crypto.randomBytes(n);
    for (const variant of ["std", "hex"]) {
      for (const pad of [true, false]) {
        const text = encode(buf, { variant, pad });
        assert.ok(decode(text, { variant }).equals(buf), `${n} ${variant} ${pad}`);
        assert.strictEqual(text.length, pad ? Math.ceil(n / 5) * 8 : Math.ceil((n * 8) / 5));
      }
    }
  }
});

test("all 256 byte values and 0xFF runs survive", () => {
  const all = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  assert.ok(decode(encode(all)).equals(all));
  const ff = Buffer.alloc(5, 0xff);
  assert.strictEqual(encode(ff), "77777777");
  assert.ok(decode("77777777").equals(ff));
  assert.strictEqual(encode(Buffer.alloc(5)), "AAAAAAAA");
});

test("strings are encoded as UTF-8; bad argument types throw TypeError", () => {
  assert.strictEqual(encode("é"), "YOUQ====");
  assert.ok(decode("YOUQ====").equals(Buffer.from("é")));
  assert.throws(() => encode(5), TypeError);
  assert.throws(() => decode(Buffer.from("MY")), TypeError);
  assert.throws(() => encode("a", { variant: "crockford" }), TypeError);
});

test("agrees with the OS base32 where it exists", (t) => {
  const r = spawnSync("base32", ["--version"]);
  if (r.error || r.status !== 0) return t.skip("no base32 command on this machine");
  const buf = crypto.randomBytes(101);
  const ref = spawnSync("base32", ["-w", "0"], { input: buf }).stdout.toString().trim();
  assert.strictEqual(encode(buf), ref);
});

test("main() writes to the given streams", () => {
  const out = [];
  const err = [];
  const code = main([], { out: { write: (s) => out.push(s) }, err: { write: (s) => err.push(s) }, input: Buffer.from("foobar") });
  assert.strictEqual(code, 0);
  assert.strictEqual(out.join(""), "MZXW6YTBOI======\n");
  assert.deepStrictEqual(err, []);
});

test("CLI: encode, decode, hex, no-pad, wrap", () => {
  assert.deepStrictEqual(run([], "foobar"), { code: 0, out: "MZXW6YTBOI======\n", err: "" });
  assert.strictEqual(run(["--hex", "--no-pad"], "foobar").out, "CPNMUOJ1E8\n");
  assert.strictEqual(run(["-d"], "MZXW6YTBOI======\n").out, "foobar");
  assert.strictEqual(run(["-d", "--hex"], "CPNMUOJ1E8\n").out, "foobar");
  assert.strictEqual(run(["-w", "4"], "foobar").out, "MZXW\n6YTB\nOI==\n====\n");
  // wrapped output decodes again
  assert.strictEqual(run(["-d"], "MZXW\n6YTB\nOI==\n====\n").out, "foobar");
  assert.strictEqual(run([], "").out, "\n");
});

test("CLI: binary data goes through untouched", () => {
  const buf = crypto.randomBytes(300);
  const enc = spawnSync(process.execPath, [CLI], { input: buf }).stdout;
  const dec = spawnSync(process.execPath, [CLI, "-d"], { input: enc }).stdout;
  assert.ok(Buffer.from(dec).equals(buf));
});

test("CLI: exit codes", () => {
  const bad = run(["-d"], "MZXW1YTB");
  assert.strictEqual(bad.code, 1);
  assert.match(bad.err, /invalid character "1" at position 4/);
  assert.strictEqual(bad.out, "");
  assert.strictEqual(run(["--nope"], "").code, 2);
  assert.strictEqual(run(["-w"], "").code, 2);
  assert.strictEqual(run(["-w", "x"], "").code, 2);
  assert.strictEqual(run(["a", "b"], "").code, 2);
  const missing = run(["no-such-file.bin"], "");
  assert.strictEqual(missing.code, 1);
  assert.match(missing.err, /base32:/);
});
