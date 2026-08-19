# heap.js

An array-backed binary min-heap / priority queue: `push`/`pop`/`peek` all
run in `O(log n)` (`O(1)` for `peek`), plus a linear-time `heapify` for
building a heap from an existing array in one pass instead of `n` pushes.

## Usage

```js
const { MinHeap } = require("./heap.js");

const heap = new MinHeap();
[5, 1, 3].forEach((v) => heap.push(v));
heap.pop(); // 1
```

## Real example

```
$ node -e "
const { MinHeap } = require('./scripts/heap.js');
const heap = new MinHeap((a, b) => a.priority - b.priority);
heap.push({ task: 'write report', priority: 3 });
heap.push({ task: 'fix outage', priority: 1 });
heap.push({ task: 'reply to email', priority: 5 });
heap.push({ task: 'review PR', priority: 2 });
console.log('Processing order:');
while (!heap.isEmpty()) {
  const job = heap.pop();
  console.log(\` [\${job.priority}] \${job.task}\`);
}
"
Processing order:
 [1] fix outage
 [2] review PR
 [3] write report
 [5] reply to email
```

## API

- `new MinHeap(comparator?)` — `comparator(a, b)` returns negative/zero/
  positive, same contract as `Array.prototype.sort`. Defaults to a plain
  `<`/`>` comparison. Pass `(a, b) => b - a` for a max-heap, or compare a
  field (as above) to use the heap as a priority queue over objects.
- `push(value)` — insert a value, returns the new size.
- `pop()` — remove and return the minimum. Throws `RangeError` if empty.
- `peek()` — return the minimum without removing it. Throws `RangeError`
  if empty.
- `size` — current element count (getter).
- `isEmpty()` — `size === 0`.
- `toSortedArray()` — drains a *copy* of the heap into a fully sorted
  array; the original heap is left untouched.
- `MinHeap.heapify(values, comparator?)` (static) — builds a heap from an
  existing array in `O(n)`, rather than `O(n log n)` from `n` individual
  `push()` calls.

## Exit codes

Not a CLI — it's a module (`module.exports = { MinHeap }`), so no process
exit codes apply.

## Design notes

- `heapify` uses the standard bottom-up "sift down from the last parent"
  construction, which is `O(n)` overall (not `O(n log n)`) because most
  nodes are near the leaves and sift down only a short distance — a
  property that's easy to get wrong by assuming every node costs
  `O(log n)`.
- `toSortedArray()` operates on a shallow copy of the internal array so
  that "peek at what order this would drain in" doesn't require destroying
  the heap to find out.

## Running the tests

```
node --test tests/test_heap.js
```

12 tests: ascending pop order, peek without removal, size tracking,
push's return value, both `peek()`/`pop()` throwing `RangeError` on an
empty heap, duplicate values, a custom max-heap comparator, a priority
queue over objects, `heapify` producing a correctly-ordered heap from an
unsorted array, `toSortedArray()` not mutating the original, and a
500-element randomized input checked against `Array.prototype.sort`.
