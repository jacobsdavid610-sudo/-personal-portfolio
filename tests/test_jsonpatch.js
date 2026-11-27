const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { apply, diff, get, parsePointer, formatPointer, equal, PatchError } = require("../scripts/jsonpatch.js");

const CLI = path.join(__dirname, "..", "scripts", "jsonpatch.js");

function run(args, input) {
  const r = spawnSync(process.execPath, [CLI, ...args], { input });
  return { code: r.status, out: r.stdout.toString().replace(/\r\n/g, "\n"), err: r.stderr.toString() };
}

const fails = (doc, patch, re) => assert.throws(() => apply(doc, patch), re || PatchError);

// --- pointers (RFC 6901 section 5) ---

test("RFC 6901 example document", () => {
  const doc = {
    foo: ["bar", "baz"],
    "": 0,
    "a/b": 1,
    "c%d": 2,
    "e^f": 3,
    "g|h": 4,
    "i\\j": 5,
    'k"l': 6,
    " ": 7,
    "m~n": 8,
  };
  const want = [
    ["", doc],
    ["/foo", ["bar", "baz"]],
    ["/foo/0", "bar"],
    ["/", 0],
    ["/a~1b", 1],
    ["/c%d", 2],
    ["/e^f", 3],
    ["/g|h", 4],
    ["/i\\j", 5],
    ['/k"l', 6],
    ["/ ", 7],
    ["/m~0n", 8],
  ];
  for (const [ptr, value] of want) assert.deepStrictEqual(get(doc, ptr), value, ptr);
});

test("pointer parsing and formatting round trip", () => {
  assert.deepStrictEqual(parsePointer("/a~1b/~0/"), ["a/b", "~", ""]);
  assert.strictEqual(formatPointer(["a/b", "~", ""]), "/a~1b/~0/");
  assert.deepStrictEqual(parsePointer(""), []);
  // ~01 is "~1" literally, not "/".
  assert.deepStrictEqual(parsePointer("/~01"), ["~1"]);
});

test("bad pointers are rejected", () => {
  for (const bad of ["a", "/a~", "/a~2", 5, null]) assert.throws(() => parsePointer(bad), PatchError, String(bad));
});

test("array indices must be canonical", () => {
  const doc = { a: [10, 20] };
  assert.strictEqual(get(doc, "/a/1"), 20);
  for (const bad of ["/a/01", "/a/-1", "/a/x", "/a/2", "/a/-", "/a/1.0", "/a/ 1"]) {
    assert.throws(() => get(doc, bad), PatchError, bad);
  }
});

test("get does not walk the prototype chain", () => {
  assert.throws(() => get({}, "/constructor"), PatchError);
  assert.throws(() => get({}, "/__proto__"), PatchError);
  assert.throws(() => get([], "/length"), PatchError);
});

// --- RFC 6902 appendix A ---

const A = [
  ["A.1 add an object member", { foo: "bar" }, [{ op: "add", path: "/baz", value: "qux" }], { baz: "qux", foo: "bar" }],
  [
    "A.2 add an array element",
    { foo: ["bar", "baz"] },
    [{ op: "add", path: "/foo/1", value: "qux" }],
    { foo: ["bar", "qux", "baz"] },
  ],
  ["A.3 remove an object member", { baz: "qux", foo: "bar" }, [{ op: "remove", path: "/baz" }], { foo: "bar" }],
  [
    "A.4 remove an array element",
    { foo: ["bar", "qux", "baz"] },
    [{ op: "remove", path: "/foo/1" }],
    { foo: ["bar", "baz"] },
  ],
  [
    "A.5 replace a value",
    { baz: "qux", foo: "bar" },
    [{ op: "replace", path: "/baz", value: "boo" }],
    { baz: "boo", foo: "bar" },
  ],
  [
    "A.6 move a value",
    { foo: { bar: "baz", waldo: "fred" }, qux: { corge: "grault" } },
    [{ op: "move", from: "/foo/waldo", path: "/qux/thud" }],
    { foo: { bar: "baz" }, qux: { corge: "grault", thud: "fred" } },
  ],
  [
    "A.7 move an array element",
    { foo: ["all", "grass", "cows", "eat"] },
    [{ op: "move", from: "/foo/1", path: "/foo/3" }],
    { foo: ["all", "cows", "eat", "grass"] },
  ],
  [
    "A.8 test success",
    { baz: "qux", foo: ["a", 2, "c"] },
    [{ op: "test", path: "/baz", value: "qux" }, { op: "test", path: "/foo/1", value: 2 }],
    { baz: "qux", foo: ["a", 2, "c"] },
  ],
  [
    "A.10 add a nested member object",
    { foo: "bar" },
    [{ op: "add", path: "/child", value: { grandchild: {} } }],
    { foo: "bar", child: { grandchild: {} } },
  ],
  [
    "A.11 ignore unrecognised element",
    { foo: "bar" },
    [{ op: "add", path: "/baz", value: "qux", xyz: 123 }],
    { foo: "bar", baz: "qux" },
  ],
  [
    "A.14 ~ escape ordering",
    { "/": 9, "~1": 10 },
    [{ op: "test", path: "/~01", value: 10 }],
    { "/": 9, "~1": 10 },
  ],
  [
    "A.15 comparing strings and numbers",
    { "/": 9, "~1": 10 },
    [{ op: "test", path: "/~01", value: "10" }],
    "FAIL",
  ],
  [
    "A.16 add an array value",
    { foo: ["bar"] },
    [{ op: "add", path: "/foo/-", value: ["abc", "def"] }],
    { foo: ["bar", ["abc", "def"]] },
  ],
  ["A.9 test failure", { baz: "qux" }, [{ op: "test", path: "/baz", value: "bar" }], "FAIL"],
  ["A.12 add to a nonexistent target", { foo: "bar" }, [{ op: "add", path: "/baz/bat", value: "qux" }], "FAIL"],
  [
    "A.13 invalid JSON patch document (duplicate keys case: unknown op)",
    { foo: "bar" },
    [{ op: "bad", path: "/baz" }],
    "FAIL",
  ],
];

for (const [name, doc, patch, want] of A) {
  test(`RFC 6902 ${name}`, () => {
    if (want === "FAIL") fails(doc, patch);
    else assert.deepStrictEqual(apply(doc, patch), want);
  });
}

// --- behaviour beyond the appendix ---

test("the input document and patch are never modified", () => {
  const doc = { a: [1, { b: 2 }], c: { d: 3 } };
  const patch = [
    { op: "add", path: "/a/1/b", value: { deep: [1] } },
    { op: "copy", from: "/c", path: "/e" },
    { op: "remove", path: "/a/0" },
  ];
  const docCopy = JSON.parse(JSON.stringify(doc));
  const patchCopy = JSON.parse(JSON.stringify(patch));
  apply(doc, patch);
  assert.deepStrictEqual(doc, docCopy);
  assert.deepStrictEqual(patch, patchCopy);
});

test("added values are copies, so later ops can't alias the patch", () => {
  const value = { x: [1] };
  const out = apply({}, [{ op: "add", path: "/a", value }, { op: "add", path: "/a/x/-", value: 2 }]);
  assert.deepStrictEqual(out, { a: { x: [1, 2] } });
  assert.deepStrictEqual(value, { x: [1] });
});

test("copy duplicates rather than aliases", () => {
  const out = apply({ a: { n: 1 } }, [{ op: "copy", from: "/a", path: "/b" }, { op: "add", path: "/b/n2", value: 2 }]);
  assert.deepStrictEqual(out, { a: { n: 1 }, b: { n: 1, n2: 2 } });
});

test("operations on the root", () => {
  assert.deepStrictEqual(apply({ a: 1 }, [{ op: "replace", path: "", value: [1] }]), [1]);
  assert.deepStrictEqual(apply({ a: 1 }, [{ op: "add", path: "", value: 5 }]), 5);
  assert.deepStrictEqual(apply(5, [{ op: "test", path: "", value: 5 }]), 5);
  fails({ a: 1 }, [{ op: "remove", path: "" }]);
  assert.deepStrictEqual(apply({ a: 1 }, [{ op: "move", from: "", path: "" }]), { a: 1 });
});

test("add on an existing key replaces; remove and replace need the key", () => {
  assert.deepStrictEqual(apply({ a: 1 }, [{ op: "add", path: "/a", value: 2 }]), { a: 2 });
  fails({ a: 1 }, [{ op: "remove", path: "/b" }]);
  fails({ a: 1 }, [{ op: "replace", path: "/b", value: 1 }]);
  fails({ a: [1] }, [{ op: "replace", path: "/a/1", value: 1 }]);
  fails({ a: [1] }, [{ op: "remove", path: "/a/1" }]);
  fails({ a: [1] }, [{ op: "add", path: "/a/2", value: 1 }]);
  assert.deepStrictEqual(apply({ a: [1] }, [{ op: "add", path: "/a/1", value: 2 }]), { a: [1, 2] });
});

test("replace in an array keeps the position", () => {
  assert.deepStrictEqual(apply([1, 2, 3], [{ op: "replace", path: "/1", value: "x" }]), [1, "x", 3]);
});

test("cannot add inside a scalar", () => {
  fails({ a: 1 }, [{ op: "add", path: "/a/b", value: 1 }]);
  fails({ a: null }, [{ op: "add", path: "/a/b", value: 1 }]);
  fails("s", [{ op: "add", path: "/x", value: 1 }]);
});

test("moving a value into itself is refused, but a sibling move is fine", () => {
  fails({ a: { b: 1 } }, [{ op: "move", from: "/a", path: "/a/b/c" }], /into itself/);
  assert.deepStrictEqual(apply({ a: 1, b: 2 }, [{ op: "move", from: "/a", path: "/b" }]), { b: 1 });
  // A move to the same place changes nothing.
  assert.deepStrictEqual(apply({ a: 1 }, [{ op: "move", from: "/a", path: "/a" }]), { a: 1 });
});

test("move within an array removes before it inserts", () => {
  assert.deepStrictEqual(apply([1, 2, 3, 4], [{ op: "move", from: "/0", path: "/2" }]), [2, 3, 1, 4]);
  assert.deepStrictEqual(apply([1, 2, 3, 4], [{ op: "move", from: "/3", path: "/0" }]), [4, 1, 2, 3]);
});

test("a failing patch is all-or-nothing and names the operation", () => {
  const doc = { a: 1 };
  const patch = [{ op: "add", path: "/b", value: 2 }, { op: "test", path: "/a", value: 99 }];
  assert.throws(() => apply(doc, patch), /operation 1: test failed at \/a/);
  assert.deepStrictEqual(doc, { a: 1 });
});

test("test compares deeply, ignoring key order, and keeps types apart", () => {
  const doc = { v: { x: [1, { y: null }], z: true } };
  apply(doc, [{ op: "test", path: "/v", value: { z: true, x: [1, { y: null }] } }]);
  for (const value of [{ z: true, x: [1, { y: 0 }] }, { x: [1, { y: null }] }, 0, "1"]) {
    fails(doc, [{ op: "test", path: "/v", value }]);
  }
  assert.ok(!equal(1, "1"));
  assert.ok(!equal(null, 0));
  assert.ok(!equal([], {}));
  assert.ok(!equal([1], { 0: 1 }));
});

test("malformed operations are errors, not crashes", () => {
  const bad = [
    null,
    5,
    [],
    {},
    { op: "add" },
    { op: "add", path: "/a" },
    { op: "add", path: "a", value: 1 },
    { op: "remove" },
    { op: "move", path: "/a" },
    { op: "copy", from: 1, path: "/a" },
    { op: "test", path: "/a" },
    { op: 5, path: "/a" },
    { op: "ADD", path: "/a", value: 1 },
    { op: "move", from: "/nope", path: "/a" },
  ];
  for (const op of bad) fails({ a: 1 }, [op]);
  fails({}, {}); // patch itself must be an array
  fails({}, "x");
});

test("a key named __proto__ is ordinary data", () => {
  const out = apply({}, [{ op: "add", path: "/__proto__", value: { polluted: true } }]);
  assert.strictEqual(Object.getPrototypeOf(out), Object.prototype);
  assert.strictEqual({}.polluted, undefined);
  assert.deepStrictEqual(Object.keys(out), ["__proto__"]);
  assert.strictEqual(Object.getOwnPropertyDescriptor(out, "__proto__").value.polluted, true);
  // And the same coming from parsed JSON.
  const parsed = JSON.parse('{"__proto__": {"x": 1}}');
  const copy = apply(parsed, [{ op: "add", path: "/k", value: 1 }]);
  assert.strictEqual(Object.getPrototypeOf(copy), Object.prototype);
  assert.deepStrictEqual(Object.keys(copy), ["__proto__", "k"]);
  assert.strictEqual({}.x, undefined);
});

test("keys needing escapes survive add, remove and move", () => {
  const out = apply({}, [
    { op: "add", path: "/a~1b", value: 1 },
    { op: "add", path: "/~0", value: 2 },
    { op: "move", from: "/a~1b", path: "/c~1d" },
  ]);
  assert.deepStrictEqual(out, { "~": 2, "c/d": 1 });
});

// --- diff ---

test("diff of equal documents is empty", () => {
  assert.deepStrictEqual(diff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), []);
});

test("diff produces small, readable patches", () => {
  assert.deepStrictEqual(diff({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 }), [
    { op: "replace", path: "/b", value: 3 },
    { op: "add", path: "/c", value: 4 },
  ]);
  assert.deepStrictEqual(diff({ a: 1, b: 2 }, { a: 1 }), [{ op: "remove", path: "/b" }]);
  assert.deepStrictEqual(diff([1, 2, 3], [1, 2]), [{ op: "remove", path: "/2" }]);
  assert.deepStrictEqual(diff([1], [1, 2]), [{ op: "add", path: "/-", value: 2 }]);
  assert.deepStrictEqual(diff(1, 2), [{ op: "replace", path: "", value: 2 }]);
  assert.deepStrictEqual(diff({ "a/b": 1 }, { "a/b": 2 }), [{ op: "replace", path: "/a~1b", value: 2 }]);
});

test("diff removes array tails from the end so indices stay valid", () => {
  const ops = diff([1, 2, 3, 4], [1]);
  assert.deepStrictEqual(ops.map((o) => o.path), ["/3", "/2", "/1"]);
  assert.deepStrictEqual(apply([1, 2, 3, 4], ops), [1]);
});

test("changing type is a replace, even object to array", () => {
  assert.deepStrictEqual(apply({ a: {} }, diff({ a: {} }, { a: [] })), { a: [] });
  assert.deepStrictEqual(apply([], diff([], {})), {});
  assert.deepStrictEqual(apply(null, diff(null, { a: 1 })), { a: 1 });
});

test("fuzz: apply(a, diff(a, b)) equals b for 2,000 random pairs", () => {
  let seed = 12345;
  const rnd = (n) => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return seed % n;
  };
  const keys = ["a", "b", "a/b", "~", "", "__proto__", "0", "-"];
  function gen(depth) {
    const k = rnd(depth > 3 ? 4 : 7);
    if (k === 0) return rnd(4);
    if (k === 1) return ["x", "", "y"][rnd(3)];
    if (k === 2) return [null, true, false][rnd(3)];
    if (k === 3) return rnd(2) ? 1.5 : -0.25;
    if (k < 6) return Array.from({ length: rnd(5) }, () => gen(depth + 1));
    const o = {};
    for (let i = rnd(5); i > 0; i--) {
      Object.defineProperty(o, keys[rnd(keys.length)], { value: gen(depth + 1), enumerable: true, writable: true, configurable: true });
    }
    return o;
  }
  // Make b a mutation of a half the time, so the pair shares structure.
  function mutate(v) {
    if (rnd(4) === 0) return gen(2);
    if (Array.isArray(v)) {
      const out = v.map(mutate);
      if (rnd(3) === 0) out.pop();
      if (rnd(3) === 0) out.push(gen(3));
      return out;
    }
    if (v && typeof v === "object") {
      const out = {};
      for (const key of Object.keys(v)) {
        if (rnd(5) !== 0) Object.defineProperty(out, key, { value: mutate(v[key]), enumerable: true, writable: true, configurable: true });
      }
      if (rnd(3) === 0) Object.defineProperty(out, keys[rnd(keys.length)], { value: gen(3), enumerable: true, writable: true, configurable: true });
      return out;
    }
    return rnd(3) === 0 ? gen(3) : v;
  }
  for (let i = 0; i < 2000; i++) {
    const a = gen(0);
    const b = i % 2 ? gen(0) : mutate(a);
    const aBefore = JSON.stringify(a);
    const patch = diff(a, b);
    assert.ok(equal(apply(a, patch), b), `pair ${i}: ${JSON.stringify(a)} -> ${JSON.stringify(b)} via ${JSON.stringify(patch)}`);
    assert.strictEqual(JSON.stringify(a), aBefore);
  }
});

// --- CLI ---

function tmpFiles(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsonpatch-"));
  const out = {};
  for (const [name, content] of Object.entries(files)) {
    out[name] = path.join(dir, name);
    fs.writeFileSync(out[name], content);
  }
  return [dir, out];
}

test("CLI apply and diff", () => {
  const [dir, f] = tmpFiles({
    doc: '{"a":1}',
    patch: '[{"op":"add","path":"/b","value":[1]}]',
    bad: '[{"op":"test","path":"/a","value":2}]',
    junk: "{nope",
  });
  try {
    let r = run(["apply", f.doc, f.patch]);
    assert.strictEqual(r.code, 0);
    assert.deepStrictEqual(JSON.parse(r.out), { a: 1, b: [1] });

    r = run(["diff", f.doc, "-"], '{"a":2}');
    assert.strictEqual(r.code, 0);
    assert.deepStrictEqual(JSON.parse(r.out), [{ op: "replace", path: "/a", value: 2 }]);

    r = run(["apply", "-", f.patch], '{"z":0}');
    assert.deepStrictEqual(JSON.parse(r.out), { z: 0, b: [1] });

    r = run(["apply", f.doc, f.bad]);
    assert.strictEqual(r.code, 1);
    assert.match(r.err, /operation 0: test failed at \/a/);
    assert.strictEqual(r.out, "");

    r = run(["apply", f.doc, f.junk]);
    assert.strictEqual(r.code, 1);
    r = run(["apply", f.doc, path.join(dir, "missing")]);
    assert.strictEqual(r.code, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI usage errors exit 2", () => {
  assert.strictEqual(run([]).code, 2);
  assert.strictEqual(run(["apply", "only-one"]).code, 2);
  assert.strictEqual(run(["merge", "a", "b"]).code, 2);
  assert.strictEqual(run(["apply", "-", "-"], "{}").code, 2);
});
