// A small finite state machine: named states, named transitions between
// them, optional guards and enter/exit hooks. No dependencies.

/**
 * @param {object} config
 * @param {string} config.initial - the starting state name.
 * @param {object} config.states - map of state name -> {
 *   on: { EVENT: targetState | { target, guard? } },
 *   onEnter?: (context) => void,
 *   onExit?: (context) => void,
 * }
 * @param {object} [context] - arbitrary user data passed to guards/hooks,
 *   and mutable across the machine's lifetime.
 */
class StateMachine {
  constructor({ initial, states }, context = {}) {
    if (!states || !states[initial]) {
      throw new Error(`Unknown initial state: ${initial}`);
    }
    this._states = states;
    this._current = initial;
    this._context = context;
    this._history = [initial];
  }

  get state() {
    return this._current;
  }

  get history() {
    return [...this._history];
  }

  get context() {
    return this._context;
  }

  /**
   * Returns the list of event names that would currently be accepted
   * (guards, if any, are not evaluated here - only presence is checked).
   */
  can() {
    const def = this._states[this._current];
    return Object.keys(def.on || {});
  }

  /**
   * Attempts to fire `event`. Returns true and transitions if the event
   * is defined for the current state and its guard (if any) passes;
   * returns false and leaves the state unchanged otherwise. Never throws
   * for an event that simply isn't accepted - use `can()` to check first
   * if the caller needs to distinguish "rejected by guard" from "not
   * defined here".
   */
  send(event) {
    const def = this._states[this._current];
    const transition = (def.on || {})[event];
    if (transition === undefined) return false;

    const target = typeof transition === "string" ? transition : transition.target;
    const guard = typeof transition === "string" ? undefined : transition.guard;

    if (guard && !guard(this._context)) return false;

    if (!this._states[target]) {
      throw new Error(`Transition "${event}" targets unknown state: ${target}`);
    }

    const fromDef = this._states[this._current];
    if (fromDef.onExit) fromDef.onExit(this._context);

    this._current = target;
    this._history.push(target);

    const toDef = this._states[target];
    if (toDef.onEnter) toDef.onEnter(this._context);

    return true;
  }
}

module.exports = { StateMachine };
