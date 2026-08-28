const test = require("node:test");
const assert = require("node:assert");
const { StateMachine } = require("../scripts/statemachine.js");

function trafficLight() {
  return new StateMachine({
    initial: "red",
    states: {
      red: { on: { NEXT: "green" } },
      green: { on: { NEXT: "yellow" } },
      yellow: { on: { NEXT: "red" } },
    },
  });
}

test("starts in the declared initial state", () => {
  const m = trafficLight();
  assert.strictEqual(m.state, "red");
});

test("throws if the initial state isn't defined in states", () => {
  assert.throws(
    () => new StateMachine({ initial: "nope", states: { red: { on: {} } } }),
    /Unknown initial state/
  );
});

test("send() transitions on a defined event and returns true", () => {
  const m = trafficLight();
  const result = m.send("NEXT");
  assert.strictEqual(result, true);
  assert.strictEqual(m.state, "green");
});

test("send() with an undefined event for the current state is a no-op returning false", () => {
  const m = trafficLight();
  const result = m.send("BOGUS_EVENT");
  assert.strictEqual(result, false);
  assert.strictEqual(m.state, "red");
});

test("a full cycle returns to the starting state", () => {
  const m = trafficLight();
  m.send("NEXT"); // red -> green
  m.send("NEXT"); // green -> yellow
  m.send("NEXT"); // yellow -> red
  assert.strictEqual(m.state, "red");
});

test("can() lists the events accepted from the current state", () => {
  const m = trafficLight();
  assert.deepStrictEqual(m.can(), ["NEXT"]);
});

test("history records every state visited, in order, including the initial one", () => {
  const m = trafficLight();
  m.send("NEXT");
  m.send("NEXT");
  assert.deepStrictEqual(m.history, ["red", "green", "yellow"]);
});

test("history is a copy - mutating it does not affect the machine", () => {
  const m = trafficLight();
  const h = m.history;
  h.push("intruder");
  assert.deepStrictEqual(m.history, ["red"]);
});

test("onEnter and onExit hooks fire in the correct order around a transition", () => {
  const calls = [];
  const m = new StateMachine({
    initial: "a",
    states: {
      a: { on: { GO: "b" }, onExit: () => calls.push("exit-a") },
      b: { onEnter: () => calls.push("enter-b") },
    },
  });
  m.send("GO");
  assert.deepStrictEqual(calls, ["exit-a", "enter-b"]);
});

test("a guard blocking the transition leaves the state unchanged and returns false", () => {
  const context = { canProceed: false };
  const m = new StateMachine(
    {
      initial: "locked",
      states: {
        locked: { on: { UNLOCK: { target: "open", guard: (ctx) => ctx.canProceed } } },
        open: {},
      },
    },
    context
  );
  const result = m.send("UNLOCK");
  assert.strictEqual(result, false);
  assert.strictEqual(m.state, "locked");
});

test("a guard that passes allows the transition through", () => {
  const context = { canProceed: true };
  const m = new StateMachine(
    {
      initial: "locked",
      states: {
        locked: { on: { UNLOCK: { target: "open", guard: (ctx) => ctx.canProceed } } },
        open: {},
      },
    },
    context
  );
  assert.strictEqual(m.send("UNLOCK"), true);
  assert.strictEqual(m.state, "open");
});

test("context is shared and mutable across hooks and guards", () => {
  const context = { count: 0 };
  const m = new StateMachine(
    {
      initial: "idle",
      states: {
        idle: { on: { TICK: "idle" }, onEnter: (ctx) => { ctx.count++; } },
      },
    },
    context
  );
  m.send("TICK");
  m.send("TICK");
  assert.strictEqual(m.context.count, 2);
});

test("a transition targeting an undefined state throws", () => {
  const m = new StateMachine({
    initial: "a",
    states: { a: { on: { GO: "nowhere" } } },
  });
  assert.throws(() => m.send("GO"), /unknown state: nowhere/);
});
