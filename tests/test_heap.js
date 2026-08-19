const test = require("node:test");
const assert = require("node:assert");
const { MinHeap } = require("../scripts/heap.js");

test("push/pop returns values in ascending order", () => {
  const heap = new MinHeap();
  [5, 3, 8, 1, 9, 2].forEach((v) => heap.push(v));

  const popped = [];
  while (!heap.isEmpty()) popped.push(heap.pop());

  assert.deepStrictEqual(popped, [1, 2, 3, 5, 8, 9]);
});

test("peek returns the minimum without removing it", () => {
  const heap = new MinHeap();
  heap.push(4);
  heap.push(1);
  heap.push(7);

  assert.strictEqual(heap.peek(), 1);
  assert.strictEqual(heap.size, 3);
});

test("size tracks the number of elements", () => {
  const heap = new MinHeap();
  assert.strictEqual(heap.size, 0);
  heap.push(1);
  heap.push(2);
  assert.strictEqual(heap.size, 2);
  heap.pop();
  assert.strictEqual(heap.size, 1);
});

test("push returns the new size", () => {
  const heap = new MinHeap();
  assert.strictEqual(heap.push(10), 1);
  assert.strictEqual(heap.push(20), 2);
});

test("peek on an empty heap throws RangeError", () => {
  assert.throws(() => new MinHeap().peek(), RangeError);
});

test("pop on an empty heap throws RangeError", () => {
  assert.throws(() => new MinHeap().pop(), RangeError);
});

test("handles duplicate values correctly", () => {
  const heap = new MinHeap();
  [3, 1, 3, 1, 2].forEach((v) => heap.push(v));

  const popped = [];
  while (!heap.isEmpty()) popped.push(heap.pop());

  assert.deepStrictEqual(popped, [1, 1, 2, 3, 3]);
});

test("custom comparator: max-heap via inverted comparator", () => {
  const heap = new MinHeap((a, b) => b - a);
  [5, 3, 8, 1, 9].forEach((v) => heap.push(v));

  const popped = [];
  while (!heap.isEmpty()) popped.push(heap.pop());

  assert.deepStrictEqual(popped, [9, 8, 5, 3, 1]);
});

test("custom comparator: priority queue over objects", () => {
  const heap = new MinHeap((a, b) => a.priority - b.priority);
  heap.push({ task: "low", priority: 5 });
  heap.push({ task: "urgent", priority: 1 });
  heap.push({ task: "mid", priority: 3 });

  assert.strictEqual(heap.pop().task, "urgent");
  assert.strictEqual(heap.pop().task, "mid");
  assert.strictEqual(heap.pop().task, "low");
});

test("heapify builds a valid heap from an existing array in one pass", () => {
  const heap = MinHeap.heapify([9, 4, 7, 1, 8, 2, 6, 3, 5]);

  const popped = [];
  while (!heap.isEmpty()) popped.push(heap.pop());

  assert.deepStrictEqual(popped, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("toSortedArray drains a copy without mutating the original heap", () => {
  const heap = new MinHeap();
  [3, 1, 2].forEach((v) => heap.push(v));

  const sorted = heap.toSortedArray();

  assert.deepStrictEqual(sorted, [1, 2, 3]);
  assert.strictEqual(heap.size, 3);
  assert.strictEqual(heap.peek(), 1);
});

test("large random input still pops in fully sorted order", () => {
  const values = [];
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % 1000;
  };
  for (let i = 0; i < 500; i++) values.push(rand());

  const heap = new MinHeap();
  values.forEach((v) => heap.push(v));

  const popped = [];
  while (!heap.isEmpty()) popped.push(heap.pop());

  assert.deepStrictEqual(popped, [...values].sort((a, b) => a - b));
});
