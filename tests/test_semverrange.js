const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { parse, compare, satisfies, maxSatisfying, minSatisfying, validRange } = require("../scripts/semverrange.js");

const CLI = path.join(__dirname, "..", "scripts", "semverrange.js");

function run(args) {
  const r = spawnSync(process.execPath, [CLI, ...args]);
  return { code: r.status, out: r.stdout.toString().replace(/\r\n/g, "\n"), err: r.stderr.toString() };
}

test("parse: valid and invalid versions", () => {
  assert.deepStrictEqual(parse("1.2.3"), { major: 1, minor: 2, patch: 3, pre: [] });
  assert.deepStrictEqual(parse("v1.2.3-beta.1+build.5"), { major: 1, minor: 2, patch: 3, pre: ["beta", "1"] });
  for (const bad of ["1.2", "01.2.3", "1.2.3.4", "1.2.3-", "1.2.3-a..b", "a.b.c", "", null, 5]) {
    assert.strictEqual(parse(bad), null, String(bad));
  }
});

test("compare: the precedence example from the semver spec", () => {
  const ordered = [
    "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2",
    "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0",
  ];
  for (let i = 0; i < ordered.length; i++) {
    for (let j = 0; j < ordered.length; j++) {
      assert.strictEqual(compare(ordered[i], ordered[j]), Math.sign(i - j), `${ordered[i]} vs ${ordered[j]}`);
    }
  }
});

test("compare: build metadata is ignored; bad versions throw", () => {
  assert.strictEqual(compare("1.2.3+a", "1.2.3+b"), 0);
  assert.strictEqual(compare("1.10.0", "1.9.0"), 1);
  assert.throws(() => compare("1.2", "1.2.3"), TypeError);
});

// range, then versions that match, then versions that must not.
const CASES = [
  ["1.2.3", ["1.2.3"], ["1.2.4", "1.2.2"]],
  ["=1.2.3", ["1.2.3"], ["1.2.4"]],
  [">1.2.3", ["1.2.4", "2.0.0"], ["1.2.3", "1.0.0"]],
  [">=1.2.3", ["1.2.3", "1.2.4"], ["1.2.2"]],
  ["<1.2.3", ["1.2.2", "0.0.1"], ["1.2.3", "1.2.4"]],
  ["<=1.2.3", ["1.2.3", "1.0.0"], ["1.2.4"]],
  [">= 1.2.3", ["1.2.3"], ["1.2.2"]],
  ["^1.2.3", ["1.2.3", "1.9.9"], ["1.2.2", "2.0.0", "0.9.0"]],
  ["^0.2.3", ["0.2.3", "0.2.9"], ["0.3.0", "0.2.2", "1.0.0"]],
  ["^0.0.3", ["0.0.3"], ["0.0.4", "0.0.2"]],
  ["^1.2", ["1.2.0", "1.9.0"], ["1.1.9", "2.0.0"]],
  ["^0.0", ["0.0.0", "0.0.9"], ["0.1.0"]],
  ["^0", ["0.0.0", "0.9.9"], ["1.0.0"]],
  ["^1.x", ["1.0.0", "1.8.0"], ["2.0.0", "0.9.0"]],
  ["~1.2.3", ["1.2.3", "1.2.9"], ["1.3.0", "1.2.2"]],
  ["~1.2", ["1.2.0", "1.2.9"], ["1.3.0", "1.1.9"]],
  ["~1", ["1.0.0", "1.9.0"], ["2.0.0", "0.9.0"]],
  ["~0.2.3", ["0.2.3", "0.2.9"], ["0.3.0"]],
  ["1.x", ["1.0.0", "1.99.0"], ["2.0.0", "0.9.9"]],
  ["1.2.x", ["1.2.0", "1.2.9"], ["1.3.0", "1.1.0"]],
  ["1.2.*", ["1.2.5"], ["1.3.0"]],
  ["1", ["1.5.5"], ["2.0.0"]],
  ["1.2", ["1.2.7"], ["1.3.0"]],
  ["*", ["0.0.0", "99.0.0"], []],
  ["", ["1.2.3"], []],
  ["x", ["3.4.5"], []],
  [">1.2", ["1.3.0", "2.0.0"], ["1.2.9", "1.2.0"]],
  [">1", ["2.0.0"], ["1.9.9"]],
  [">=1.2", ["1.2.0"], ["1.1.9"]],
  ["<1.2", ["1.1.9"], ["1.2.0"]],
  ["<=1.2", ["1.2.9"], ["1.3.0"]],
  ["<=1", ["1.9.9"], ["2.0.0"]],
  ["<1", ["0.9.9"], ["1.0.0"]],
  ["1.2.3 - 2.3.4", ["1.2.3", "2.3.4", "2.0.0"], ["1.2.2", "2.3.5"]],
  ["1.2 - 2.3", ["1.2.0", "2.3.9"], ["1.1.9", "2.4.0"]],
  ["1.2.3 - 2", ["2.9.9"], ["3.0.0", "1.2.2"]],
  [">=1.0.0 <2.0.0", ["1.5.0"], ["2.0.0", "0.9.0"]],
  [">=1.2.3 <1.2.6 || >=2.0.0", ["1.2.5", "2.0.0", "5.0.0"], ["1.2.6", "1.9.0"]],
  ["^1.2.3 || ^3.0.0", ["1.5.0", "3.1.0"], ["2.0.0"]],
  [">1.x", ["2.0.0"], ["1.9.0"]],
];

for (const [range, yes, no] of CASES) {
  test(`satisfies: ${JSON.stringify(range)}`, () => {
    for (const v of yes) assert.strictEqual(satisfies(v, range), true, `${v} should match`);
    for (const v of no) assert.strictEqual(satisfies(v, range), false, `${v} should not match`);
  });
}

test("prerelease versions only match a range that names one at the same version", () => {
  assert.strictEqual(satisfies("1.5.0-beta", "^1.2.3"), false);
  assert.strictEqual(satisfies("2.0.0-alpha", "^1.2.3"), false); // not even below the upper bound
  assert.strictEqual(satisfies("1.2.3-beta.5", "^1.2.3-beta.2"), true);
  assert.strictEqual(satisfies("1.2.3-beta.1", "^1.2.3-beta.2"), false);
  assert.strictEqual(satisfies("1.2.4-beta", "^1.2.3-beta.2"), false);
  assert.strictEqual(satisfies("1.2.3-rc.1", ">=1.2.3-beta"), true);
  assert.strictEqual(satisfies("1.0.0-alpha", "*"), false);
  assert.strictEqual(satisfies("1.0.0-alpha", "<1.0.0"), false);
  assert.strictEqual(satisfies("1.0.0-alpha", "<1.0.0-beta"), true);
});

test("the prerelease rule is per comparator set", () => {
  assert.strictEqual(satisfies("1.2.3-beta", ">=1.2.3-alpha <1.2.3 || ^2.0.0"), true);
  assert.strictEqual(satisfies("2.0.0-beta", ">=1.2.3-alpha <1.2.3 || ^2.0.0"), false);
});

test("satisfies: an invalid version simply does not match", () => {
  assert.strictEqual(satisfies("nope", "*"), false);
  assert.strictEqual(satisfies("1.2", "1.x"), false);
});

test("invalid ranges: validRange gives null, satisfies throws", () => {
  const bad = ["1.x.3", "^", "foo", "1.2.3.4", ">=", "1.2.3 -", "^1.2.3-beta.x.", "1.x-beta", ">=1.2.3 - 2.0.0", "||x||y z"];
  for (const r of bad) {
    assert.strictEqual(validRange(r), null, r);
  }
  assert.throws(() => satisfies("1.0.0", "foo"), /invalid range part/);
  assert.throws(() => satisfies("1.0.0", 5), TypeError);
});

test("validRange: expanded forms", () => {
  const want = {
    "^1.2.3": ">=1.2.3 <2.0.0-0",
    "^0.0.3": ">=0.0.3 <0.0.4-0",
    "~1.2": ">=1.2.0 <1.3.0-0",
    "1.2.x": ">=1.2.0 <1.3.0-0",
    "1.2 - 2.3": ">=1.2.0 <2.4.0-0",
    ">1.2": ">=1.3.0",
    "*": "*",
    "": "*",
    "1.2.3": "1.2.3",
    "^1.2.3 || >=3 <4": ">=1.2.3 <2.0.0-0 || >=3.0.0 <4.0.0-0",
    "> 1.0.0 <= 2.0.0": ">1.0.0 <=2.0.0",
  };
  for (const [range, norm] of Object.entries(want)) assert.strictEqual(validRange(range), norm, range);
});

test("validRange output is a fixed point", () => {
  for (const [range] of CASES) {
    const once = validRange(range);
    assert.strictEqual(validRange(once), once, range);
  }
});

test("a wildcard on the left of a comparator", () => {
  assert.strictEqual(satisfies("1.0.0", ">x"), false);
  assert.strictEqual(satisfies("1.0.0", "<x"), false);
  assert.strictEqual(satisfies("1.0.0", ">=x"), true);
  assert.strictEqual(satisfies("1.0.0", "<=*"), true);
});

test("maxSatisfying and minSatisfying", () => {
  const vs = ["1.2.3", "1.10.0", "1.9.0", "2.0.0", "1.11.0-beta", "bad", "0.9.0"];
  assert.strictEqual(maxSatisfying(vs, "^1.2.3"), "1.10.0");
  assert.strictEqual(minSatisfying(vs, "^1.2.3"), "1.2.3");
  assert.strictEqual(maxSatisfying(vs, ">=1.0.0 <1.2.0"), null);
  assert.strictEqual(maxSatisfying([], "*"), null);
});

test("every version in a range is below its upper bound: brute-force over a grid", () => {
  const versions = [];
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) versions.push(`${a}.${b}.${c}`);
  const upper = { "^1.2.3": "2.0.0", "^0.2.3": "0.3.0", "^0.0.3": "0.0.4", "~1.2.3": "1.3.0", "~1": "2.0.0" };
  const lower = { "^1.2.3": "1.2.3", "^0.2.3": "0.2.3", "^0.0.3": "0.0.3", "~1.2.3": "1.2.3", "~1": "1.0.0" };
  for (const range of Object.keys(upper)) {
    for (const v of versions) {
      const expected = compare(v, lower[range]) >= 0 && compare(v, upper[range]) < 0;
      assert.strictEqual(satisfies(v, range), expected, `${v} in ${range}`);
    }
  }
});

test("CLI: lists matches in the order given", () => {
  const r = run(["^1.2.3", "2.0.0", "1.9.0", "1.2.2", "1.2.3"]);
  assert.deepStrictEqual([r.code, r.out], [0, "1.9.0\n1.2.3\n"]);
});

test("CLI: --max and --min", () => {
  assert.strictEqual(run(["--max", "^1.2.3", "1.2.3", "1.10.0", "1.9.0"]).out, "1.10.0\n");
  assert.strictEqual(run(["--min", "^1.2.3", "1.10.0", "1.2.3", "1.9.0"]).out, "1.2.3\n");
});

test("CLI: --normalize needs no versions", () => {
  const r = run(["--normalize", "~1.2 || 3.x"]);
  assert.deepStrictEqual([r.code, r.out], [0, ">=1.2.0 <1.3.0-0 || >=3.0.0 <4.0.0-0\n"]);
});

test("CLI: nothing matched exits 1 quietly", () => {
  const r = run(["^2.0.0", "1.0.0"]);
  assert.deepStrictEqual([r.code, r.out, r.err], [1, "", ""]);
});

test("CLI: invalid range exits 1 with a message; usage errors exit 2", () => {
  const r = run(["1.x.3", "1.0.0"]);
  assert.strictEqual(r.code, 1);
  assert.match(r.err, /invalid range "1\.x\.3"/);
  assert.strictEqual(run([]).code, 2);
  assert.strictEqual(run(["--bogus", "*"]).code, 2);
});
