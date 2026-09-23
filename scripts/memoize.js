// Function memoization: caches return values by argument key, with
// optional TTL expiry and a size cap. Works for both sync and async
// functions - for an async function, the in-flight *promise* is what
// gets cached, so concurrent calls with the same key while it's still
// pending share that one promise instead of each triggering their own
// underlying call. No dependencies.

function defaultResolver(...args) {
  return JSON.stringify(args);
}

/**
 * @param {Function} fn - the function to memoize.
 * @param {object} [options]
 * @param {number} [options.ttl=Infinity] - ms a cached result stays valid.
 * @param {number} [options.maxSize=Infinity] - cap on distinct cached
 *   keys; FIFO eviction by insertion order once exceeded, not LRU.
 * @param {Function} [options.resolver] - (...args) => cache key string.
 *   Defaults to `JSON.stringify(args)`, which breaks down for arguments
 *   that aren't JSON-representable (functions, symbols, circular
 *   objects) - pass a resolver for those cases rather than relying on
 *   the default.
 * @param {Function} [options.clock=Date.now] - injectable so TTL is
 *   testable without sleeping in real time.
 */
function memoize(fn, options = {}) {
  const {
    ttl = Infinity,
    maxSize = Infinity,
    resolver = defaultResolver,
    clock = Date.now,
  } = options;

  const cache = new Map(); // key -> { value, expiresAt }

  function memoized(...args) {
    const key = resolver(...args);
    const now = clock();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const value = fn(...args);
    // Delete-then-set so a re-computed key moves to the back of the
    // Map's insertion order, keeping FIFO eviction meaningful for keys
    // that get recomputed after expiry rather than just newly-seen ones.
    cache.delete(key);
    cache.set(key, { value, expiresAt: now + ttl });

    if (value && typeof value.then === "function") {
      // A cached *rejection* would otherwise sit there for the full TTL,
      // handing every caller the same stale failure instead of letting
      // the next call retry. Evict on rejection only if this exact
      // promise is still the cached one - an intervening call with the
      // same key may have already replaced it.
      value.then(undefined, () => {
        if (cache.get(key)?.value === value) {
          cache.delete(key);
        }
      });
    }

    if (cache.size > maxSize) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }

    return value;
  }

  memoized.cache = cache;
  memoized.clear = () => cache.clear();

  return memoized;
}

module.exports = { memoize };
