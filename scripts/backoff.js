#!/usr/bin/env node
// Exponential backoff with jitter: compute retry delays, run an async
// function with retries, or print the schedule a set of parameters gives.
// The random source and the sleep are injectable so it can be tested
// without waiting. No dependencies.

const JITTER = ["none", "full", "equal"];

function checkNumber(name, value, min) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min) {
    throw new RangeError(`${name} must be a finite number >= ${min}`);
  }
}

function checkOptions({ base, factor, max, jitter }) {
  checkNumber("base", base, 0);
  checkNumber("factor", factor, 1);
  checkNumber("max", max, 0);
  if (!JITTER.includes(jitter)) throw new RangeError(`jitter must be one of ${JITTER.join(", ")}`);
}

/**
 * Delay in whole milliseconds before retry number `attempt` (0 is the wait
 * after the first failure). The un-jittered delay is base * factor^attempt,
 * capped at `max`; jitter then spreads it:
 *   none  - exactly the capped value
 *   full  - uniform in [0, capped]
 *   equal - half the capped value plus uniform in [0, half]
 */
function delay(attempt, options = {}) {
  const { base = 100, factor = 2, max = 30000, jitter = "full", random = Math.random } = options;
  if (!Number.isInteger(attempt) || attempt < 0) throw new RangeError("attempt must be a whole number >= 0");
  checkOptions({ base, factor, max, jitter });
  // factor ** attempt overflows to Infinity for large attempts; min() with
  // max still gives max, so no special case is needed.
  const capped = Math.min(max, base * factor ** attempt);
  if (jitter === "none") return Math.round(capped);
  const r = random();
  if (!(r >= 0 && r < 1)) throw new RangeError("random() must return a number in [0, 1)");
  return Math.round(jitter === "full" ? r * capped : capped / 2 + r * (capped / 2));
}

function defaultSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Calls `fn(attempt)` until it resolves, retrying when it throws or rejects.
 * Makes at most `retries + 1` calls and rethrows the last error. Options:
 *   retries      - extra attempts after the first (default 5)
 *   shouldRetry  - (error, attempt) => boolean; return false to give up now
 *   onRetry      - (error, attempt, delayMs) called before each wait
 *   signal       - AbortSignal; aborting stops the wait and rejects with its reason
 *   sleep        - (ms, signal) => Promise, replaceable for tests
 * plus the delay() options (base, factor, max, jitter, random).
 */
async function retry(fn, options = {}) {
  const { retries = 5, shouldRetry = () => true, onRetry, signal, sleep = defaultSleep, ...delayOptions } = options;
  if (!Number.isInteger(retries) || retries < 0) throw new RangeError("retries must be a whole number >= 0");
  for (let attempt = 0; ; attempt++) {
    if (signal && signal.aborted) throw signal.reason;
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err, attempt)) throw err;
      const wait = delay(attempt, delayOptions);
      if (onRetry) onRetry(err, attempt, wait);
      await sleep(wait, signal);
    }
  }
}

/** The worst-case (no jitter) schedule: each delay and the running total. */
function schedule(count, options = {}) {
  let total = 0;
  const rows = [];
  for (let i = 0; i < count; i++) {
    const ms = delay(i, { ...options, jitter: "none" });
    total += ms;
    rows.push({ attempt: i, delay: ms, total });
  }
  return rows;
}

const USAGE = `usage: backoff.js [-n RETRIES] [-b BASE_MS] [-f FACTOR] [-m MAX_MS] [-j none|full|equal]
prints the worst-case delay before each retry and the running total`;

function main(argv) {
  const opts = { n: 5, base: 100, factor: 2, max: 30000, jitter: "full" };
  const flags = { "-n": "n", "-b": "base", "-f": "factor", "-m": "max" };
  for (let i = 0; i < argv.length; i++) {
    const key = flags[argv[i]];
    if (key !== undefined) {
      const text = argv[++i];
      if (text === undefined || text.trim() === "" || !Number.isFinite(Number(text))) {
        console.error(USAGE);
        return 2;
      }
      opts[key] = Number(text);
    } else if (argv[i] === "-j") {
      opts.jitter = argv[++i];
    } else {
      console.error(USAGE);
      return 2;
    }
  }
  try {
    if (!Number.isInteger(opts.n) || opts.n < 0) throw new RangeError("retries must be a whole number >= 0");
    checkOptions(opts);
    const rows = schedule(opts.n, opts);
    console.log(`jitter ${opts.jitter}: each wait is ${describe(opts.jitter)}`);
    for (const row of rows) {
      console.log(`retry ${row.attempt + 1}: up to ${row.delay} ms (total up to ${row.total} ms)`);
    }
    return 0;
  } catch (err) {
    if (err instanceof RangeError) {
      console.error(`backoff: ${err.message}`);
      return 1;
    }
    throw err;
  }
}

function describe(jitter) {
  if (jitter === "none") return "exactly the figure shown";
  if (jitter === "full") return "random between 0 and the figure shown";
  return "random between half the figure shown and the figure";
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { delay, retry, schedule };
