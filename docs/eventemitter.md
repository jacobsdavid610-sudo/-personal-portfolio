# eventemitter.js

A minimal pub/sub event emitter: `on`/`once`/`off`/`emit`, a wildcard `"*"`
listener that hears every event, and error isolation so one broken listener
can't take down its siblings.

## Usage

```js
const { EventEmitter } = require("./eventemitter.js");

const bus = new EventEmitter();
bus.on("user:login", (user) => console.log("welcome,", user));
bus.emit("user:login", "obinna");
```

## Real example

```
$ node -e "
const { EventEmitter } = require('./scripts/eventemitter.js');
const bus = new EventEmitter();
bus.on('user:login', (user) => console.log('welcome,', user));
bus.on('*', (event) => console.log('[log]', event));
bus.once('user:login', () => console.log('(first login bonus fired once)'));
bus.emit('user:login', 'obinna');
bus.emit('user:login', 'obinna');
"
welcome, obinna
(first login bonus fired once)
[log] user:login
welcome, obinna
[log] user:login
```

The `once()` bonus listener fires on the first login only; the regular
listener and the wildcard listener fire on every login.

## API

- `on(event, fn)` — register a listener. Returns `this`, so calls chain.
- `once(event, fn)` — register a listener that auto-removes itself after
  its first call.
- `off(event, fn?)` — remove one listener, or every listener for `event`
  if `fn` is omitted.
- `emit(event, ...args)` — call every listener registered for `event`
  (plus any `"*"` listeners, which receive `event` as their first
  argument). Returns `true` if at least one listener ran, `false`
  otherwise.
- `listenerCount(event)` — how many listeners are currently registered.

## Why a throwing listener doesn't stop the others

`emit()` calls listeners in a loop; without isolation, one listener
throwing would abort every listener registered after it in the same
`emit()` call, which turns an unrelated bug into a cascading failure for
code that has no idea it's sharing an event with the broken listener. So
`emit()` catches per-listener, records the error on `emitter.lastError`,
and forwards it to any `"error"` event listeners (with the source event
name as the second argument) instead of letting it interrupt the loop. An
`"error"` listener that itself throws is not re-forwarded — that would
recurse — so it's caught and dropped after being counted once.

## Exit codes

Not a CLI — it's a module (`module.exports = { EventEmitter }`), so no
process exit codes apply.

## Running the tests

```
node --test tests/test_eventemitter.js
```

13 tests: basic on/emit, multiple listeners firing in order, once()
auto-removal, off() with and without a specific fn, the wildcard listener
receiving every event with the event name prefixed, a throwing listener
not blocking its siblings, the error being forwarded to `"error"`
listeners with the source event name, an `"error"` listener itself
throwing not recursing, emit()'s return value, listenerCount() accuracy,
on()/once() chaining, and registering a non-function listener throwing a
TypeError.
