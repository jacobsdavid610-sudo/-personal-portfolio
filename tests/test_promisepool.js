const test = require("node:test");
const assert = require("node:assert");
const { runPool } = require("../scripts/promisepool.js");

function delay(ms, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function trackingTask(value, ms, tracker) {
  return async () => {
    tracker.current++;
    tracker.max = Math.max(tracker.max, tracker.current);
    await delay(ms, value);
    tracker.current--;
    return value;
  };
}

test("results come back in task order, regardless of completion order", async () => {
  const tasks = [
    () => delay(30, "slow"),
    () => delay(5, "fast"),
    () => delay(15, "medium"),
  ];
  const results = await runPool(tasks, 3);
  assert.deepStrictEqual(results, ["slow", "fast", "medium"]);
});

test("never runs more than `concurrency` tasks at once", async () => {
  const tracker = { current: 0, max: 0 };
  const tasks = [1, 2, 3, 4, 5, 6].map((v) => trackingTask(v, 20, tracker));
  const results = await runPool(tasks, 2);
  assert.strictEqual(tracker.max, 2);
  assert.deepStrictEqual(results, [1, 2, 3, 4, 5, 6]);
});

test("concurrency higher than task count runs them all in parallel", async () => {
  const tracker = { current: 0, max: 0 };
  const tasks = [1, 2, 3].map((v) => trackingTask(v, 10, tracker));
  await runPool(tasks, 10);
  assert.strictEqual(tracker.max, 3);
});

test("empty task list resolves immediately with an empty array", async () => {
  const results = await runPool([], 4);
  assert.deepStrictEqual(results, []);
});

test("concurrency of 1 runs tasks strictly sequentially", async () => {
  const order = [];
  const tasks = [1, 2, 3].map((v) => async () => {
    order.push(`start-${v}`);
    await delay(5);
    order.push(`end-${v}`);
    return v;
  });
  await runPool(tasks, 1);
  assert.deepStrictEqual(order, [
    "start-1", "end-1",
    "start-2", "end-2",
    "start-3", "end-3",
  ]);
});

test("stopOnError (default): the first rejection rejects the whole pool", async () => {
  const tasks = [
    () => delay(5, "ok"),
    () => Promise.reject(new Error("boom")),
    () => delay(5, "ok2"),
  ];
  await assert.rejects(() => runPool(tasks, 3), /boom/);
});

test("stopOnError: false collects allSettled-style results for every task", async () => {
  const tasks = [
    () => delay(5, "ok"),
    () => Promise.reject(new Error("boom")),
    () => delay(5, "ok2"),
  ];
  const results = await runPool(tasks, 3, { stopOnError: false });
  assert.strictEqual(results[0].status, "fulfilled");
  assert.strictEqual(results[0].value, "ok");
  assert.strictEqual(results[1].status, "rejected");
  assert.strictEqual(results[1].reason.message, "boom");
  assert.strictEqual(results[2].status, "fulfilled");
  assert.strictEqual(results[2].value, "ok2");
});

test("a task that throws synchronously is treated the same as a rejection", async () => {
  const tasks = [
    () => {
      throw new Error("sync boom");
    },
  ];
  await assert.rejects(() => runPool(tasks, 1), /sync boom/);
});

test("concurrency less than 1 throws a RangeError", () => {
  assert.throws(() => runPool([() => Promise.resolve(1)], 0), RangeError);
});
