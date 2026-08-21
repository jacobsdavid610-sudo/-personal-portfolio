# promisepool.js

Runs an array of async tasks with a concurrency cap — "start these 200
downloads, but no more than 5 at once" — and resolves with results in the
original task order regardless of which finished first.

## Why

`Promise.all` runs everything at once (fine for a handful of tasks, a good
way to get rate-limited or exhaust file descriptors for hundreds), and
running tasks one at a time throws away all the parallelism you're allowed.
This fills the actual gap: bounded parallelism, with the two failure modes
(`Promise.all`'s fail-fast vs `Promise.allSettled`'s always-collect) both
available via one option.

## Usage

```js
const { runPool } = require("./promisepool.js");

const tasks = urls.map((url) => () => fetch(url));
const results = await runPool(tasks, 5); // at most 5 in flight at once
```

## Real example

```
$ node -e "
const { runPool } = require('./scripts/promisepool.js');
const urls = ['a', 'b', 'c', 'd', 'e', 'f'];
let active = 0, maxActive = 0;
const tasks = urls.map((u) => async () => {
  active++; maxActive = Math.max(maxActive, active);
  await new Promise((r) => setTimeout(r, 50 + Math.random() * 50));
  active--;
  return u.toUpperCase();
});
runPool(tasks, 2).then((results) => {
  console.log('results:', results);
  console.log('max concurrent:', maxActive);
});
"
results: [ 'A', 'B', 'C', 'D', 'E', 'F' ]
max concurrent: 2
```

Six tasks, cap of 2 — never more than 2 ran at once, and the results array
still comes back in `a, b, c, d, e, f` order even though they finish in a
randomized order.

## API

- `runPool(tasks, concurrency, options?)` — `tasks` is an array of
  zero-argument functions that each return a promise (called lazily, not
  eagerly — a task function only runs once the pool has a free slot for
  it). Returns a promise for an array of results, same length and order as
  `tasks`.
- `options.stopOnError` (default `true`) — `true`: the first rejection
  rejects the whole pool immediately (tasks already in flight keep running
  in the background, but their results are discarded). `false`: every task
  runs to completion regardless of failures, and each result becomes
  `{ status: "fulfilled", value }` or `{ status: "rejected", reason }` —
  the same shape `Promise.allSettled` uses.
- Throws `RangeError` synchronously if `concurrency < 1`.

## Exit codes

Not a CLI — it's a module (`module.exports = { runPool }`), so no process
exit codes apply.

## Design notes

- A task is only invoked once a slot frees up, not all at once upfront —
  `tasks.map(url => () => fetch(url))` builds *functions*, so nothing
  starts running until `runPool` calls it. Passing already-started promises
  instead would defeat the whole point of a concurrency cap.
- Results land in `results[i]` by original index, not push order — so the
  pool can be handed straight to code that assumes `results[i]` corresponds
  to `tasks[i]`, the same contract as `Promise.all`.
- A synchronously-thrown error inside a task is treated identically to a
  rejected promise (`Promise.resolve().then(() => tasks[i]())` normalizes
  both into the same rejection path).

## Running the tests

```
node --test tests/test_promisepool.js
```

9 tests: result ordering independent of completion order, the concurrency
cap actually never being exceeded (tracked via a live counter, not just
inferred from timing), concurrency higher than the task count running
everything in parallel, an empty task list resolving immediately,
concurrency of 1 running strictly sequentially, default fail-fast
behavior on the first rejection, `stopOnError: false` collecting
`allSettled`-style results for every task, a synchronous throw inside a
task being treated as a rejection, and `concurrency < 1` throwing a
`RangeError`.
