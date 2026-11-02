#!/usr/bin/env node
// Parse and format human durations: "1h30m" <-> 5400000 (milliseconds).
// Units are w, d, h, m (minutes), s and ms. Fractions are allowed
// ("1.5h"), a leading "-" makes it negative, and the result is rounded to
// whole milliseconds. No dependencies.

const UNITS = {
  w: 7 * 24 * 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  h: 60 * 60 * 1000,
  m: 60 * 1000,
  s: 1000,
  ms: 1,
};

// Largest first, which is the order format() prints them in.
const ORDER = ["w", "d", "h", "m", "s", "ms"];

const TERM = /^(\d+(?:\.\d+)?)\s*(ms|w|d|h|m|s)\s*/;

/**
 * Parses a duration string into whole milliseconds. Throws a TypeError for
 * input that isn't a duration and a RangeError if the value is too large
 * to hold exactly.
 */
function parse(text) {
  if (typeof text !== "string") throw new TypeError("duration must be a string");
  let rest = text.trim();
  let sign = 1;
  if (rest.startsWith("-")) {
    sign = -1;
    rest = rest.slice(1).trimStart();
  }
  if (rest === "") throw new TypeError(`not a duration: ${JSON.stringify(text)}`);

  const seen = new Set();
  let total = 0;
  while (rest !== "") {
    const match = TERM.exec(rest);
    if (match === null) throw new TypeError(`not a duration: ${JSON.stringify(text)}`);
    const unit = match[2];
    // "1h1h" is almost certainly a typo, and silently adding it up would
    // hide that.
    if (seen.has(unit)) throw new TypeError(`unit "${unit}" appears twice in ${JSON.stringify(text)}`);
    seen.add(unit);
    total += Number(match[1]) * UNITS[unit];
    rest = rest.slice(match[0].length);
  }

  const ms = Math.round(total);
  if (!Number.isSafeInteger(ms)) throw new RangeError(`duration is too large: ${JSON.stringify(text)}`);
  // Sign is applied after rounding so that -0.5ms and 0.5ms round the same way.
  return sign * ms || 0;
}

/**
 * Formats milliseconds as e.g. "1h 30m". `maxUnits` keeps only the largest
 * N non-zero units ("1d 2h 3m" with maxUnits 2 is "1d 2h"), truncating
 * rather than rounding.
 */
function format(ms, { maxUnits = Infinity } = {}) {
  if (!Number.isFinite(ms)) throw new TypeError("milliseconds must be a finite number");
  if (!(maxUnits >= 1)) throw new RangeError("maxUnits must be at least 1");
  let left = Math.round(Math.abs(ms));
  if (left === 0) return "0ms";

  const parts = [];
  for (const unit of ORDER) {
    const count = Math.floor(left / UNITS[unit]);
    left -= count * UNITS[unit];
    if (count > 0) parts.push(`${count}${unit}`);
  }
  const text = parts.slice(0, maxUnits).join(" ");
  return ms < 0 ? `-${text}` : text;
}

const USAGE = `usage: duration.js [-n MAXUNITS] DURATION      print milliseconds
       duration.js [-n MAXUNITS] -f MILLISECONDS  print a readable duration`;

function main(argv) {
  let reverse = false;
  let maxUnits = Infinity;
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "-f") reverse = true;
    else if (argv[i] === "-n") {
      maxUnits = Number(argv[++i]);
      if (!Number.isInteger(maxUnits) || maxUnits < 1) {
        console.error("duration: -n needs a whole number of at least 1");
        return 2;
      }
    } else args.push(argv[i]);
  }
  if (args.length !== 1) {
    console.error(USAGE);
    return 2;
  }
  try {
    if (reverse) {
      if (!/^-?\d+(\.\d+)?$/.test(args[0])) throw new TypeError(`not a number: ${JSON.stringify(args[0])}`);
      console.log(format(Number(args[0]), { maxUnits }));
    } else {
      console.log(String(parse(args[0])));
    }
    return 0;
  } catch (err) {
    if (err instanceof TypeError || err instanceof RangeError) {
      console.error(`duration: ${err.message}`);
      return 1;
    }
    throw err;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { parse, format };
