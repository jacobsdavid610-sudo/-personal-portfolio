const test = require("node:test");
const assert = require("node:assert");
const { compile, createMatcher, isMatch, filter, expandBraces } = require("../scripts/globmatch.js");

function yes(pattern, paths, options) {
  for (const p of paths) assert.ok(isMatch(p, pattern, options), `${pattern} should match ${p}`);
}

function no(pattern, paths, options) {
  for (const p of paths) assert.ok(!isMatch(p, pattern, options), `${pattern} should not match ${p}`);
}

test("* and ? stay inside one path segment", () => {
  yes("*.js", ["a.js", "a.min.js"]);
  no("*.js", ["src/a.js", "a.jsx", "a.ts"]);
  yes("src/?.js", ["src/a.js"]);
  no("src/?.js", ["src/ab.js", "src/.js"]);
  no("a?b", ["a/b"]);
});

test("** matches zero or more whole directories", () => {
  yes("a/**/b", ["a/b", "a/x/b", "a/x/y/z/b"]);
  no("a/**/b", ["a/xb", "ab", "a/x/bc"]);
  yes("**/*.md", ["README.md", "docs/a.md", "docs/deep/er/b.md"]);
  yes("src/**", ["src/a.js", "src/x/y/z.js"]);
  no("src/**", ["srcx/a.js", "lib/src/a.js"]);
});

test("** that isn't a whole segment behaves like *", () => {
  yes("a**b", ["ab", "axxb"]);
  no("a**b", ["a/x/b"]);
  yes("src/**.js", ["src/a.js"]);
  no("src/**.js", ["src/x/a.js"]);
});

test("wildcards skip dotfiles and dot-directories unless dot is set", () => {
  no("*", [".env"]);
  no("?env", [".env"]);
  no("[.]env", [".env"]);
  no("**/*.js", [".git/hooks/a.js", "src/.cache/a.js", "src/.a.js"]);
  yes(".*", [".env", ".gitignore"]);
  yes("src/.cache/*.js", ["src/.cache/a.js"]);
  yes("*", [".env"], { dot: true });
  yes("**/*.js", [".git/hooks/a.js", "src/.a.js"], { dot: true });
});

test("character classes: ranges, negation, never matching /", () => {
  yes("file[0-9].txt", ["file1.txt", "file9.txt"]);
  no("file[0-9].txt", ["filex.txt", "file10.txt"]);
  yes("[!a]*", ["bcd"]);
  yes("[^a]*", ["bcd"]);
  no("[!a]*", ["abc"]);
  no("a[/]b", ["a/b"]);
  no("a[!x]b", ["a/b"]);
});

test("] right after [ or [! is a literal member of the class", () => {
  yes("[]a]", ["]", "a"]);
  yes("[!]a]", ["b"]);
  no("[!]a]", ["]", "a"]);
});

test("unclosed [ and { are literal text", () => {
  yes("[ab", ["[ab"]);
  yes("a{b", ["a{b"]);
  yes("{a}", ["{a}"]);
  no("{a}", ["a"]);
});

test("backslash escapes special characters", () => {
  yes("a\\*b", ["a*b"]);
  no("a\\*b", ["axb"]);
  yes("\\[x\\]", ["[x]"]);
  yes("\\{a,b\\}", ["{a,b}"]);
  no("\\{a,b\\}", ["a"]);
});

test("regex metacharacters in the pattern are matched literally", () => {
  yes("a.b+(c)|d$", ["a.b+(c)|d$"]);
  no("a.b", ["axb"]);
});

test("brace expansion, including nested groups and **", () => {
  assert.deepStrictEqual(expandBraces("src/{a,b{1,2}}.js"), ["src/a.js", "src/b1.js", "src/b2.js"]);
  assert.deepStrictEqual(expandBraces("{x,x}"), ["x"]);
  yes("*.{js,ts}", ["a.js", "a.ts"]);
  no("*.{js,ts}", ["a.jsx"]);
  yes("{src,lib}/**/*.js", ["src/a.js", "lib/x/y.js"]);
  no("{src,lib}/**/*.js", ["test/a.js"]);
  yes("a{,.min}.js", ["a.js", "a.min.js"]);
});

test("brace expansion refuses to blow up", () => {
  assert.throws(() => compile("{a,b}".repeat(13)), /more than 4096/);
});

test("leading ./ is ignored on both path and pattern", () => {
  yes("src/*.js", ["./src/a.js"]);
  yes("./src/*.js", ["src/a.js", "./src/a.js"]);
});

test("basename mode only applies to slash-less patterns", () => {
  yes("*.js", ["src/deep/a.js"], { basename: true });
  no("src/*.js", ["lib/src/a.js"], { basename: true });
});

test("filter compiles once and keeps order", () => {
  const paths = ["b.js", "a.ts", "a.js", "c/d.js"];
  assert.deepStrictEqual(filter(paths, "*.js"), ["b.js", "a.js"]);
  const m = createMatcher("*.ts");
  assert.deepStrictEqual(paths.filter(m), ["a.ts"]);
});

test("bad patterns throw clear errors", () => {
  assert.throws(() => compile(""), /non-empty/);
  assert.throws(() => compile(null), /non-empty/);
  assert.throws(() => compile("[z-a]"), /invalid glob "\[z-a\]"/);
});
