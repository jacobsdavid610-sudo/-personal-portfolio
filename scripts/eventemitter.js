// Minimal pub/sub event emitter. No dependencies.

/**
 * on/once/off/emit event emitter with a wildcard ("*") listener and error
 * isolation: a listener that throws does not stop its siblings from running
 * in the same emit() call.
 */
class EventEmitter {
  constructor() {
    this._listeners = new Map(); // event -> Set of {fn, once}
    this.lastError = null;
  }

  on(event, fn) {
    this._add(event, fn, false);
    return this;
  }

  once(event, fn) {
    this._add(event, fn, true);
    return this;
  }

  off(event, fn) {
    const set = this._listeners.get(event);
    if (!set) return this;
    if (fn === undefined) {
      set.clear();
    } else {
      for (const entry of set) {
        if (entry.fn === fn) set.delete(entry);
      }
    }
    return this;
  }

  emit(event, ...args) {
    let handled = false;
    const targets = event === "*" ? [event] : [event, "*"];

    for (const targetEvent of targets) {
      const set = this._listeners.get(targetEvent);
      if (!set || set.size === 0) continue;

      // Snapshot before iterating: a listener may call off()/once() mid-emit.
      for (const entry of Array.from(set)) {
        handled = true;
        if (entry.once) set.delete(entry);
        const callArgs = targetEvent === "*" ? [event, ...args] : args;
        try {
          entry.fn(...callArgs);
        } catch (err) {
          this.lastError = err;
          // Forward to 'error' listeners instead of stopping the emit loop.
          // Guard against an 'error' listener itself throwing recursively.
          if (event !== "error") {
            this.emit("error", err, event);
          }
        }
      }
    }

    return handled;
  }

  listenerCount(event) {
    const set = this._listeners.get(event);
    return set ? set.size : 0;
  }

  _add(event, fn, once) {
    if (typeof fn !== "function") {
      throw new TypeError("listener must be a function");
    }
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add({ fn, once });
  }
}

module.exports = { EventEmitter };
