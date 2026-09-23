const test = require("node:test");
const assert = require("node:assert");
const { memoize } = require("../scripts/memoize.js");

function delay(ms, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

test("sync: same args return the cached value without recomputing", () => {
  let calls = 0;
  const add = memoize((a, b) => {
    calls++;
    return a + b;
  });

  assert.strictEqual(add(1, 2), 3);
  assert.strictEqual(add(1, 2), 3);
  assert.strictEqual(calls, 1);
});

test("sync: different args recompute and cache separately", () => {
  let calls = 0;
  const add = memoize((a, b) => {
    calls++;
    return a + b;
  });

  add(1, 2);
  add(2, 3);
  assert.strictEqual(calls, 2);
});

test("default resolver: key is order-sensitive across arguments", () => {
  let calls = 0;
  const fn = memoize((a, b) => {
    calls++;
    return [a, b];
  });

  fn(1, 2);
  fn(2, 1);
  assert.strictEqual(calls, 2);
});

test("custom resolver: keys by whatever the resolver returns", () => {
  let calls = 0;
  const fn = memoize(
    (obj) => {
      calls++;
      return obj.value * 2;
    },
    { resolver: (obj) => obj.id },
  );

  fn({ id: "a", value: 1 });
  fn({ id: "a", value: 999 }); // same id, different value - still a cache hit
  assert.strictEqual(calls, 1);
});

test("ttl: cached value expires and recomputes after the injected clock advances", () => {
  let now = 1000;
  let calls = 0;
  const fn = memoize(
    (x) => {
      calls++;
      return x * 2;
    },
    { ttl: 100, clock: () => now },
  );

  fn(5);
  fn(5);
  assert.strictEqual(calls, 1, "still within ttl");

  now += 200;
  fn(5);
  assert.strictEqual(calls, 2, "ttl elapsed, recomputed");
});

test("ttl: defaults to Infinity, never expiring", () => {
  let calls = 0;
  let now = 0;
  const fn = memoize(
    (x) => {
      calls++;
      return x;
    },
    { clock: () => now },
  );

  fn(1);
  now += 1e15;
  fn(1);
  assert.strictEqual(calls, 1);
});

test("async: concurrent calls with the same key share one in-flight promise", async () => {
  let calls = 0;
  const fn = memoize((x) => {
    calls++;
    return delay(20, x * 10);
  });

  const results = await Promise.all([fn(3), fn(3), fn(3)]);
  assert.deepStrictEqual(results, [30, 30, 30]);
  assert.strictEqual(calls, 1);
});

test("async: a rejected call is evicted immediately, not cached for the ttl", async () => {
  let calls = 0;
  const fn = memoize(
    async (x) => {
      calls++;
      if (calls === 1) throw new Error("boom");
      return x;
    },
    { ttl: 100000 },
  );

  await assert.rejects(fn("k"), /boom/);
  const result = await fn("k");
  assert.strictEqual(result, "k");
  assert.strictEqual(calls, 2, "retried after rejection instead of replaying the cached failure");
});

test("async: a later call for the same key while one is still pending isn't clobbered by the first one's rejection handler", async () => {
  // Regression guard for the identity check in the rejection handler:
  // if call #1 rejects and its handler deletes the cache slot
  // unconditionally, it would also delete call #2's still-pending entry.
  let resolveFirst;
  let n = 0;
  const fn = memoize((x) => {
    n++;
    if (n === 1) {
      return new Promise((_, reject) => {
        resolveFirst = reject;
      });
    }
    return delay(10, x);
  });

  const first = fn("k");
  first.catch(() => {}); // avoid an unhandled rejection warning
  resolveFirst(new Error("first call failed"));
  await delay(0); // let the rejection handler run

  const second = fn("k"); // new call, same key, fresh promise
  await delay(0);
  assert.strictEqual(await second, "k");
});

test("maxSize: exceeding the cap evicts the oldest key first (FIFO)", () => {
  const fn = memoize((x) => x, { maxSize: 2 });

  fn(1);
  fn(2);
  fn(3);

  assert.deepStrictEqual([...fn.cache.keys()], ["[2]", "[3]"]);
});

test("maxSize: default is Infinity, no eviction", () => {
  const fn = memoize((x) => x);
  for (let i = 0; i < 50; i++) fn(i);
  assert.strictEqual(fn.cache.size, 50);
});

test("clear: empties the cache and forces recomputation", () => {
  let calls = 0;
  const fn = memoize((x) => {
    calls++;
    return x;
  });

  fn(1);
  fn.clear();
  assert.strictEqual(fn.cache.size, 0);

  fn(1);
  assert.strictEqual(calls, 2);
});
