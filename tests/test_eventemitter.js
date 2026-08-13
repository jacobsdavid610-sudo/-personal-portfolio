const test = require("node:test");
const assert = require("node:assert");
const { EventEmitter } = require("../scripts/eventemitter.js");

test("on: listener is called with the emitted args", () => {
  const ee = new EventEmitter();
  const calls = [];
  ee.on("greet", (name) => calls.push(name));

  ee.emit("greet", "world");

  assert.deepStrictEqual(calls, ["world"]);
});

test("on: multiple listeners for the same event all fire, in registration order", () => {
  const ee = new EventEmitter();
  const calls = [];
  ee.on("tick", () => calls.push("a"));
  ee.on("tick", () => calls.push("b"));

  ee.emit("tick");

  assert.deepStrictEqual(calls, ["a", "b"]);
});

test("once: fires exactly once, then is auto-removed", () => {
  const ee = new EventEmitter();
  const calls = [];
  ee.once("ping", () => calls.push("pong"));

  ee.emit("ping");
  ee.emit("ping");

  assert.deepStrictEqual(calls, ["pong"]);
  assert.strictEqual(ee.listenerCount("ping"), 0);
});

test("off: removing a specific listener leaves the others", () => {
  const ee = new EventEmitter();
  const calls = [];
  const a = () => calls.push("a");
  const b = () => calls.push("b");
  ee.on("tick", a);
  ee.on("tick", b);

  ee.off("tick", a);
  ee.emit("tick");

  assert.deepStrictEqual(calls, ["b"]);
});

test("off: no fn argument clears every listener for that event", () => {
  const ee = new EventEmitter();
  const calls = [];
  ee.on("tick", () => calls.push("a"));
  ee.on("tick", () => calls.push("b"));

  ee.off("tick");
  ee.emit("tick");

  assert.deepStrictEqual(calls, []);
});

test("wildcard '*' listener receives every event, prefixed with the event name", () => {
  const ee = new EventEmitter();
  const calls = [];
  ee.on("*", (event, ...args) => calls.push([event, ...args]));

  ee.emit("greet", "world");
  ee.emit("tick");

  assert.deepStrictEqual(calls, [
    ["greet", "world"],
    ["tick"],
  ]);
});

test("error isolation: a throwing listener does not stop its siblings", () => {
  const ee = new EventEmitter();
  const calls = [];
  ee.on("tick", () => {
    throw new Error("boom");
  });
  ee.on("tick", () => calls.push("still ran"));

  ee.emit("tick");

  assert.deepStrictEqual(calls, ["still ran"]);
  assert.strictEqual(ee.lastError.message, "boom");
});

test("error isolation: the error is forwarded to 'error' listeners with the source event name", () => {
  const ee = new EventEmitter();
  const errors = [];
  ee.on("error", (err, sourceEvent) => errors.push([err.message, sourceEvent]));
  ee.on("tick", () => {
    throw new Error("boom");
  });

  ee.emit("tick");

  assert.deepStrictEqual(errors, [["boom", "tick"]]);
});

test("error isolation: an 'error' listener itself throwing does not recurse infinitely", () => {
  const ee = new EventEmitter();
  let errorListenerCalls = 0;
  ee.on("error", () => {
    errorListenerCalls++;
    throw new Error("error handler also broken");
  });
  ee.on("tick", () => {
    throw new Error("boom");
  });

  ee.emit("tick");

  assert.strictEqual(errorListenerCalls, 1);
});

test("emit: returns false when nothing handled the event, true when something did", () => {
  const ee = new EventEmitter();
  assert.strictEqual(ee.emit("unheard"), false);

  ee.on("heard", () => {});
  assert.strictEqual(ee.emit("heard"), true);
});

test("listenerCount: reflects on/off/once accurately", () => {
  const ee = new EventEmitter();
  assert.strictEqual(ee.listenerCount("tick"), 0);

  ee.on("tick", () => {});
  ee.once("tick", () => {});
  assert.strictEqual(ee.listenerCount("tick"), 2);

  ee.emit("tick");
  assert.strictEqual(ee.listenerCount("tick"), 1); // the once() listener is gone
});

test("on/once return the emitter itself, so calls can be chained", () => {
  const ee = new EventEmitter();
  const result = ee.on("a", () => {}).once("b", () => {}).off("a");

  assert.strictEqual(result, ee);
});

test("registering a non-function listener throws a TypeError", () => {
  const ee = new EventEmitter();
  assert.throws(() => ee.on("tick", "not a function"), TypeError);
});
