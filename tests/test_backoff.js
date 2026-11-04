const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { delay, retry, schedule } = require("../scripts/backoff.js");

const CLI = path.join(__dirname, "..", "scripts", "backoff.js");

const none = { jitter: "none" };

test("delay: doubles each attempt by default", () => {
  assert.deepStrictEqual([0, 1, 2, 3, 4].map((a) => delay(a, none)), [100, 200, 400, 800, 1600]);
});

test("delay: base and factor", () => {
  assert.strictEqual(delay(0, { ...none, base: 50 }), 50);
  assert.strictEqual(delay(2, { ...none, base: 10, factor: 3 }), 90);
});

test("delay: capped at max", () => {
  assert.strictEqual(delay(10, { ...none, max: 1000 }), 1000);
  assert.strictEqual(delay(3, { ...none, max: 1000 }), 800);
});

test("delay: huge attempt numbers stay at the cap instead of overflowing", () => {
  assert.strictEqual(delay(5000, { ...none, max: 60000 }), 60000);
});

test("delay: factor 1 is a constant delay", () => {
  assert.deepStrictEqual([0, 1, 7].map((a) => delay(a, { ...none, factor: 1 })), [100, 100, 100]);
});

test("delay: full jitter spans 0 to the capped value", () => {
  assert.strictEqual(delay(2, { jitter: "full", random: () => 0 }), 0);
  assert.strictEqual(delay(2, { jitter: "full", random: () => 0.5 }), 200);
  assert.strictEqual(delay(2, { jitter: "full", random: () => 0.999999 }), 400);
});

test("delay: equal jitter spans half to the capped value", () => {
  assert.strictEqual(delay(2, { jitter: "equal", random: () => 0 }), 200);
  assert.strictEqual(delay(2, { jitter: "equal", random: () => 0.5 }), 300);
  assert.strictEqual(delay(2, { jitter: "equal", random: () => 0.999999 }), 400);
});

test("delay: jitter is applied after the cap", () => {
  assert.strictEqual(delay(20, { jitter: "full", max: 1000, random: () => 0.5 }), 500);
});

test("delay: the default is full jitter, within bounds", () => {
  for (let i = 0; i < 200; i++) {
    const d = delay(3);
    assert.ok(Number.isInteger(d) && d >= 0 && d <= 800, `got ${d}`);
  }
});

test("delay: result is always a whole number", () => {
  assert.ok(Number.isInteger(delay(1, { jitter: "full", random: () => 0.123456 })));
  assert.ok(Number.isInteger(delay(0, { ...none, base: 0.4 + 0.2 })));
});

test("delay: zero base gives zero", () => {
  assert.strictEqual(delay(5, { ...none, base: 0 }), 0);
});

test("delay: rejects bad arguments", () => {
  for (const bad of [-1, 1.5, "1", NaN, null]) {
    assert.throws(() => delay(bad), RangeError, `attempt ${String(bad)}`);
  }
  assert.throws(() => delay(0, { base: -1 }), RangeError);
  assert.throws(() => delay(0, { base: NaN }), RangeError);
  assert.throws(() => delay(0, { factor: 0.5 }), RangeError);
  assert.throws(() => delay(0, { max: -5 }), RangeError);
  assert.throws(() => delay(0, { max: Infinity }), RangeError);
  assert.throws(() => delay(0, { jitter: "wild" }), RangeError);
});

test("delay: refuses a random() outside [0, 1)", () => {
  assert.throws(() => delay(1, { random: () => 1 }), RangeError);
  assert.throws(() => delay(1, { random: () => -0.1 }), RangeError);
  assert.throws(() => delay(1, { random: () => NaN }), RangeError);
});

test("schedule: delays and running totals, no jitter", () => {
  assert.deepStrictEqual(schedule(3), [
    { attempt: 0, delay: 100, total: 100 },
    { attempt: 1, delay: 200, total: 300 },
    { attempt: 2, delay: 400, total: 700 },
  ]);
});

test("schedule: ignores the jitter option and respects the cap", () => {
  const rows = schedule(4, { jitter: "full", max: 250 });
  assert.deepStrictEqual(rows.map((r) => r.delay), [100, 200, 250, 250]);
  assert.strictEqual(rows[3].total, 800);
});

test("schedule: zero rows", () => {
  assert.deepStrictEqual(schedule(0), []);
});

// ---- retry ---------------------------------------------------------------

function recorder() {
  const waits = [];
  return { waits, sleep: async (ms) => { waits.push(ms); } };
}

test("retry: returns the first success without waiting", async () => {
  const { waits, sleep } = recorder();
  assert.strictEqual(await retry(async () => "ok", { sleep }), "ok");
  assert.deepStrictEqual(waits, []);
});

test("retry: passes the attempt number to fn", async () => {
  const { sleep } = recorder();
  const seen = [];
  await retry(async (a) => { seen.push(a); if (a < 2) throw new Error("no"); }, { sleep, ...none });
  assert.deepStrictEqual(seen, [0, 1, 2]);
});

test("retry: waits the backoff schedule between attempts", async () => {
  const { waits, sleep } = recorder();
  let calls = 0;
  const result = await retry(async () => { if (++calls < 4) throw new Error("no"); return calls; }, { sleep, ...none });
  assert.strictEqual(result, 4);
  assert.deepStrictEqual(waits, [100, 200, 400]);
});

test("retry: rethrows the last error after retries are used up", async () => {
  const { waits, sleep } = recorder();
  let calls = 0;
  await assert.rejects(
    retry(async () => { throw new Error(`fail ${++calls}`); }, { retries: 2, sleep, ...none }),
    /fail 3/,
  );
  assert.strictEqual(calls, 3);
  assert.strictEqual(waits.length, 2);
});

test("retry: retries 0 means one attempt and no waiting", async () => {
  const { waits, sleep } = recorder();
  let calls = 0;
  await assert.rejects(retry(async () => { calls++; throw new Error("x"); }, { retries: 0, sleep }));
  assert.strictEqual(calls, 1);
  assert.deepStrictEqual(waits, []);
});

test("retry: the original error object is thrown, not a copy", async () => {
  const boom = new TypeError("boom");
  const { sleep } = recorder();
  await assert.rejects(retry(async () => { throw boom; }, { retries: 1, sleep }), (err) => err === boom);
});

test("retry: a synchronous throw is retried too", async () => {
  const { sleep } = recorder();
  let calls = 0;
  const result = await retry(() => { if (++calls < 2) throw new Error("sync"); return "fine"; }, { sleep });
  assert.strictEqual(result, "fine");
});

test("retry: shouldRetry can give up at once", async () => {
  const { waits, sleep } = recorder();
  let calls = 0;
  const fatal = Object.assign(new Error("400"), { permanent: true });
  await assert.rejects(
    retry(async () => { calls++; throw fatal; }, { sleep, shouldRetry: (e) => !e.permanent }),
    (err) => err === fatal,
  );
  assert.strictEqual(calls, 1);
  assert.deepStrictEqual(waits, []);
});

test("retry: shouldRetry sees the error and the attempt number", async () => {
  const { sleep } = recorder();
  const calls = [];
  await assert.rejects(retry(async () => { throw new Error("e"); }, {
    retries: 3, sleep, shouldRetry: (e, a) => { calls.push([e.message, a]); return a < 1; },
  }));
  assert.deepStrictEqual(calls, [["e", 0], ["e", 1]]);
});

test("retry: onRetry is told the error, attempt and wait", async () => {
  const { sleep } = recorder();
  const events = [];
  let calls = 0;
  await retry(async () => { if (++calls < 3) throw new Error(`n${calls}`); }, {
    sleep, ...none, onRetry: (e, a, ms) => events.push([e.message, a, ms]),
  });
  assert.deepStrictEqual(events, [["n1", 0, 100], ["n2", 1, 200]]);
});

test("retry: jitter options reach delay()", async () => {
  const { waits, sleep } = recorder();
  let calls = 0;
  await retry(async () => { if (++calls < 3) throw new Error("x"); }, {
    sleep, base: 1000, jitter: "full", random: () => 0.5,
  });
  assert.deepStrictEqual(waits, [500, 1000]);
});

test("retry: max caps the waits", async () => {
  const { waits, sleep } = recorder();
  await assert.rejects(retry(async () => { throw new Error("x"); }, { retries: 5, sleep, ...none, max: 300 }));
  assert.deepStrictEqual(waits, [100, 200, 300, 300, 300]);
});

test("retry: rejects invalid retries and bad delay options before calling fn", async () => {
  let called = false;
  const fn = async () => { called = true; };
  await assert.rejects(retry(fn, { retries: -1 }), RangeError);
  await assert.rejects(retry(fn, { retries: 1.5 }), RangeError);
  assert.strictEqual(called, false);
  await assert.rejects(
    retry(async () => { throw new Error("x"); }, { sleep: async () => {}, factor: 0 }),
    RangeError,
  );
});

test("retry: an already-aborted signal stops before the first attempt", async () => {
  const ctl = new AbortController();
  ctl.abort(new Error("cancelled"));
  let called = false;
  await assert.rejects(retry(async () => { called = true; }, { signal: ctl.signal }), /cancelled/);
  assert.strictEqual(called, false);
});

test("retry: aborting during a wait stops retrying", async () => {
  const ctl = new AbortController();
  let calls = 0;
  const promise = retry(async () => { calls++; throw new Error("always"); }, {
    signal: ctl.signal, ...none, base: 60000, max: 60000,
  });
  setTimeout(() => ctl.abort(new Error("stop now")), 20);
  await assert.rejects(promise, /stop now/);
  assert.strictEqual(calls, 1);
});

test("retry: the default sleep really waits", async () => {
  const start = Date.now();
  let calls = 0;
  await retry(async () => { if (++calls < 2) throw new Error("x"); }, { ...none, base: 60 });
  assert.ok(Date.now() - start >= 50, "waited roughly the base delay");
});

// ---- CLI -----------------------------------------------------------------

function run(...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test("cli: default schedule", () => {
  const r = run();
  assert.strictEqual(r.code, 0);
  const lines = r.out.trim().split("\n");
  assert.strictEqual(lines.length, 6);
  assert.match(lines[0], /^jitter full/);
  assert.strictEqual(lines[1], "retry 1: up to 100 ms (total up to 100 ms)");
  assert.strictEqual(lines[5], "retry 5: up to 1600 ms (total up to 3100 ms)");
});

test("cli: options", () => {
  const r = run("-n", "3", "-b", "10", "-f", "10", "-m", "500", "-j", "none");
  assert.strictEqual(r.code, 0);
  assert.match(r.out, /retry 1: up to 10 ms/);
  assert.match(r.out, /retry 2: up to 100 ms \(total up to 110 ms\)/);
  assert.match(r.out, /retry 3: up to 500 ms \(total up to 610 ms\)/);
  assert.match(r.out, /exactly the figure shown/);
});

test("cli: zero retries prints only the header", () => {
  const r = run("-n", "0");
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out.trim().split("\n").length, 1);
});

test("cli: invalid values exit 1 with a message", () => {
  for (const args of [["-f", "0.5"], ["-j", "wild"], ["-n", "1.5"], ["-n", "-1"], ["-n", "100000"], ["-b", "-5"]]) {
    const r = run(...args);
    assert.strictEqual(r.code, 1, args.join(" "));
    assert.match(r.err, /^backoff:/);
    assert.strictEqual(r.out, "");
  }
});

test("cli: usage errors exit 2", () => {
  for (const args of [["--bogus"], ["-n"], ["-n", "abc"], ["-b", ""], ["stray"]]) {
    assert.strictEqual(run(...args).code, 2, args.join(" "));
  }
});
