const test = require("node:test");
const assert = require("node:assert");
const { debounce, throttle } = require("../scripts/debounce.js");

test("debounce: only fires once after the trailing wait, with the last args", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const calls = [];
  const fn = debounce((x) => calls.push(x), 100);

  fn(1);
  t.mock.timers.tick(50);
  fn(2); // resets the timer
  t.mock.timers.tick(50);
  assert.deepStrictEqual(calls, []); // not yet, timer was reset at 50ms

  t.mock.timers.tick(50);
  assert.deepStrictEqual(calls, [2]);
});

test("debounce: rapid-fire calls collapse into a single trailing call", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const calls = [];
  const fn = debounce((x) => calls.push(x), 100);

  for (let i = 0; i < 5; i++) {
    fn(i);
    t.mock.timers.tick(10);
  }
  assert.deepStrictEqual(calls, []);

  t.mock.timers.tick(100);
  assert.deepStrictEqual(calls, [4]);
});

test("debounce: cancel() prevents the pending call from firing", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const calls = [];
  const fn = debounce((x) => calls.push(x), 100);

  fn(1);
  fn.cancel();
  t.mock.timers.tick(200);
  assert.deepStrictEqual(calls, []);
});

test("throttle: fires immediately on the leading call", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const calls = [];
  const fn = throttle((x) => calls.push(x), 100);

  fn("a");
  assert.deepStrictEqual(calls, ["a"]);
});

test("throttle: drops calls inside the cooldown window", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const calls = [];
  const fn = throttle((x) => calls.push(x), 100);

  fn("a");
  t.mock.timers.tick(50);
  fn("b"); // still inside cooldown, dropped
  t.mock.timers.tick(50);

  assert.deepStrictEqual(calls, ["a"]);
});

test("throttle: allows a new call once the cooldown has elapsed", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const calls = [];
  const fn = throttle((x) => calls.push(x), 100);

  fn("a");
  t.mock.timers.tick(100);
  fn("b");

  assert.deepStrictEqual(calls, ["a", "b"]);
});
