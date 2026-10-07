#!/usr/bin/env node
// Match paths against shell-style glob patterns: *, ?, [a-z], [!x],
// {a,b} alternation and ** for "any number of directories". Each pattern
// is compiled to a RegExp once, so filtering a long list of paths is
// cheap. No dependencies.

const REGEX_SPECIAL = new Set([..."\\^$.|?*+()[]{}"]);
const MAX_EXPANSIONS = 4096;

function escapeRegex(c) {
  return REGEX_SPECIAL.has(c) ? "\\" + c : c;
}

/**
 * Expands {a,b} alternations, nested ones included, into a list of plain
 * patterns: "src/{a,b{1,2}}.js" -> ["src/a.js", "src/b1.js", "src/b2.js"].
 * A brace group with no top-level comma, or no closing brace, is left as
 * literal text (same as bash).
 */
function expandBraces(pattern) {
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "\\") {
      i++;
      continue;
    }
    if (pattern[i] !== "{") continue;

    const parts = [];
    let depth = 0;
    let start = i + 1;
    let end = -1;
    for (let j = i + 1; j < pattern.length; j++) {
      const c = pattern[j];
      if (c === "\\") {
        j++;
      } else if (c === "{") {
        depth++;
      } else if (c === "}") {
        if (depth === 0) {
          parts.push(pattern.slice(start, j));
          end = j;
          break;
        }
        depth--;
      } else if (c === "," && depth === 0) {
        parts.push(pattern.slice(start, j));
        start = j + 1;
      }
    }
    if (end === -1 || parts.length < 2) continue;

    const head = pattern.slice(0, i);
    const tail = pattern.slice(end + 1);
    const out = new Set();
    for (const part of parts) {
      for (const expanded of expandBraces(head + part + tail)) {
        out.add(expanded);
        if (out.size > MAX_EXPANSIONS) {
          throw new Error(`glob expands to more than ${MAX_EXPANSIONS} patterns`);
        }
      }
    }
    return [...out];
  }
  return [pattern];
}

/**
 * Parses a [...] class starting at pattern[i] === "[". Returns
 * { source, next } or null if the class is never closed (in which case
 * the "[" is a literal).
 */
function parseClass(pattern, i) {
  let j = i + 1;
  let negate = false;
  if (pattern[j] === "!" || pattern[j] === "^") {
    negate = true;
    j++;
  }
  let body = "";
  let first = true;
  for (; j < pattern.length; j++) {
    const c = pattern[j];
    if (c === "]" && !first) {
      // Classes never match "/", positive or negated.
      const source = negate ? `[^/${body}]` : `(?!/)[${body}]`;
      return { source, next: j + 1 };
    }
    first = false;
    if (c === "\\" && j + 1 < pattern.length) {
      body += "\\" + pattern[++j];
    } else if (c === "\\" || c === "]" || c === "[" || c === "^") {
      body += "\\" + c;
    } else {
      body += c;
    }
  }
  return null;
}

function compileOne(pattern, dot) {
  const noDot = dot ? "" : "(?!\\.)";
  const segment = `${noDot}[^/]+`;
  let re = "";
  let atSegmentStart = true;
  let i = 0;

  while (i < pattern.length) {
    const c = pattern[i];

    if (c === "*" && pattern[i + 1] === "*" && atSegmentStart &&
        (i + 2 === pattern.length || pattern[i + 2] === "/")) {
      if (i + 2 === pattern.length) {
        // trailing "**": everything below this point
        re += `(?:${segment}(?:/${segment})*)?`;
        i += 2;
      } else {
        // "**/": zero or more whole directories
        re += `(?:${segment}/)*`;
        i += 3;
      }
      continue;
    }

    if (c === "*") {
      re += (atSegmentStart ? noDot : "") + "[^/]*";
      while (pattern[i] === "*") i++; // "a**b" is just "a*b"
      atSegmentStart = false;
      continue;
    }

    if (c === "?") {
      re += (atSegmentStart ? noDot : "") + "[^/]";
      i++;
      atSegmentStart = false;
      continue;
    }

    if (c === "[") {
      const cls = parseClass(pattern, i);
      if (cls) {
        re += (atSegmentStart ? noDot : "") + cls.source;
        i = cls.next;
        atSegmentStart = false;
        continue;
      }
    }

    if (c === "\\" && i + 1 < pattern.length) {
      re += escapeRegex(pattern[i + 1]);
      i += 2;
      atSegmentStart = false;
      continue;
    }

    re += escapeRegex(c);
    atSegmentStart = c === "/";
    i++;
  }
  return re;
}

/**
 * Compiles a glob into an anchored RegExp.
 * options.dot: let wildcards match names starting with "." (default false).
 */
function compile(pattern, options = {}) {
  if (typeof pattern !== "string" || pattern === "") {
    throw new Error("pattern must be a non-empty string");
  }
  const sources = expandBraces(stripDotSlash(pattern)).map((p) => compileOne(p, !!options.dot));
  try {
    return new RegExp(`^(?:${sources.join("|")})$`);
  } catch (err) {
    throw new Error(`invalid glob ${JSON.stringify(pattern)}: ${err.message}`);
  }
}

function stripDotSlash(path) {
  while (path.startsWith("./")) path = path.slice(2);
  return path;
}

/**
 * Returns a function (path) => boolean for the given pattern.
 * options.dot: see compile().
 * options.basename: if the pattern has no "/", match it against the
 *   last path component only, so "*.js" matches "src/a.js".
 */
function createMatcher(pattern, options = {}) {
  const re = compile(pattern, options);
  const useBasename = !!options.basename && !pattern.includes("/");
  return (path) => {
    let p = stripDotSlash(path);
    if (useBasename) p = p.slice(p.lastIndexOf("/") + 1);
    return re.test(p);
  };
}

function isMatch(path, pattern, options) {
  return createMatcher(pattern, options)(path);
}

function filter(paths, pattern, options) {
  const matches = createMatcher(pattern, options);
  return paths.filter(matches);
}

module.exports = { compile, createMatcher, isMatch, filter, expandBraces };

if (require.main === module) {
  const USAGE = "Usage: globmatch.js [--dot] [--basename] [-v] <pattern> [path...]\n" +
    "  With no paths, reads them from stdin, one per line.";
  const options = {};
  let invert = false;
  const positional = [];
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dot") options.dot = true;
    else if (arg === "--basename") options.basename = true;
    else if (arg === "-v") invert = true;
    else if (arg === "-h" || arg === "--help") {
      console.log(USAGE);
      process.exit(0);
    } else positional.push(arg);
  }
  if (positional.length === 0) {
    console.error(USAGE);
    process.exit(2);
  }

  let matches;
  try {
    matches = createMatcher(positional[0], options);
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }

  const run = (paths) => {
    let found = 0;
    for (const p of paths) {
      if (p !== "" && matches(p) !== invert) {
        console.log(p);
        found++;
      }
    }
    process.exit(found > 0 ? 0 : 1);
  };

  if (positional.length > 1) {
    run(positional.slice(1));
  } else {
    const chunks = [];
    process.stdin.on("data", (d) => chunks.push(d));
    process.stdin.on("end", () => run(Buffer.concat(chunks).toString("utf8").split(/\r?\n/)));
  }
}
