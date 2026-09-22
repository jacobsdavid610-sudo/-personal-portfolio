# ringbuffer.py

Fixed-capacity circular buffer: push is O(1) and never grows the
underlying storage, and once full each push silently overwrites the
oldest item. Pure stdlib, no dependencies.

## Why

"Keep the last N of these" turns up everywhere — the last N log lines
for a debug dump, a rolling window of recent request latencies, a fixed
scrollback for a terminal-like widget. The naive approach, a plain list
with `append` + `list = list[-N:]` (or `del list[0]`) on overflow, does
the job but is O(n) per trim once you're at capacity, because slicing
or deleting from the front of a Python list re-copies the rest. That's
invisible at N=10, but for a high-throughput rolling window it means
the "keep the last N" bookkeeping costs more than whatever you're
actually doing with the data. A circular buffer keeps one fixed-size
list and moves a start pointer instead of moving the data — push stays
O(1) forever, full or not.

## API

```python
from ringbuffer import RingBuffer

r = RingBuffer(3)
r.push("a"); r.push("b"); r.push("c")
list(r)          # ["a", "b", "c"]
r.is_full         # True
r.push("d")       # buffer is full - overwrites the oldest ("a")
list(r)           # ["b", "c", "d"]
r[0]               # "b" - oldest
r[-1]              # "d" - newest
len(r)             # 3
r.clear()
list(r)            # []
```

- `RingBuffer(capacity)` — raises `ValueError` if `capacity <= 0`.
- `push(item)` — O(1) always. Appends while there's room; once full,
  overwrites the oldest item and advances the logical start.
- `is_full` — whether the next `push` will overwrite something.
- `len(r)` — current item count (`<= capacity`, not `capacity` until
  it's actually full).
- `r[i]` — logical index, oldest-to-newest, with Python-style negative
  indices counting back from the newest. Raises `IndexError` out of
  range, same as a list.
- `iter(r)` — oldest to newest.
- `clear()` — empties the buffer and drops references to its old
  contents (doesn't just reset the count).

## CLI usage

```
ringbuffer.py <file | -> [--capacity N] [--stats]
```

Reads one item per line, keeps only the last `N` (default 10) via the
ring buffer, then prints them in order — effectively `tail -n N`
reimplemented on top of `RingBuffer` rather than shelling out to `tail`.
`--stats` prints count/capacity/full instead.

## Real example

```
$ seq 1 100000 | ringbuffer.py - --capacity 3
99998
99999
100000
```

100,000 pushes, only 3 ever held in memory at once, each push O(1)
regardless of how many came before it.

```
$ ringbuffer.py access.log --capacity 5 --stats
count: 5
capacity: 5
full: yes
```

## Design notes

- **One fixed-size list plus a `start` index, not append-and-trim.**
  `_buf[(self._start + i) % self.capacity]` for logical index `i` is
  the entire trick: physical position wraps, logical order doesn't.
  Overflow becomes "write one slot, advance `start` by one" instead of
  "shift everything down by one."
- **Negative indexing implemented explicitly, not inherited for free.**
  `__getitem__` isn't proxying to a real list, so `r[-1]` has to be
  handled by hand (`index += self._count` when negative) to behave like
  the list indexing people expect, rather than silently wrapping into
  someone else's slot via a bare modulo on a negative number.
- **`clear()` reassigns `_buf` to a fresh `[None] * capacity`, not just
  `_count = 0`.** Only resetting the count would leave every slot still
  pointing at its last item — cheap to write, but it quietly keeps
  arbitrarily large objects reachable (and therefore un-garbage-
  collected) through a buffer that looks empty from the outside. Pinned
  directly in the tests by checking `_buf` itself, not just `len()`.
- **`is_full` as a property, not a stored flag.** `count == capacity` is
  cheap enough to recompute on every access, so there's no second piece
  of state that could drift out of sync with `count`.

## Exit codes

`0` on success, `2` if `--capacity` is not a positive integer.

## Running the tests

```
python -m unittest tests.test_ringbuffer -v
```

16 tests: non-positive capacity rejected, a new buffer empty and not
full, partial fills keeping order without being "full," exactly-at-
capacity being full, overwrite-the-oldest on overflow, wrapping past
the physical end *multiple* times staying correct (not just the first
wrap), capacity-1 always holding just the latest push, positive and
negative indexing (including both ends of the valid range and one step
past each), an empty buffer raising `IndexError` on any index, `clear()`
emptying the buffer, `clear()` actually nulling out the internal slots
rather than just zeroing the count, and the buffer being fully usable
for more pushes after a clear. All passing. Also ran the CLI by hand
over a scratch file and piped stdin, in both default and `--stats`
modes, against a small `seq` stream to sanity-check the `tail -n`-style
real example above, and checked the exit code for a non-positive
`--capacity` before committing.
