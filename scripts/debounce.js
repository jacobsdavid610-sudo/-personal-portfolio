// debounce/throttle utilities. No dependencies, plain timers.

/**
 * Returns a debounced wrapper: only fires `fn` after `wait` ms have passed
 * with no new calls. Later calls reset the timer and replace the args used
 * for the eventual call.
 */
function debounce(fn, wait) {
  let timer = null;

  function debounced(...args) {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  }

  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}

/**
 * Returns a throttled wrapper: fires `fn` at most once per `wait` ms. The
 * first call in a window fires immediately (leading edge); calls that land
 * inside the cooldown window are dropped, not queued.
 */
function throttle(fn, wait) {
  let onCooldown = false;

  function throttled(...args) {
    if (onCooldown) return;
    onCooldown = true;
    fn(...args);
    setTimeout(() => {
      onCooldown = false;
    }, wait);
  }

  return throttled;
}

module.exports = { debounce, throttle };
