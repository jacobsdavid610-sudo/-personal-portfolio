const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { parse, format } = require("../scripts/duration.js");

const CLI = path.join(__dirname, "..", "scripts", "duration.js");

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

test("parse: each unit", () => {
  assert.strictEqual(parse("5ms"), 5);
  assert.strictEqual(parse("2s"), 2 * SEC);
  assert.strictEqual(parse("3m"), 3 * MIN);
  assert.strictEqual(parse("4h"), 4 * HOUR);
  assert.strictEqual(parse("5d"), 5 * DAY);
  assert.strictEqual(parse("6w"), 6 * WEEK);
});

test("parse: m is minutes and ms is milliseconds", () => {
  assert.strictEqual(parse("1m"), 60000);
  assert.strictEqual(parse("1ms"), 1);
  assert.strictEqual(parse("1m1ms"), 60001);
});

test("parse: units combine", () => {
  assert.strictEqual(parse("1h30m"), HOUR + 30 * MIN);
  assert.strictEqual(parse("1d2h3m4s5ms"), DAY + 2 * HOUR + 3 * MIN + 4 * SEC + 5);
});

test("parse: whitespace between terms and around the string is fine", () => {
  assert.strictEqual(parse("  1h  30m "), HOUR + 30 * MIN);
  assert.strictEqual(parse("1 h 30 m"), HOUR + 30 * MIN);
});

test("parse: order does not matter", () => {
  assert.strictEqual(parse("30m1h"), parse("1h30m"));
});

test("parse: fractions", () => {
  assert.strictEqual(parse("1.5h"), 90 * MIN);
  assert.strictEqual(parse("0.25s"), 250);
  assert.strictEqual(parse("1.5h30s"), 90 * MIN + 30 * SEC);
});

test("parse: floating point noise does not leak into the result", () => {
  // 0.1 * 1000 is 100.00000000000001 in floating point.
  assert.strictEqual(parse("0.1s"), 100);
  assert.strictEqual(parse("0.3s"), 300);
});

test("parse: fractions of a millisecond round to whole milliseconds", () => {
  assert.strictEqual(parse("1.4ms"), 1);
  assert.strictEqual(parse("1.5ms"), 2);
});

test("parse: negative durations", () => {
  assert.strictEqual(parse("-1h"), -HOUR);
  assert.strictEqual(parse("-2d 3h"), -(2 * DAY + 3 * HOUR));
  assert.strictEqual(parse("- 5s"), -5 * SEC);
});

test("parse: zero is zero, never negative zero", () => {
  assert.ok(Object.is(parse("0s"), 0));
  assert.ok(Object.is(parse("-0s"), 0));
  assert.ok(Object.is(parse("-0.4ms"), 0));
});

test("parse: rejects a repeated unit", () => {
  assert.throws(() => parse("1h1h"), /appears twice/);
  assert.throws(() => parse("1m 2s 3m"), /appears twice/);
});

test("parse: rejects text that is not a duration", () => {
  for (const bad of ["", "   ", "-", "90", "h", "1x", "1h 30", "abc", "1h,30m", "1..5h", ".5h", "1h-30m", "+1h"]) {
    assert.throws(() => parse(bad), TypeError, `should reject ${JSON.stringify(bad)}`);
  }
});

test("parse: a bare number is refused rather than guessed as milliseconds", () => {
  assert.throws(() => parse("1500"), /not a duration/);
});

test("parse: units are case sensitive", () => {
  assert.throws(() => parse("1H"), TypeError);
  assert.throws(() => parse("1M"), TypeError);
});

test("parse: rejects non-strings", () => {
  for (const bad of [null, undefined, 5, {}, ["1h"]]) {
    assert.throws(() => parse(bad), TypeError);
  }
});

test("parse: refuses values that cannot be held exactly", () => {
  assert.throws(() => parse("99999999999999999w"), RangeError);
});

test("parse: the largest exact value is accepted", () => {
  assert.strictEqual(parse(`${Number.MAX_SAFE_INTEGER}ms`), Number.MAX_SAFE_INTEGER);
});

test("format: single units", () => {
  assert.strictEqual(format(5), "5ms");
  assert.strictEqual(format(SEC), "1s");
  assert.strictEqual(format(MIN), "1m");
  assert.strictEqual(format(HOUR), "1h");
  assert.strictEqual(format(DAY), "1d");
  assert.strictEqual(format(WEEK), "1w");
});

test("format: combines units, largest first, skipping zeros", () => {
  assert.strictEqual(format(HOUR + 30 * MIN), "1h 30m");
  assert.strictEqual(format(DAY + 2 * HOUR + 3 * MIN + 4 * SEC + 5), "1d 2h 3m 4s 5ms");
  assert.strictEqual(format(DAY + 5 * SEC), "1d 5s");
});

test("format: weeks are used for 7 days and over", () => {
  assert.strictEqual(format(WEEK + DAY), "1w 1d");
  assert.strictEqual(format(6 * DAY), "6d");
});

test("format: zero", () => {
  assert.strictEqual(format(0), "0ms");
  assert.strictEqual(format(-0), "0ms");
});

test("format: negative", () => {
  assert.strictEqual(format(-1500), "-1s 500ms");
});

test("format: a value that rounds to zero has no sign", () => {
  assert.strictEqual(format(-0.4), "0ms");
});

test("format: fractional milliseconds are rounded", () => {
  assert.strictEqual(format(1.6), "2ms");
});

test("format: maxUnits keeps the largest units and truncates", () => {
  const ms = DAY + 2 * HOUR + 3 * MIN;
  assert.strictEqual(format(ms, { maxUnits: 1 }), "1d");
  assert.strictEqual(format(ms, { maxUnits: 2 }), "1d 2h");
  assert.strictEqual(format(ms, { maxUnits: 9 }), "1d 2h 3m");
});

test("format: maxUnits counts non-zero units, not every unit passed over", () => {
  assert.strictEqual(format(DAY + 5 * SEC, { maxUnits: 2 }), "1d 5s");
});

test("format: maxUnits applies to negatives too", () => {
  assert.strictEqual(format(-(HOUR + 30 * MIN + 5 * SEC), { maxUnits: 2 }), "-1h 30m");
});

test("format: rejects bad input", () => {
  for (const bad of [NaN, Infinity, -Infinity, "5", null, undefined]) {
    assert.throws(() => format(bad), TypeError);
  }
  assert.throws(() => format(5, { maxUnits: 0 }), RangeError);
  assert.throws(() => format(5, { maxUnits: NaN }), RangeError);
});

test("round trip: format then parse gives the same number", () => {
  for (const ms of [0, 1, 999, 1000, 61001, HOUR, DAY + 1, WEEK * 3 + 17, 123456789, -98765, 2 ** 40]) {
    assert.strictEqual(parse(format(ms)), ms, `ms=${ms}`);
  }
});

function run(...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test("cli: parses a duration", () => {
  const r = run("1h30m");
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out, "5400000\n");
});

test("cli: -f formats milliseconds", () => {
  const r = run("-f", "93784000");
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out, "1d 2h 3m 4s\n");
});

test("cli: -n limits the units", () => {
  assert.strictEqual(run("-n", "2", "-f", "93784000").out, "1d 2h\n");
});

test("cli: -f accepts a negative number", () => {
  assert.strictEqual(run("-f", "-1500").out, "-1s 500ms\n");
});

test("cli: a bad duration exits 1 with a message on stderr", () => {
  const r = run("nonsense");
  assert.strictEqual(r.code, 1);
  assert.strictEqual(r.out, "");
  assert.match(r.err, /not a duration/);
});

test("cli: -f with something that is not a number exits 1", () => {
  const r = run("-f", "1h");
  assert.strictEqual(r.code, 1);
  assert.match(r.err, /not a number/);
});

test("cli: usage errors exit 2", () => {
  assert.strictEqual(run().code, 2);
  assert.strictEqual(run("1h", "2h").code, 2);
  assert.strictEqual(run("-n", "0", "1h").code, 2);
  assert.strictEqual(run("-n", "x", "1h").code, 2);
  assert.strictEqual(run("-n").code, 2);
});
