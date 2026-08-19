// Binary min-heap / priority queue. No dependencies.

/**
 * Array-backed binary min-heap. Defaults to comparing values directly with
 * `<`; pass a custom comparator(a, b) returning negative/zero/positive for
 * a max-heap or priority-object use (e.g. `(a, b) => a.priority - b.priority`).
 */
class MinHeap {
  constructor(comparator = (a, b) => (a < b ? -1 : a > b ? 1 : 0)) {
    this._data = [];
    this._cmp = comparator;
  }

  get size() {
    return this._data.length;
  }

  isEmpty() {
    return this._data.length === 0;
  }

  peek() {
    if (this.isEmpty()) throw new RangeError("peek() on an empty heap");
    return this._data[0];
  }

  push(value) {
    this._data.push(value);
    this._bubbleUp(this._data.length - 1);
    return this.size;
  }

  pop() {
    if (this.isEmpty()) throw new RangeError("pop() on an empty heap");
    const top = this._data[0];
    const last = this._data.pop();
    if (this._data.length > 0) {
      this._data[0] = last;
      this._bubbleDown(0);
    }
    return top;
  }

  toSortedArray() {
    const clone = new MinHeap(this._cmp);
    clone._data = this._data.slice();
    const out = [];
    while (!clone.isEmpty()) out.push(clone.pop());
    return out;
  }

  static heapify(values, comparator) {
    const heap = new MinHeap(comparator);
    heap._data = values.slice();
    for (let i = Math.floor(heap._data.length / 2) - 1; i >= 0; i--) {
      heap._bubbleDown(i);
    }
    return heap;
  }

  _bubbleUp(index) {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this._cmp(this._data[index], this._data[parent]) >= 0) break;
      this._swap(index, parent);
      index = parent;
    }
  }

  _bubbleDown(index) {
    const n = this._data.length;
    for (;;) {
      const left = index * 2 + 1;
      const right = index * 2 + 2;
      let smallest = index;
      if (left < n && this._cmp(this._data[left], this._data[smallest]) < 0) {
        smallest = left;
      }
      if (right < n && this._cmp(this._data[right], this._data[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === index) break;
      this._swap(index, smallest);
      index = smallest;
    }
  }

  _swap(i, j) {
    [this._data[i], this._data[j]] = [this._data[j], this._data[i]];
  }
}

module.exports = { MinHeap };
