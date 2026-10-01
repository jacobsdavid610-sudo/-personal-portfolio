const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const { v4, createV7Generator, parse, isValid } = require("../scripts/uuid.js");

test("v4 has the right shape, version nibble, and variant bits", () => {
  for (let i = 0; i < 200; i++) {
    const id = v4();
    assert.ok(isValid(id), id);
    assert.strictEqual(id[14], "4");
    assert.ok("89ab".includes(id[19]), `variant char was ${id[19]}`);
  }
});

test("v4 agrees with crypto.randomUUID's format", () => {
  const ours = parse(v4());
  const node = parse(crypto.randomUUID());
  assert.strictEqual(ours.version, node.version);
  assert.strictEqual(ours.variant, node.variant);
});

test("v4 overwrites version/variant bits even when random bytes are all 0xff", () => {
  const id = v4({ random: () => Buffer.alloc(16, 0xff) });
  assert.strictEqual(id, "ffffffff-ffff-4fff-bfff-ffffffffffff");
});

test("v7 encodes the clock's timestamp and parse reads it back", () => {
  const ts = Date.UTC(2026, 9, 1, 12, 0, 0);
  const gen = createV7Generator({ clock: () => ts });
  const info = parse(gen());
  assert.strictEqual(info.version, 7);
  assert.strictEqual(info.variant, "rfc9562");
  assert.strictEqual(info.timestamp, ts);
  assert.strictEqual(info.date.toISOString(), "2026-10-01T12:00:00.000Z");
});

test("v7 handles timestamps above 2^32 without bitwise truncation", () => {
  const ts = 2 ** 47 + 12345;
  const gen = createV7Generator({ clock: () => ts });
  assert.strictEqual(parse(gen()).timestamp, ts);
});

test("v7 ids sort lexicographically in creation order across milliseconds", () => {
  let now = 1_700_000_000_000;
  const gen = createV7Generator({ clock: () => now });
  const ids = [];
  for (let i = 0; i < 50; i++) {
    ids.push(gen());
    now += 1;
  }
  assert.deepStrictEqual([...ids].sort(), ids);
});

test("v7 ids are strictly increasing within the same millisecond", () => {
  const gen = createV7Generator({ clock: () => 1_700_000_000_000 });
  const ids = Array.from({ length: 1000 }, () => gen());
  for (let i = 1; i < ids.length; i++) {
    assert.ok(ids[i] > ids[i - 1], `${ids[i]} <= ${ids[i - 1]}`);
  }
  assert.strictEqual(new Set(ids).size, ids.length);
});

test("v7 counter overflow bumps the timestamp forward instead of wrapping", () => {
  const ts = 1_700_000_000_000;
  // all-0xff random seeds the counter at its max starting point (0x7ff)
  const gen = createV7Generator({ clock: () => ts, random: () => Buffer.alloc(16, 0xff) });
  const ids = Array.from({ length: 0x1000 }, () => gen());
  for (let i = 1; i < ids.length; i++) assert.ok(ids[i] > ids[i - 1]);
  assert.strictEqual(parse(ids[ids.length - 1]).timestamp, ts + 1);
});

test("v7 never goes backwards when the clock does", () => {
  let now = 1_700_000_005_000;
  const gen = createV7Generator({ clock: () => now });
  const before = gen();
  now -= 5000; // e.g. an NTP correction
  const after = gen();
  assert.ok(after > before);
  assert.strictEqual(parse(after).timestamp, 1_700_000_005_000);
});

test("v7 rejects a clock value outside the 48-bit range", () => {
  assert.throws(() => createV7Generator({ clock: () => -1 })(), RangeError);
  assert.throws(() => createV7Generator({ clock: () => 2 ** 48 })(), RangeError);
  assert.throws(() => createV7Generator({ clock: () => NaN })(), RangeError);
});

test("parse accepts uppercase and reports variants correctly", () => {
  assert.strictEqual(parse("6BA7B810-9DAD-11D1-80B4-00C04FD430C8").version, 1);
  assert.strictEqual(parse("6ba7b810-9dad-11d1-80b4-00c04fd430c8").variant, "rfc9562");
  assert.strictEqual(parse("00000000-0000-0000-0000-000000000000").variant, "ncs");
  assert.strictEqual(parse("00000000-0000-0000-c000-000000000000").variant, "microsoft");
});

test("parse only exposes a timestamp for v7", () => {
  assert.strictEqual(parse(v4()).timestamp, undefined);
});

test("invalid strings are rejected", () => {
  for (const bad of ["", "not-a-uuid", "6ba7b8109dad11d180b400c04fd430c8",
    "6ba7b810-9dad-11d1-80b4-00c04fd430c", "6ba7b810-9dad-11d1-80b4-00c04fd430cg", null, 42]) {
    assert.strictEqual(isValid(bad), false, String(bad));
    assert.throws(() => parse(bad), TypeError);
  }
});
