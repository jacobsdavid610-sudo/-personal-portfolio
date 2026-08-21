// Run a batch of async tasks with a concurrency limit. No dependencies.

/**
 * Runs `tasks` (an array of zero-arg functions returning promises) with at
 * most `concurrency` running at once. Resolves with an array of results in
 * the same order as `tasks`, once every task has settled.
 *
 * By default the first rejection rejects the whole pool immediately
 * (already-running tasks finish in the background but their results are
 * discarded). Pass `{ stopOnError: false }` to instead let every task run
 * to completion and collect `{ status, value|reason }` entries, same shape
 * as `Promise.allSettled`.
 */
function runPool(tasks, concurrency, options = {}) {
  const { stopOnError = true } = options;

  if (concurrency < 1) {
    throw new RangeError("concurrency must be at least 1");
  }

  return new Promise((resolve, reject) => {
    if (tasks.length === 0) {
      resolve([]);
      return;
    }

    const results = new Array(tasks.length);
    let nextIndex = 0;
    let completed = 0;
    let rejected = false;

    const runNext = () => {
      if (rejected) return;
      const i = nextIndex++;
      if (i >= tasks.length) return;

      Promise.resolve()
        .then(() => tasks[i]())
        .then(
          (value) => {
            if (rejected) return;
            results[i] = stopOnError ? value : { status: "fulfilled", value };
            completed++;
            if (completed === tasks.length) {
              resolve(results);
            } else {
              runNext();
            }
          },
          (reason) => {
            if (rejected) return;
            if (stopOnError) {
              rejected = true;
              reject(reason);
              return;
            }
            results[i] = { status: "rejected", reason };
            completed++;
            if (completed === tasks.length) {
              resolve(results);
            } else {
              runNext();
            }
          }
        );
    };

    const initial = Math.min(concurrency, tasks.length);
    for (let k = 0; k < initial; k++) runNext();
  });
}

module.exports = { runPool };
