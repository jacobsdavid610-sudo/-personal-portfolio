const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Router, build, parsePattern, parseRoutes, main } = require("../scripts/router.js");

const CLI = path.join(__dirname, "..", "scripts", "router.js");

function run(args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout.replace(/\r\n/g, "\n"), err: r.stderr };
}

function routes(...patterns) {
  const r = new Router();
  for (const p of patterns) r.add(p);
  return r;
}

function hit(router, p) {
  const m = router.match(p);
  return m && [m.pattern, m.params];
}

function tempFile(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "router-"));
  const file = path.join(dir, "routes.txt");
  fs.writeFileSync(file, text);
  return { file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function sink() {
  const chunks = [];
  return { write: (s) => chunks.push(s), text: () => chunks.join("") };
}

test("static routes match exactly", () => {
  const r = routes("/", "/about", "/users/new");
  assert.deepStrictEqual(hit(r, "/"), ["/", {}]);
  assert.deepStrictEqual(hit(r, "/about"), ["/about", {}]);
  assert.deepStrictEqual(hit(r, "/users/new"), ["/users/new", {}]);
  assert.strictEqual(r.match("/users"), null);
  assert.strictEqual(r.match("/about/more"), null);
  assert.strictEqual(r.match("/About"), null);
});

test("params capture one segment each", () => {
  const r = routes("/users/:id", "/repos/:owner/:repo/issues/:n");
  assert.deepStrictEqual(hit(r, "/users/42"), ["/users/:id", { id: "42" }]);
  assert.deepStrictEqual(hit(r, "/repos/a/b/issues/7"), [
    "/repos/:owner/:repo/issues/:n",
    { owner: "a", repo: "b", n: "7" },
  ]);
  assert.strictEqual(r.match("/users"), null);
  assert.strictEqual(r.match("/users/42/x"), null);
});

test("wildcard takes one or more trailing segments", () => {
  const r = routes("/files/*path");
  assert.deepStrictEqual(hit(r, "/files/a"), ["/files/*path", { path: "a" }]);
  assert.deepStrictEqual(hit(r, "/files/a/b/c.txt"), ["/files/*path", { path: "a/b/c.txt" }]);
  assert.strictEqual(r.match("/files"), null);
  assert.strictEqual(r.match("/files/"), null);
});

test("static beats param beats wildcard, whatever the order added", () => {
  const orders = [
    ["/users/new", "/users/:id", "/users/*rest"],
    ["/users/*rest", "/users/:id", "/users/new"],
    ["/users/:id", "/users/*rest", "/users/new"],
  ];
  for (const order of orders) {
    const r = routes(...order);
    assert.deepStrictEqual(hit(r, "/users/new"), ["/users/new", {}]);
    assert.deepStrictEqual(hit(r, "/users/7"), ["/users/:id", { id: "7" }]);
    assert.deepStrictEqual(hit(r, "/users/7/x"), ["/users/*rest", { rest: "7/x" }]);
  }
});

test("a static branch that leads nowhere falls back to the param", () => {
  const r = routes("/users/new", "/users/:id/edit");
  assert.deepStrictEqual(hit(r, "/users/new/edit"), ["/users/:id/edit", { id: "new" }]);
});

test("a param branch that leads nowhere falls back to the wildcard, without stale params", () => {
  const r = routes("/a/:x/b/:y/c", "/a/*rest");
  assert.deepStrictEqual(hit(r, "/a/1/b/2/c"), ["/a/:x/b/:y/c", { x: "1", y: "2" }]);
  assert.deepStrictEqual(hit(r, "/a/1/b/2/d"), ["/a/*rest", { rest: "1/b/2/d" }]);
});

test("specificity is decided segment by segment from the left", () => {
  const r = routes("/:a/static", "/fixed/:b");
  // the first segment decides: "fixed" is static in the second route
  assert.deepStrictEqual(hit(r, "/fixed/static"), ["/fixed/:b", { b: "static" }]);
  assert.deepStrictEqual(hit(r, "/other/static"), ["/:a/static", { a: "other" }]);
});

test("a root wildcard catches everything except /", () => {
  const r = routes("/", "/*all");
  assert.deepStrictEqual(hit(r, "/"), ["/", {}]);
  assert.deepStrictEqual(hit(r, "/x/y"), ["/*all", { all: "x/y" }]);
});

test("one trailing slash is ignored on both sides", () => {
  const r = routes("/users/:id/");
  assert.deepStrictEqual(hit(r, "/users/1"), ["/users/:id/", { id: "1" }]);
  assert.deepStrictEqual(hit(r, "/users/1/"), ["/users/:id/", { id: "1" }]);
  assert.strictEqual(r.match("/users/1//"), null);
});

test("empty segments in the middle never match", () => {
  const r = routes("/a/:x/b", "/w/*rest");
  assert.strictEqual(r.match("/a//b"), null);
  assert.strictEqual(r.match("/w/x//y"), null);
});

test("query string and fragment are ignored", () => {
  const r = routes("/search/:q");
  assert.deepStrictEqual(hit(r, "/search/cats?page=2"), ["/search/:q", { q: "cats" }]);
  assert.deepStrictEqual(hit(r, "/search/cats#top"), ["/search/:q", { q: "cats" }]);
  assert.deepStrictEqual(hit(r, "/search/cats?a=/b#c?d"), ["/search/:q", { q: "cats" }]);
});

test("segments are percent-decoded after splitting", () => {
  const r = routes("/users/:name", "/café", "/files/*path");
  assert.deepStrictEqual(hit(r, "/users/John%20Smith"), ["/users/:name", { name: "John Smith" }]);
  // an encoded slash stays inside its segment
  assert.deepStrictEqual(hit(r, "/users/a%2Fb"), ["/users/:name", { name: "a/b" }]);
  assert.deepStrictEqual(hit(r, "/caf%C3%A9"), ["/café", {}]);
  assert.deepStrictEqual(hit(r, "/files/a%20b/c"), ["/files/*path", { path: "a b/c" }]);
});

test("bad percent-encoding is no match, not an exception", () => {
  const r = routes("/users/:name");
  assert.strictEqual(r.match("/users/%E0%A4%A"), null);
  assert.strictEqual(r.match("/users/100%"), null);
});

test("paths that aren't absolute don't match", () => {
  const r = routes("/", "/a");
  assert.strictEqual(r.match(""), null);
  assert.strictEqual(r.match("a"), null);
  assert.strictEqual(r.match("?x=1"), null);
  assert.throws(() => r.match(42), TypeError);
});

test("the route's value comes back with the match", () => {
  const handler = () => "hi";
  const r = new Router().add("/hi", handler).add("/plain");
  assert.strictEqual(r.match("/hi").value, handler);
  assert.strictEqual(r.match("/plain").value, "/plain");
  assert.strictEqual(r.size, 2);
});

test("a param called __proto__ is an ordinary key", () => {
  const r = routes("/x/:__proto__");
  const m = r.match("/x/hello");
  assert.ok(Object.prototype.hasOwnProperty.call(m.params, "__proto__"));
  assert.strictEqual(m.params.__proto__, "hello");
  assert.strictEqual(Object.getPrototypeOf(m.params), Object.prototype);
});

test("long paths don't recurse past the longest route", () => {
  const r = routes("/a/:b", "/*rest");
  const long = "/" + Array.from({ length: 50000 }, (_, i) => `s${i}`).join("/");
  assert.strictEqual(r.match(long).pattern, "/*rest");
});

test("duplicate routes are rejected, including ones that differ only in names", () => {
  assert.throws(() => routes("/a/:id", "/a/:id"), /duplicates \/a\/:id/);
  assert.throws(() => routes("/a", "/a/"), /duplicates/);
  assert.throws(() => routes("/f/*a", "/f/*b"), /duplicates \/f\/\*a/);
  assert.throws(() => routes("/caf%C3%A9", "/café"), /duplicates/);
});

test("different param names in the same place are rejected", () => {
  assert.throws(() => routes("/u/:id", "/u/:name/posts"), /:name in \/u\/:name\/posts conflicts with :id after \/u/);
  assert.throws(() => routes("/:a", "/:b/x"), /conflicts with :a after \//);
  // the same name is fine
  const r = routes("/u/:id", "/u/:id/posts");
  assert.deepStrictEqual(hit(r, "/u/1/posts"), ["/u/:id/posts", { id: "1" }]);
});

test("bad patterns are rejected", () => {
  assert.throws(() => parsePattern("users"), /must start with \//);
  assert.throws(() => parsePattern("/a//b"), /empty segment/);
  assert.throws(() => parsePattern("/a/:"), /bad parameter name/);
  assert.throws(() => parsePattern("/a/:1x"), /bad parameter name/);
  assert.throws(() => parsePattern("/a/:x-y"), /bad parameter name/);
  assert.throws(() => parsePattern("/*rest/x"), /must be the last segment/);
  assert.throws(() => parsePattern("/:x/:x"), /appears twice/);
  assert.throws(() => parsePattern("/:x/*x"), /appears twice/);
  assert.throws(() => parsePattern("/a?b"), /\? or #/);
  assert.throws(() => parsePattern("/%E0%A4%A"), /bad percent-encoding/);
  assert.throws(() => parsePattern(null), TypeError);
});

test("a colon or star after the first character is just text", () => {
  const r = routes("/a:b", "/x*");
  assert.deepStrictEqual(hit(r, "/a:b"), ["/a:b", {}]);
  assert.deepStrictEqual(hit(r, "/x*"), ["/x*", {}]);
  assert.strictEqual(r.match("/xyz"), null);
});

test("build fills in and encodes params", () => {
  assert.strictEqual(build("/users/:id", { id: 42 }), "/users/42");
  assert.strictEqual(build("/users/:name", { name: "a b/c?" }), "/users/a%20b%2Fc%3F");
  assert.strictEqual(build("/files/*path", { path: "my docs/x.txt" }), "/files/my%20docs/x.txt");
  assert.strictEqual(build("/"), "/");
  assert.strictEqual(build("/café"), "/caf%C3%A9");
});

test("build refuses missing or empty values", () => {
  assert.throws(() => build("/users/:id", {}), /missing parameter id/);
  assert.throws(() => build("/users/:id", { id: "" }), /empty value for id/);
  assert.throws(() => build("/f/*p", { p: "a//b" }), /empty value for p/);
  assert.throws(() => build("/f/*p", { p: "a/" }), /empty value for p/);
  // inherited properties don't count as given
  assert.throws(() => build("/x/:toString", {}), /missing parameter toString/);
});

test("build then match gives the params back", () => {
  const r = routes("/u/:name/f/*path", "/u/:name");
  const cases = [
    { name: "a b" },
    { name: "x/y?z#w" },
    { name: "%41" },
    { name: "日本語" },
    { name: "o'neil", path: "a/b c/d%e" },
  ];
  for (const params of cases) {
    const pattern = params.path === undefined ? "/u/:name" : "/u/:name/f/*path";
    const m = r.match(build(pattern, params));
    assert.strictEqual(m.pattern, pattern);
    assert.deepStrictEqual(m.params, params);
  }
});

test("parseRoutes reads patterns, names, comments and blank lines", () => {
  const r = parseRoutes("# routes\n\n/users/:id user-show\r\n  /files/*path   files\n/plain\n");
  assert.strictEqual(r.match("/users/1").value, "user-show");
  assert.strictEqual(r.match("/files/x").value, "files");
  assert.strictEqual(r.match("/plain").value, null);
  assert.strictEqual(r.size, 3);
});

test("parseRoutes errors name the source and line", () => {
  assert.throws(() => parseRoutes("/a\n\n/a\n", "app.routes"), /^Error: app\.routes:3: \/a duplicates \/a$/);
  assert.throws(() => parseRoutes("/a b c\n"), /routes:1: expected a pattern and an optional name/);
  assert.throws(() => parseRoutes("nope\n"), /routes:1: pattern must start with \//);
});

test("main: prints a JSON line per path and exits 0 when all match", () => {
  const { file, cleanup } = tempFile("/users/:id user\n/\n");
  try {
    const out = sink();
    const err = sink();
    assert.strictEqual(main([file, "/users/7?x=1", "/"], out, err), 0);
    assert.deepStrictEqual(out.text().trim().split("\n").map((l) => JSON.parse(l)), [
      { path: "/users/7?x=1", route: "/users/:id", name: "user", params: { id: "7" } },
      { path: "/", route: "/", name: null, params: {} },
    ]);
    assert.strictEqual(err.text(), "");
  } finally {
    cleanup();
  }
});

test("main: exits 1 when any path doesn't match, still printing the rest", () => {
  const { file, cleanup } = tempFile("/a\n");
  try {
    const out = sink();
    assert.strictEqual(main([file, "/nope", "/a"], out, sink()), 1);
    const lines = out.text().trim().split("\n").map((l) => JSON.parse(l));
    assert.deepStrictEqual(lines[0], { path: "/nope", route: null });
    assert.strictEqual(lines[1].route, "/a");
  } finally {
    cleanup();
  }
});

test("main: usage and routes errors exit 2", () => {
  const err = sink();
  assert.strictEqual(main([], sink(), err), 2);
  assert.match(err.text(), /^usage: router\.js/);
  assert.strictEqual(main(["routes.txt"], sink(), sink()), 2);
  assert.strictEqual(main(["--help", "/x"], sink(), sink()), 2);

  const missing = sink();
  assert.strictEqual(main([path.join(os.tmpdir(), "no-such-routes-file.txt"), "/"], sink(), missing), 2);
  assert.match(missing.text(), /ENOENT/);

  const { file, cleanup } = tempFile("/a/:x\n/a/:y/b\n");
  try {
    const bad = sink();
    const out = sink();
    assert.strictEqual(main([file, "/a/1"], out, bad), 2);
    assert.match(bad.text(), /routes\.txt:2: :y in \/a\/:y\/b conflicts with :x/);
    assert.strictEqual(out.text(), "");
  } finally {
    cleanup();
  }
});

test("CLI end to end", () => {
  const { file, cleanup } = tempFile("/users/new new\n/users/:id show\n/static/*path assets\n");
  try {
    const ok = run([file, "/users/new", "/users/%C3%A9", "/static/css/site.css"]);
    assert.strictEqual(ok.code, 0);
    assert.strictEqual(
      ok.out,
      [
        '{"path":"/users/new","route":"/users/new","name":"new","params":{}}',
        '{"path":"/users/%C3%A9","route":"/users/:id","name":"show","params":{"id":"é"}}',
        '{"path":"/static/css/site.css","route":"/static/*path","name":"assets","params":{"path":"css/site.css"}}',
        "",
      ].join("\n"),
    );
    const miss = run([file, "/nope"]);
    assert.strictEqual(miss.code, 1);
    assert.strictEqual(miss.out, '{"path":"/nope","route":null}\n');
    const usage = run([]);
    assert.strictEqual(usage.code, 2);
    assert.match(usage.err, /usage/);
  } finally {
    cleanup();
  }
});
