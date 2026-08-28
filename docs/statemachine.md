# statemachine.js

A small finite state machine: named states, named events that transition
between them, optional guards (conditional transitions) and enter/exit
hooks — the pattern behind order-processing pipelines, connection/session
lifecycles, UI wizards, anything with "valid next steps depend on where
you currently are."

## Why

Modeling a workflow as a pile of boolean flags and `if` chains lets
invalid states creep in silently (`isPaid && !isPending`... except what if
both got set?). A state machine makes "what can happen from here" an
explicit, checkable fact (`can()`) instead of something you have to trace
through conditionals to verify.

## Usage

```js
const { StateMachine } = require("./statemachine.js");

const order = new StateMachine(
  {
    initial: "pending",
    states: {
      pending: { on: { PAY: { target: "paid", guard: (ctx) => ctx.amount > 0 } } },
      paid: { on: { SHIP: "shipped" }, onEnter: (ctx) => console.log("payment received") },
      shipped: { onEnter: () => console.log("shipped to customer") },
    },
  },
  { amount: 49.99 } // context, shared across guards/hooks
);

order.send("PAY");  // true - guard passed, "payment received" logged
order.send("SHIP"); // true - "shipped to customer" logged
order.state;         // "shipped"
```

## Real example

```
$ node -e "
const { StateMachine } = require('./scripts/statemachine.js');
const order = new StateMachine({
  initial: 'pending',
  states: {
    pending: { on: { PAY: { target: 'paid', guard: (ctx) => ctx.amount > 0 } } },
    paid: { on: { SHIP: 'shipped' }, onEnter: () => console.log('payment received') },
    shipped: { onEnter: () => console.log('shipped to customer') },
  },
}, { amount: 0 });
console.log('PAY with amount=0:', order.send('PAY'), '- state:', order.state);
order.context.amount = 49.99;
console.log('PAY with amount=49.99:', order.send('PAY'), '- state:', order.state);
order.send('SHIP');
console.log('history:', order.history);
"
PAY with amount=0: false - state: pending
payment received
PAY with amount=49.99: true - state: paid
shipped to customer
history: [ 'pending', 'paid', 'shipped' ]
```

## API

- `new StateMachine({ initial, states }, context = {})` — `states` maps
  each state name to `{ on, onEnter?, onExit? }`. `on` maps event names to
  either a target state name directly, or `{ target, guard? }` where
  `guard(context)` must return truthy for the transition to proceed.
  `context` is arbitrary shared, mutable data passed to every guard/hook.
  Throws if `initial` isn't a key in `states`.
- `.state` — the current state name.
- `.context` — the shared context object (same reference passed in,
  mutate it directly from hooks/guards or from outside).
- `.history` — array of every state visited so far, including the initial
  one, oldest first. Returns a fresh copy each time — mutating the
  returned array doesn't affect the machine.
- `.can()` — array of event names accepted from the current state (guards
  aren't evaluated — this only reflects whether an event is *defined*
  here, not whether it would currently succeed).
- `.send(event)` — attempts the transition. Returns `true` and transitions
  (firing `onExit` on the old state, then `onEnter` on the new one) if the
  event is defined here and its guard (if any) passes. Returns `false`
  and leaves the state completely unchanged otherwise — for both "event
  not defined here" and "guard rejected it," so `send()` alone can't tell
  you which; use `can()` first if that distinction matters to the caller.

## Design notes

- `onEnter` is **not** called for the `initial` state at construction —
  only for states arrived at via `send()`. A machine that logs "entered
  state X" on every `onEnter` would otherwise double-log or misfire for
  whatever state it starts in, which usually isn't the caller's intent
  (the initial state is a starting condition, not a transition).
- `onExit` fires before `onEnter` around a single transition (verified
  directly in the tests) — matches the common "leave the old state fully,
  then arrive in the new one" ordering most state machine implementations
  use, rather than the reverse.
- A transition whose `target` isn't a key in `states` throws immediately
  rather than silently leaving the machine in a broken or `undefined`
  state — that's a configuration bug in the machine definition, not a
  runtime condition callers should have to handle.

## Running the tests

```
node --test tests/test_statemachine.js
```

13 tests: starting in the declared initial state, throwing on an unknown
initial state, a defined event transitioning and returning `true`, an
undefined event being a no-op returning `false`, a full cycle returning to
the start, `can()` listing accepted events, `history` recording every
state in order (including the initial one) and returning a mutation-safe
copy, `onEnter`/`onExit` firing in the correct order around a transition,
a failing guard blocking the transition and returning `false`, a passing
guard letting it through, context being shared and mutable across hooks,
and a transition targeting an undefined state throwing.
