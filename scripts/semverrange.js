#!/usr/bin/env node
"use strict";
// npm-style semver ranges: does 1.4.2 satisfy "^1.2.3 || >=3 <4"? Handles
// comparators (> >= < <= =), caret, tilde, x-ranges (1.x, 1.2.*), hyphen
// ranges ("1.2 - 2.3") and "||". Prerelease versions only match a range that
// names a prerelease of the same major.minor.patch, as in npm. No dependencies.

const USAGE = `usage: semverrange.js [--max | --min | --normalize] RANGE [VERSION...]

Prints the VERSIONs that satisfy RANGE, one per line.
  --max        print only the highest matching version
  --min        print only the lowest matching version
  --normalize  print RANGE in its expanded form (no versions needed)
Exit 0 if something was printed, 1 if nothing matched or RANGE is invalid,
2 for a usage error.`;

class BadRange extends Error {}

const NUM = "0|[1-9]\\d*";
const VERSION_RE = new RegExp(
  `^v?(${NUM})\\.(${NUM})\\.(${NUM})(?:-([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`
);
const X = "x|X|\\*";
const PARTIAL_RE = new RegExp(
  `^(\\^|~|>=|<=|>|<|=)?v?(${X}|${NUM})(?:\\.(${X}|${NUM})(?:\\.(${X}|${NUM})(?:-([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?)?)?$`
);

function parse(text) {
  if (typeof text !== "string") return null;
  const m = VERSION_RE.exec(text.trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split(".") : [] };
}

function cmpIdent(a, b) {
  const an = /^\d+$/.test(a);
  const bn = /^\d+$/.test(b);
  if (an && bn) return Math.sign(Number(a) - Number(b));
  if (an) return -1;
  if (bn) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

// Version precedence (semver 2.0 section 11); build metadata is not compared.
function compareParsed(a, b) {
  for (const k of ["major", "minor", "patch"]) {
    if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  }
  if (!a.pre.length && !b.pre.length) return 0;
  if (!a.pre.length) return 1;
  if (!b.pre.length) return -1;
  for (let i = 0; i < Math.min(a.pre.length, b.pre.length); i++) {
    const c = cmpIdent(a.pre[i], b.pre[i]);
    if (c) return c;
  }
  return Math.sign(a.pre.length - b.pre.length);
}

function compare(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa) throw new TypeError(`invalid version: ${a}`);
  if (!pb) throw new TypeError(`invalid version: ${b}`);
  return compareParsed(pa, pb);
}

const V = (major, minor, patch, pre = []) => ({ major, minor, patch, pre });
const lt = (M, m, p) => ({ op: "<", v: V(M, m, p, ["0"]) }); // "below every prerelease of M.m.p"
const ge = (M, m, p, pre) => ({ op: ">=", v: V(M, m, p, pre) });
const ANY = () => [ge(0, 0, 0)];
const NONE = () => [lt(0, 0, 0)];

function partial(token) {
  const m = PARTIAL_RE.exec(token);
  if (!m) throw new BadRange(`invalid range part: ${token}`);
  const num = (s) => (s === undefined || /^[xX*]$/.test(s) ? undefined : Number(s));
  const M = num(m[2]);
  const mi = num(m[3]);
  const p = num(m[4]);
  if ((M === undefined && (mi !== undefined || p !== undefined)) || (mi === undefined && p !== undefined)) {
    throw new BadRange(`invalid range part: ${token}`);
  }
  if (m[5] !== undefined && p === undefined) throw new BadRange(`invalid range part: ${token}`);
  return { op: m[1] || "", M, m: mi, p, pre: m[5] ? m[5].split(".") : [] };
}

function expand({ op, M, m, p, pre }) {
  const z = (n) => n ?? 0;
  if (op === "" || op === "=") {
    if (M === undefined) return ANY();
    if (m === undefined) return [ge(M, 0, 0), lt(M + 1, 0, 0)];
    if (p === undefined) return [ge(M, m, 0), lt(M, m + 1, 0)];
    return [{ op: "=", v: V(M, m, p, pre) }];
  }
  if (op === ">") {
    if (M === undefined) return NONE();
    if (m === undefined) return [ge(M + 1, 0, 0)];
    if (p === undefined) return [ge(M, m + 1, 0)];
    return [{ op: ">", v: V(M, m, p, pre) }];
  }
  if (op === ">=") return M === undefined ? ANY() : [ge(M, z(m), z(p), pre)];
  if (op === "<") {
    if (M === undefined) return NONE();
    if (p === undefined) return [lt(M, z(m), 0)];
    return [{ op: "<", v: V(M, m, p, pre) }];
  }
  if (op === "<=") {
    if (M === undefined) return ANY();
    if (m === undefined) return [lt(M + 1, 0, 0)];
    if (p === undefined) return [lt(M, m + 1, 0)];
    return [{ op: "<=", v: V(M, m, p, pre) }];
  }
  if (op === "~") {
    if (M === undefined) return ANY();
    if (m === undefined) return [ge(M, 0, 0), lt(M + 1, 0, 0)];
    return [ge(M, m, z(p), pre), lt(M, m + 1, 0)];
  }
  // caret: nothing left of the first non-zero part may change
  if (M === undefined) return ANY();
  const lower = ge(M, z(m), z(p), pre);
  if (M !== 0 || m === undefined) return [lower, lt(M + 1, 0, 0)];
  if (m !== 0 || p === undefined) return [lower, lt(0, m + 1, 0)];
  return [lower, lt(0, 0, p + 1)];
}

function upperOfHyphen(t) {
  const q = partial(t);
  if (q.op) throw new BadRange(`invalid range part: ${t}`);
  if (q.M === undefined) return null; // "x" as the top end: no upper bound
  if (q.m === undefined) return lt(q.M + 1, 0, 0);
  if (q.p === undefined) return lt(q.M, q.m + 1, 0);
  return { op: "<=", v: V(q.M, q.m, q.p, q.pre) };
}

function parseSet(text) {
  const s = text.trim();
  if (s === "") return ANY();
  const h = /^(\S+)\s+-\s+(\S+)$/.exec(s);
  if (h) {
    const lo = partial(h[1]);
    if (lo.op) throw new BadRange(`invalid range part: ${h[1]}`);
    const out = lo.M === undefined ? [] : [ge(lo.M, lo.m ?? 0, lo.p ?? 0, lo.pre)];
    const hi = upperOfHyphen(h[2]);
    if (hi) out.push(hi);
    return out.length ? out : ANY();
  }
  const tokens = s.replace(/(>=|<=|>|<|=|\^|~)\s+/g, "$1").split(/\s+/);
  return tokens.flatMap((t) => expand(partial(t)));
}

function parseRange(range) {
  if (typeof range !== "string") throw new TypeError("range must be a string");
  return range.split("||").map(parseSet);
}

function show(c) {
  const { major, minor, patch, pre } = c.v;
  return `${c.op === "=" ? "" : c.op}${major}.${minor}.${patch}${pre.length ? "-" + pre.join(".") : ""}`;
}

function validRange(range) {
  try {
    const sets = parseRange(range).map((set) =>
      set.length === 1 && set[0].op === ">=" && !set[0].v.major && !set[0].v.minor && !set[0].v.patch && !set[0].v.pre.length
        ? "*"
        : set.map(show).join(" ")
    );
    return sets.join(" || ");
  } catch (err) {
    if (err instanceof BadRange) return null;
    throw err;
  }
}

function test(c, v) {
  const d = compareParsed(v, c.v);
  return { "=": d === 0, ">": d > 0, ">=": d >= 0, "<": d < 0, "<=": d <= 0 }[c.op];
}

function matches(sets, v) {
  return sets.some((set) => {
    if (!set.every((c) => test(c, v))) return false;
    if (!v.pre.length) return true;
    return set.some(
      (c) => c.v.pre.length && c.v.major === v.major && c.v.minor === v.minor && c.v.patch === v.patch
    );
  });
}

function satisfies(version, range) {
  const v = parse(version);
  if (!v) return false;
  return matches(parseRange(range), v);
}

function pick(versions, range, sign) {
  const sets = parseRange(range);
  let best = null;
  let bestParsed = null;
  for (const text of versions) {
    const v = parse(text);
    if (!v || !matches(sets, v)) continue;
    if (!best || compareParsed(v, bestParsed) * sign > 0) {
      best = text;
      bestParsed = v;
    }
  }
  return best;
}

const maxSatisfying = (versions, range) => pick(versions, range, 1);
const minSatisfying = (versions, range) => pick(versions, range, -1);

function main(argv) {
  let mode = "list";
  const rest = [];
  for (const a of argv) {
    if (a === "-h" || a === "--help") {
      console.log(USAGE);
      return 0;
    } else if (a === "--max") mode = "max";
    else if (a === "--min") mode = "min";
    else if (a === "--normalize") mode = "normalize";
    else if (a.startsWith("--")) {
      console.error(`semverrange: unknown option ${a}\n${USAGE}`);
      return 2;
    } else rest.push(a);
  }
  if (rest.length === 0) {
    console.error(USAGE);
    return 2;
  }
  const [range, ...versions] = rest;
  const norm = validRange(range);
  if (norm === null) {
    console.error(`semverrange: invalid range ${JSON.stringify(range)}`);
    return 1;
  }
  if (mode === "normalize") {
    console.log(norm);
    return 0;
  }
  let out;
  if (mode === "max") out = [maxSatisfying(versions, range)].filter(Boolean);
  else if (mode === "min") out = [minSatisfying(versions, range)].filter(Boolean);
  else out = versions.filter((v) => satisfies(v, range));
  for (const v of out) console.log(v);
  return out.length ? 0 : 1;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { parse, compare, satisfies, maxSatisfying, minSatisfying, validRange };
