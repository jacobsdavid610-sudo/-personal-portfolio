# memoize.js

Function memoization: caches return values by argument key, with
optional TTL expiry and a size cap. Works for sync and async functions
alike, and for async functions specifically dedupes concurrent in-flight
calls. No dependencies.

## Usage

```js
const { memoize } = require("./memoize.js");

let calls = 0;
const slowSquare = memoize((n) => {
  calls++;
  return n * n;
});

slowSquare(5); // computes, calls === 1
slowSquare(5); // cached,   calls === 1
slowSquare(6); // different key, computes, calls === 2
```

```js
// Async: three concurrent calls for the same key only hit the network once.
const fetchUser = memoize((id) => fetch(`/users/${id}`).then((r) => r.json()));
const [a, b, c] = await Promise.all([fetchUser(1), fetchUser(1), fetchUser(1)]);
// exactly one request was made
```

- `memoize(fn, options)` — returns the memoized wrapper.
  - `ttl` (default `Infinity`) — ms a cached result stays valid.
  - `maxSize` (default `Infinity`) — cap on distinct cached keys; FIFO
    eviction by insertion order once exceeded, **not** LRU.
  - `resolver` (default `(...args) => JSON.stringify(args)`) — computes
    the cache key. The default breaks down for non-JSON-representable
    arguments (functions, symbols, circular objects) — pass your own
    for those.
  - `clock` (default `Date.now`) — injectable so TTL is testable
    without sleeping in real time.
- The returned function also exposes `.cache` (the underlying `Map`,
  for direct inspection) and `.clear()`.

## Real example

```
$ node -e "
const { memoize } = require('./scripts/memoize.js');
let calls = 0;
const fn = memoize((x) => { calls++; return x * 2; }, { ttl: 50 });
console.log(fn(5), fn(5), calls);   // 10 10 1 - second call is cached
setTimeout(() => console.log(fn(5), calls), 100); // 10 2 - ttl expired
"
10 10 1
10 2
```

## Design notes

- **For an async function, the cached value is the promise itself, not
  its eventually-resolved result.** That single choice is what gives
  concurrent-call deduplication for free: while the promise is pending,
  every call with the same key gets back that exact promise object and
  awaits it themselves, instead of each one calling `fn` again and
  racing to hit whatever's underneath. No separate "is this key
  currently in flight" bookkeeping needed — the Map entry already is
  that state, for however long the promise takes to settle.
- **A rejected promise is evicted immediately, not left cached for the
  full `ttl`.** Caching successes for `ttl` is the point, but caching a
  *failure* the same way means every caller gets handed the identical
  stale error until it expires, even though the underlying condition
  causing it may have already cleared. The rejection handler deletes the
  entry — but only if the cached value is still exactly this promise
  (`cache.get(key)?.value === value`), because a later call for the same
  key may already have replaced it with a fresh attempt; unconditionally
  deleting would nuke that newer entry instead. Covered directly by a
  regression test built around that exact race, not just the simpler
  "rejection gets evicted" case.
- **FIFO eviction, not LRU.** `lru_cache.py` already exists in this repo
  for when recency-of-access eviction is actually the point. Here the
  goal is just capping unbounded growth for a memoized function with a
  large or unbounded key space — insertion-order eviction via a `Map`
  needs no extra bookkeeping (`Map` already preserves insertion order),
  where true LRU would need to track access order too. Reusing
  `lru_cache.py`'s ring/dict machinery here would have bought eviction
  precision that doesn't matter for the target use case, at the cost of
  wiring a second module's internals into this one.
- **`JSON.stringify(args)` as the default key, with the limitation
  documented rather than solved.** It's exactly right for the common
  case (primitives, plain objects, arrays) and silently wrong for the
  cases it can't represent — so those cases get a documented escape
  hatch (`resolver`) instead of speculative handling for inputs this
  script has no real use case to test against.

## Running the tests

```
node --test tests/test_memoize.js
```

12 tests: sync calls with identical args being cached and different args
recomputing, the default resolver being order-sensitive, a custom
resolver keying on a chosen field, ttl expiry via an injected clock
(both the "still valid" and "expired" sides) plus ttl defaulting to
never expiring, concurrent async calls for the same key sharing exactly
one underlying invocation, a rejected call being evicted so the next
call actually retries instead of replaying the cached failure, a
regression case for the identity check that keeps one call's rejection
handler from deleting a *different*, still-pending call's cache entry
for the same key, FIFO eviction under `maxSize` and `maxSize` defaulting
to no eviction, and `clear()` emptying the cache and forcing
recomputation. All passing. Also ran it by hand covering sync caching,
ttl expiry via `setTimeout`, and the concurrent-dedupe case with a real
promise before committing.
