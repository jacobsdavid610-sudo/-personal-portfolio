const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pack, unpack, extract, safeName, TarError } = require("../scripts/tarlite.js");

const CLI = path.join(__dirname, "..", "scripts", "tarlite.js");
const HAVE_TAR = spawnSync("tar", ["--version"]).status === 0;

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tarlite-"));
}

function run(args, cwd) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd });
  return { code: r.status, out: r.stdout.toString().replace(/\r\n/g, "\n"), err: r.stderr.toString() };
}

// A header block built by hand, so the reader can be tested on things tarlite never writes.
function rawEntry({ name = "", flag = "0", data = Buffer.alloc(0), prefix = "", magic = "ustar\0" + "00", sizeField }) {
  const h = Buffer.alloc(512);
  h.write(name, 0, "utf8");
  h.write("0000644\0", 100, "latin1");
  h.write("0000000\0", 108, "latin1");
  h.write("0000000\0", 116, "latin1");
  h.write(sizeField ?? data.length.toString(8).padStart(11, "0") + "\0", 124, "latin1");
  h.write("00000000000\0", 136, "latin1");
  h.write(flag, 156, "latin1");
  h.write(magic, 257, "latin1");
  h.write(prefix, 345, "utf8");
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "latin1");
  const pad = Buffer.alloc((512 - (data.length % 512)) % 512);
  return Buffer.concat([h, data, pad]);
}
const END = Buffer.alloc(1024);

test("round trip: files, directories, empty files, binary data", () => {
  const bin = Buffer.from(Array.from({ length: 700 }, (_, i) => i % 256));
  const entries = [
    { name: "d", type: "dir" },
    { name: "d/a.txt", type: "file", data: "hello\n", mode: 0o600, mtime: 1700000000 },
    { name: "d/empty", type: "file" },
    { name: "d/bin.dat", type: "file", data: bin },
  ];
  const back = unpack(pack(entries));
  assert.deepStrictEqual(back.map((e) => [e.name, e.type, e.size]), [
    ["d/", "dir", 0], ["d/a.txt", "file", 6], ["d/empty", "file", 0], ["d/bin.dat", "file", 700],
  ]);
  assert.strictEqual(back[1].data.toString(), "hello\n");
  assert.strictEqual(back[1].mode, 0o600);
  assert.strictEqual(back[1].mtime, 1700000000);
  assert.ok(back[3].data.equals(bin));
});

test("sizes around the 512-byte block boundary", () => {
  for (const n of [0, 1, 511, 512, 513, 1024, 1025]) {
    const data = Buffer.alloc(n, 0x61);
    const tar = pack([{ name: "f", type: "file", data }]);
    assert.strictEqual(tar.length, 512 + Math.ceil(n / 512) * 512 + 1024, `size ${n}`);
    assert.ok(unpack(tar)[0].data.equals(data), `size ${n}`);
  }
});

test("output ends with two zero blocks and every header checksums", () => {
  const tar = pack([{ name: "a", type: "file", data: "x" }]);
  assert.ok(tar.subarray(tar.length - 1024).every((b) => b === 0));
  assert.strictEqual(tar.subarray(257, 263).toString("latin1"), "ustar\0");
  assert.strictEqual(tar.subarray(148 + 6, 148 + 8).toString("latin1"), "\0 ");
});

test("long names are split into prefix and name", () => {
  const dir = "d".repeat(60) + "/" + "e".repeat(60);
  const name = `${dir}/${"f".repeat(80)}.txt`; // 202 bytes
  const tar = pack([{ name, type: "file", data: "x" }]);
  assert.ok(tar.subarray(345, 345 + 155).toString().replace(/\0+$/, "").length > 0);
  assert.strictEqual(unpack(tar)[0].name, name);
  const exactly100 = "n".repeat(100);
  assert.strictEqual(tar.length > 0 && unpack(pack([{ name: exactly100, type: "file" }]))[0].name, exactly100);
  const hundredAndOne = "n".repeat(101);
  assert.throws(() => pack([{ name: hundredAndOne, type: "file" }]), /name too long/);
});

test("names that cannot be split are errors", () => {
  assert.throws(() => pack([{ name: "a".repeat(300), type: "file" }]), TarError);
  assert.throws(() => pack([{ name: "a/" + "b".repeat(120), type: "file" }]), TarError);
});

test("non-ASCII names round trip, counted in bytes", () => {
  const name = "dossier/résumé-日本語.txt";
  assert.strictEqual(unpack(pack([{ name, type: "file", data: "x" }]))[0].name, name);
  const long = "é".repeat(51); // 102 bytes, 51 characters
  assert.throws(() => pack([{ name: long, type: "file" }]), TarError);
});

test("backslashes become slashes; directory names end in /", () => {
  const e = unpack(pack([{ name: "a\\b", type: "dir" }, { name: "a\\b\\c", type: "file" }]));
  assert.deepStrictEqual(e.map((x) => x.name), ["a/b/", "a/b/c"]);
});

test("pack rejects bad entries", () => {
  assert.throws(() => pack([{ name: "x", type: "symlink" }]), /unsupported entry type/);
  assert.throws(() => pack([{ name: "x", type: "file", mode: 0o7777777777 }]), /does not fit/);
});

test("reading: checksum errors are caught", () => {
  const tar = pack([{ name: "a", type: "file", data: "x" }]);
  const bad = Buffer.from(tar);
  bad[0] ^= 1;
  assert.throws(() => unpack(bad), /bad checksum at offset 0/);
});

test("reading: truncated archives are errors", () => {
  const tar = pack([{ name: "a", type: "file", data: "x".repeat(600) }]);
  assert.throws(() => unpack(tar.subarray(0, 700)), /file data is cut short/);
  assert.throws(() => unpack(tar.subarray(0, 100)), /partial header/);
});

test("reading: a missing end marker and an empty archive are fine", () => {
  const tar = pack([{ name: "a", type: "file", data: "x" }]);
  assert.strictEqual(unpack(tar.subarray(0, 1024)).length, 1);
  assert.deepStrictEqual(unpack(Buffer.alloc(0)), []);
  assert.deepStrictEqual(unpack(END), []);
});

test("reading: bad octal and base-256 sizes are errors", () => {
  assert.throws(() => unpack(rawEntry({ name: "a", sizeField: "0000000089\0\0" })), /bad octal/);
  assert.throws(() => unpack(rawEntry({ name: "a", sizeField: "\x80\0\0\0\0\0\0\0\0\0\0\x01" })), /base-256/);
});

test("reading: GNU long names (type L)", () => {
  const long = "dir/" + "x".repeat(150) + ".txt";
  const tar = Buffer.concat([
    rawEntry({ name: "././@LongLink", flag: "L", data: Buffer.from(long + "\0") }),
    rawEntry({ name: "truncated-name", data: Buffer.from("hi") }),
    END,
  ]);
  const [e] = unpack(tar);
  assert.strictEqual(e.name, long);
  assert.strictEqual(e.data.toString(), "hi");
});

test("reading: pax path and size overrides apply to the next entry only", () => {
  const rec = (k, v) => {
    // the length counts its own digits, so settle it by iterating
    const body = k.length + v.length + 3; // one space, one equals sign, one newline
    let len = body;
    while (String(len).length + body !== len) len = String(len).length + body;
    return `${len} ${k}=${v}\n`;
  };
  const longPath = "pax/" + "p".repeat(200);
  const data = Buffer.from(rec("path", longPath));
  assert.strictEqual(Number(data.toString().split(" ")[0]), data.length);
  const tar = Buffer.concat([
    rawEntry({ name: "PaxHeader", flag: "x", data }),
    rawEntry({ name: "short", data: Buffer.from("one") }),
    rawEntry({ name: "second", data: Buffer.from("two") }),
    END,
  ]);
  const es = unpack(tar);
  assert.deepStrictEqual(es.map((e) => e.name), [longPath, "second"]);
  const g = Buffer.concat([rawEntry({ name: "g", flag: "g", data: Buffer.from(rec("comment", "hi")) }), rawEntry({ name: "n" }), END]);
  assert.deepStrictEqual(unpack(g).map((e) => e.name), ["n"]);
});

test("reading: links and special files are listed with their type", () => {
  const link = rawEntry({ name: "ln", flag: "2" });
  link.write("target", 157, "latin1");
  // rewrite the checksum after editing the link name
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : link[i];
  link.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "latin1");
  const es = unpack(Buffer.concat([link, rawEntry({ name: "fifo", flag: "6" }), END]));
  assert.deepStrictEqual(es.map((e) => [e.name, e.type]), [["ln", "symlink"], ["fifo", "other"]]);
  assert.strictEqual(es[0].linkname, "target");
});

test("reading: prefix is only used for ustar headers", () => {
  const ustar = unpack(Buffer.concat([rawEntry({ name: "f", prefix: "dir" }), END]));
  assert.strictEqual(ustar[0].name, "dir/f");
  const old = unpack(Buffer.concat([rawEntry({ name: "f", prefix: "junk", magic: "" }), END]));
  assert.strictEqual(old[0].name, "f");
});

test("safeName: accepts ordinary paths and tidies them", () => {
  assert.strictEqual(safeName("a/b/c.txt"), "a/b/c.txt");
  assert.strictEqual(safeName("./a//b/"), "a/b");
  assert.strictEqual(safeName("a/./b"), "a/b");
  assert.strictEqual(safeName("a..b/..c"), "a..b/..c");
});

test("safeName: refuses anything that could leave the directory", () => {
  for (const bad of ["../x", "a/../../x", "a/..", "/etc/passwd", "C:/x", "c:\\x", "a\\..\\..\\x", "", ".", "./", "a\0b"]) {
    assert.throws(() => safeName(bad), TarError, JSON.stringify(bad));
  }
});

test("extract: writes files, makes parent directories, and returns a count", () => {
  const dest = tmp();
  const tar = pack([{ name: "a/b/c.txt", type: "file", data: "deep" }, { name: "top", type: "dir" }]);
  assert.strictEqual(extract(tar, dest), 2);
  assert.strictEqual(fs.readFileSync(path.join(dest, "a", "b", "c.txt"), "utf8"), "deep");
  assert.ok(fs.statSync(path.join(dest, "top")).isDirectory());
});

test("extract: a traversal name anywhere in the archive writes nothing at all", () => {
  const dest = tmp();
  const tar = pack([{ name: "fine.txt", type: "file", data: "ok" }, { name: "../evil.txt", type: "file", data: "no" }]);
  assert.throws(() => extract(tar, path.join(dest, "out")), /escapes the target directory/);
  assert.deepStrictEqual(fs.readdirSync(dest), []);
  assert.ok(!fs.existsSync(path.join(dest, "evil.txt")));
});

test("extract: absolute names are refused", () => {
  const dest = tmp();
  assert.throws(() => extract(Buffer.concat([rawEntry({ name: "/tmp/abs.txt" }), END]), dest), /absolute path/);
});

test("extract: links are skipped, never created", () => {
  const dest = tmp();
  const msgs = [];
  const link = rawEntry({ name: "ln", flag: "2" });
  const n = extract(Buffer.concat([link, rawEntry({ name: "f", data: Buffer.from("x") }), END]), dest, (m) => msgs.push(m));
  assert.strictEqual(n, 1);
  assert.deepStrictEqual(msgs, ["skipped symlink: ln"]);
  assert.deepStrictEqual(fs.readdirSync(dest), ["f"]);
});

test("CLI: create, list, extract", () => {
  const work = tmp();
  fs.mkdirSync(path.join(work, "proj", "sub"), { recursive: true });
  fs.writeFileSync(path.join(work, "proj", "a.txt"), "hello\n");
  fs.writeFileSync(path.join(work, "proj", "sub", "b.txt"), "world\n");
  assert.strictEqual(run(["c", "out.tar", "proj"], work).code, 0);
  const listing = run(["t", "out.tar"], work).out.trim().split("\n").map((l) => l.trim().split(/\s+/).pop());
  assert.deepStrictEqual(listing, ["proj/", "proj/a.txt", "proj/sub/", "proj/sub/b.txt"]);
  const x = run(["x", "out.tar", "-C", "ex"], work);
  assert.deepStrictEqual([x.code, x.out], [0, "extracted 4 entries\n"]);
  assert.strictEqual(fs.readFileSync(path.join(work, "ex", "proj", "sub", "b.txt"), "utf8"), "world\n");
});

test("CLI: errors exit 1, usage errors exit 2", () => {
  const work = tmp();
  fs.writeFileSync(path.join(work, "bad.tar"), Buffer.alloc(512, 1));
  assert.strictEqual(run(["t", "bad.tar"], work).code, 1);
  assert.strictEqual(run(["t", "missing.tar"], work).code, 1);
  assert.strictEqual(run(["c", "o.tar", "missing"], work).code, 1);
  assert.strictEqual(run([], work).code, 2);
  assert.strictEqual(run(["z", "a"], work).code, 2);
  assert.strictEqual(run(["c", "only-archive"], work).code, 2);
  assert.strictEqual(run(["x", "a.tar", "-C"], work).code, 2);
});

test("CLI: an unsafe archive exits 1 and extracts nothing", () => {
  const work = tmp();
  fs.writeFileSync(path.join(work, "evil.tar"), pack([{ name: "../up.txt", type: "file", data: "x" }]));
  const r = run(["x", "evil.tar", "-C", "out"], work);
  assert.strictEqual(r.code, 1);
  assert.match(r.err, /escapes the target directory/);
  assert.ok(!fs.existsSync(path.join(work, "up.txt")));
});

test("interop: GNU tar reads what tarlite writes", { skip: !HAVE_TAR }, () => {
  const work = tmp();
  const long = "d".repeat(70) + "/" + "e".repeat(70) + "/file-" + "f".repeat(30) + ".txt";
  fs.writeFileSync(path.join(work, "x.tar"), pack([
    { name: "top.txt", type: "file", data: "one", mtime: 1700000000 },
    { name: long, type: "file", data: "x".repeat(1500) },
    { name: "emptydir", type: "dir" },
  ]));
  const list = spawnSync("tar", ["-tf", "x.tar"], { cwd: work }).stdout.toString().split(/\r?\n/).filter(Boolean);
  assert.deepStrictEqual(list, ["top.txt", long, "emptydir/"]);
  assert.strictEqual(spawnSync("tar", ["-xf", "x.tar"], { cwd: work }).status, 0);
  assert.strictEqual(fs.readFileSync(path.join(work, "top.txt"), "utf8"), "one");
  assert.strictEqual(fs.readFileSync(path.join(work, ...long.split("/")), "utf8"), "x".repeat(1500));
});

test("interop: tarlite reads what GNU tar writes (ustar, gnu and pax formats)", { skip: !HAVE_TAR }, () => {
  const work = tmp();
  const long = "d".repeat(90) + "/" + "e".repeat(90) + "/f.txt"; // too long for ustar's prefix split? 189 bytes: fits
  const longer = "g".repeat(120) + "/" + "h".repeat(120) + "/f.txt"; // needs GNU/pax long-name handling
  for (const rel of [long, longer]) {
    fs.mkdirSync(path.join(work, "src", path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(work, "src", ...rel.split("/")), "payload-" + rel.length);
  }
  for (const format of ["ustar", "gnu", "pax", "v7"]) {
    const args = ["-cf", `${format}.tar`, `--format=${format}`, "-C", "src", "."];
    const made = spawnSync("tar", args, { cwd: work });
    if (made.status !== 0) {
      assert.strictEqual(format === "ustar" || format === "v7", true, `unexpected failure for ${format}`);
      continue; // ustar and v7 cannot hold the longest name: GNU tar says so
    }
    const entries = unpack(fs.readFileSync(path.join(work, `${format}.tar`)));
    const files = Object.fromEntries(entries.filter((e) => e.type === "file").map((e) => [e.name.replace(/^\.\//, ""), e.data.toString()]));
    assert.deepStrictEqual(files, { [long]: "payload-" + long.length, [longer]: "payload-" + longer.length }, format);
  }
});
