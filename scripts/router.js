#!/usr/bin/env node
"use strict";
// Match URL paths against route patterns like `/users/:id` and
// `/files/*path`, and build paths back from a pattern and its parameters.
// The most specific route wins (static, then `:param`, then `*wildcard`,
// segment by segment), whatever order the routes were added in.
// No dependencies.

const fs = require("node:fs");

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const USAGE = `usage: router.js ROUTES_FILE PATH...

ROUTES_FILE has one route per line: a pattern and an optional name.
Blank lines and lines starting with # are ignored.
Prints one JSON object per PATH: the route it matched and its parameters.
Exit 0 if every PATH matched, 1 if any did not, 2 for a usage or routes error.`;

class Node {
  constructor() {
    this.statics = new Map();
    this.param = null; // { name, node }
    this.wildcard = null; // { name, route }
    this.route = null;
  }
}

function decodeSegment(seg) {
  try {
    return decodeURIComponent(seg);
  } catch (e) {
    if (e instanceof URIError) return null;
    throw e;
  }
}

// Path segments without the leading slash, ignoring one trailing slash.
// "/" is no segments at all.
function segmentsOf(path) {
  const segs = path.slice(1).split("/");
  if (segs.length && segs[segs.length - 1] === "") segs.pop();
  return segs;
}

// The pattern as a list of { kind: "static" | "param" | "wildcard", ... }.
// Throws for anything ambiguous instead of guessing what was meant.
function parsePattern(pattern) {
  if (typeof pattern !== "string") throw new TypeError("pattern must be a string");
  if (!pattern.startsWith("/")) throw new Error(`pattern must start with /: ${pattern}`);
  if (/[?#]/.test(pattern)) throw new Error(`pattern can't contain ? or #: ${pattern}`);
  const segs = segmentsOf(pattern);
  const names = new Set();
  return segs.map((seg, i) => {
    if (seg === "") throw new Error(`empty segment in ${pattern}`);
    const lead = seg[0];
    if (lead === ":" || lead === "*") {
      const name = seg.slice(1);
      if (!NAME.test(name)) throw new Error(`bad parameter name "${seg}" in ${pattern}`);
      if (names.has(name)) throw new Error(`parameter ${name} appears twice in ${pattern}`);
      names.add(name);
      if (lead === "*" && i !== segs.length - 1) {
        throw new Error(`*${name} must be the last segment in ${pattern}`);
      }
      return { kind: lead === ":" ? "param" : "wildcard", name };
    }
    const text = decodeSegment(seg);
    if (text === null) throw new Error(`bad percent-encoding "${seg}" in ${pattern}`);
    return { kind: "static", text };
  });
}

class Router {
  constructor() {
    this.root = new Node();
    this.size = 0;
  }

  // Add a route. `value` is returned with every match (a handler, a name).
  // Two patterns that would match exactly the same paths are an error, and so
  // are two parameters with different names in the same place.
  add(pattern, value = pattern) {
    const parts = parsePattern(pattern);
    const route = { pattern, value };
    let node = this.root;
    let prefix = "";
    for (const part of parts) {
      if (part.kind === "static") {
        if (!node.statics.has(part.text)) node.statics.set(part.text, new Node());
        node = node.statics.get(part.text);
        prefix += "/" + part.text;
      } else if (part.kind === "param") {
        if (node.param && node.param.name !== part.name) {
          throw new Error(`:${part.name} in ${pattern} conflicts with :${node.param.name} after ${prefix || "/"}`);
        }
        if (!node.param) node.param = { name: part.name, node: new Node() };
        node = node.param.node;
        prefix += "/:" + part.name;
      } else {
        if (node.wildcard) throw new Error(`${pattern} duplicates ${node.wildcard.route.pattern}`);
        node.wildcard = { name: part.name, route };
        this.size++;
        return this;
      }
    }
    if (node.route) throw new Error(`${pattern} duplicates ${node.route.pattern}`);
    node.route = route;
    this.size++;
    return this;
  }

  // { pattern, value, params } for the best route, or null. A query string or
  // fragment is ignored, and parameter values are percent-decoded.
  match(path) {
    if (typeof path !== "string") throw new TypeError("path must be a string");
    path = path.replace(/[?#].*$/s, "");
    if (!path.startsWith("/")) return null;
    const segs = [];
    for (const raw of segmentsOf(path)) {
      if (raw === "") return null;
      const seg = decodeSegment(raw);
      if (seg === null) return null;
      segs.push(seg);
    }
    const pairs = [];
    const route = search(this.root, segs, 0, pairs);
    if (!route) return null;
    return { pattern: route.pattern, value: route.value, params: Object.fromEntries(pairs) };
  }
}

// Depth first, most specific branch first, backing out of a branch that
// leads nowhere. Depth is bounded by the longest route, not by the path.
function search(node, segs, i, pairs) {
  if (i === segs.length) return node.route;
  const seg = segs[i];
  const child = node.statics.get(seg);
  if (child) {
    const found = search(child, segs, i + 1, pairs);
    if (found) return found;
  }
  if (node.param) {
    pairs.push([node.param.name, seg]);
    const found = search(node.param.node, segs, i + 1, pairs);
    if (found) return found;
    pairs.pop();
  }
  if (node.wildcard) {
    pairs.push([node.wildcard.name, segs.slice(i).join("/")]);
    return node.wildcard.route;
  }
  return null;
}

// The path for `pattern` with `params` filled in and percent-encoded. A
// wildcard value keeps its slashes. Missing or empty values throw, because
// the path they would make can't match the pattern.
function build(pattern, params = {}) {
  const out = parsePattern(pattern).map((part) => {
    if (part.kind === "static") return encodeURIComponent(part.text);
    if (!Object.prototype.hasOwnProperty.call(params, part.name)) {
      throw new Error(`missing parameter ${part.name} for ${pattern}`);
    }
    const value = String(params[part.name]);
    const pieces = part.kind === "wildcard" ? value.split("/") : [value];
    if (pieces.some((p) => p === "")) throw new Error(`empty value for ${part.name} in ${pattern}`);
    return pieces.map(encodeURIComponent).join("/");
  });
  return "/" + out.join("/");
}

// A Router from routes-file text. Errors name the line.
function parseRoutes(text, source = "routes") {
  const router = new Router();
  text.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;
    const fields = trimmed.split(/\s+/);
    if (fields.length > 2) throw new Error(`${source}:${i + 1}: expected a pattern and an optional name`);
    try {
      router.add(fields[0], fields.length === 2 ? fields[1] : null);
    } catch (e) {
      if (e instanceof TypeError) throw e;
      throw new Error(`${source}:${i + 1}: ${e.message}`);
    }
  });
  return router;
}

function main(argv, out = process.stdout, err = process.stderr) {
  if (argv.length < 2 || argv[0].startsWith("-")) {
    err.write(USAGE + "\n");
    return 2;
  }
  const [file, ...paths] = argv;
  let router;
  try {
    router = parseRoutes(fs.readFileSync(file, "utf8"), file);
  } catch (e) {
    if (!(e instanceof Error) || e instanceof TypeError) throw e;
    err.write(`router: ${e.code ? `${file}: ${e.code}` : e.message}\n`);
    return 2;
  }
  let missed = false;
  for (const path of paths) {
    const m = router.match(path);
    if (m) {
      out.write(JSON.stringify({ path, route: m.pattern, name: m.value, params: m.params }) + "\n");
    } else {
      missed = true;
      out.write(JSON.stringify({ path, route: null }) + "\n");
    }
  }
  return missed ? 1 : 0;
}

module.exports = { Router, build, parsePattern, parseRoutes, main };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
