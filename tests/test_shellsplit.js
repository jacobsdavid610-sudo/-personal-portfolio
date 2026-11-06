const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { split, quote, join, main } = require("../scripts/shellsplit.js");

const CLI = path.join(__dirname, "..", "scripts", "shellsplit.js");

function run(args, input) {
  const r = spawnSync(process.execPath, [CLI, ...args], { input, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test("split: plain words on any whitespace", () => {
  assert.deepStrictEqual(split("a b"), ["a", "b"]);
  assert.deepStrictEqual(split("  a \t b\n c  "), ["a", "b", "c"]);
  assert.deepStrictEqual(split(""), []);
  assert.deepStrictEqual(split("   "), []);
});

test("split: single quotes are completely literal", () => {
  assert.deepStrictEqual(split("'a b' c"), ["a b", "c"]);
  assert.deepStrictEqual(split("'a\\b$HOME\"'"), ["a\\b$HOME\""]);
});

test("split: double quotes keep spaces and allow a few escapes", () => {
  assert.deepStrictEqual(split('"a b" c'), ["a b", "c"]);
  assert.deepStrictEqual(split('"say \\"hi\\""'), ['say "hi"']);
  assert.deepStrictEqual(split('"a\\\\b"'), ["a\\b"]);
  assert.deepStrictEqual(split('"\\$HOME \\`x\\`"'), ["$HOME `x`"]);
});

test("split: inside double quotes other backslashes stay", () => {
  assert.deepStrictEqual(split('"a\\nb"'), ["a\\nb"]);
  assert.deepStrictEqual(split('"C:\\dir"'), ["C:\\dir"]);
});

test("split: a single quote is plain inside double quotes and vice versa", () => {
  assert.deepStrictEqual(split(`"it's"`), ["it's"]);
  assert.deepStrictEqual(split(`'say "hi"'`), ['say "hi"']);
});

test("split: backslash escapes the next character outside quotes", () => {
  assert.deepStrictEqual(split("a\\ b c"), ["a b", "c"]);
  assert.deepStrictEqual(split("\\'x\\'"), ["'x'"]);
  assert.deepStrictEqual(split("\\\\"), ["\\"]);
});

test("split: adjacent quoted and bare parts join into one word", () => {
  assert.deepStrictEqual(split("a'b c'\"d e\"f"), ["ab cd ef"]);
  assert.deepStrictEqual(split("x''y"), ["xy"]);
});

test("split: empty quotes make an empty word", () => {
  assert.deepStrictEqual(split("''"), [""]);
  assert.deepStrictEqual(split('a "" b'), ["a", "", "b"]);
  assert.deepStrictEqual(split("'' ''"), ["", ""]);
});

test("split: nothing is expanded", () => {
  assert.deepStrictEqual(split("$HOME *.js `ls` ~ {a,b}"), ["$HOME", "*.js", "`ls`", "~", "{a,b}"]);
});

test("split: backslash-newline is a line continuation", () => {
  assert.deepStrictEqual(split("a \\\nb"), ["a", "b"]);
  assert.deepStrictEqual(split("ab\\\ncd"), ["abcd"]);
  assert.deepStrictEqual(split("ab\\\r\ncd"), ["abcd"]);
  assert.deepStrictEqual(split('"ab\\\ncd"'), ["abcd"]);
});

test("split: newlines inside quotes are kept", () => {
  assert.deepStrictEqual(split("'a\nb'"), ["a\nb"]);
});

test("split: a quote character in the middle of a word still opens a quote", () => {
  assert.deepStrictEqual(split("--name='Bob Smith'"), ["--name=Bob Smith"]);
});

test("split: unterminated single quote names where it began", () => {
  assert.throws(() => split("a 'b"), (e) => e instanceof SyntaxError && /unterminated ' quote.*position 2/.test(e.message));
});

test("split: unterminated double quote names where it began", () => {
  assert.throws(() => split('ab "c'), (e) => e instanceof SyntaxError && /unterminated " quote.*position 3/.test(e.message));
});

test("split: a double quote ending in an escaped quote is unterminated", () => {
  assert.throws(() => split('"abc\\"'), SyntaxError);
});

test("split: trailing backslash is an error", () => {
  assert.throws(() => split("a\\"), (e) => e instanceof SyntaxError && /trailing backslash/.test(e.message));
});

test("split: unicode passes through", () => {
  assert.deepStrictEqual(split("日本語 'é à' 😀"), ["日本語", "é à", "😀"]);
});

test("split: rejects non-strings", () => {
  assert.throws(() => split(null), TypeError);
  assert.throws(() => split(["a"]), TypeError);
});

test("quote: safe words are left alone", () => {
  assert.strictEqual(quote("abc"), "abc");
  assert.strictEqual(quote("a-b_c.d/e:f,g=h+i@j%k"), "a-b_c.d/e:f,g=h+i@j%k");
});

test("quote: empty string becomes ''", () => {
  assert.strictEqual(quote(""), "''");
});

test("quote: anything risky goes in single quotes", () => {
  assert.strictEqual(quote("a b"), "'a b'");
  assert.strictEqual(quote("$HOME"), "'$HOME'");
  assert.strictEqual(quote("a;b"), "'a;b'");
  assert.strictEqual(quote("*.js"), "'*.js'");
  assert.strictEqual(quote("back\\slash"), "'back\\slash'");
});

test("quote: an embedded single quote is closed, escaped and reopened", () => {
  assert.strictEqual(quote("it's"), "'it'\\''s'");
  assert.strictEqual(quote("'"), "''\\'''");
});

test("quote: rejects non-strings", () => {
  assert.throws(() => quote(5), TypeError);
});

test("join: words are separated by one space", () => {
  assert.strictEqual(join(["ls", "-l", "my file"]), "ls -l 'my file'");
  assert.strictEqual(join([]), "");
});

test("round trip: split(join(words)) gives the words back", () => {
  const nasty = [
    "", " ", "a b", "'", "''", '"', "\\", "\\'", "$x", "`x`", "a\nb", "\t", "日本語", "😀 x",
    "it's", "say \"hi\"", "a'b\"c\\d", "--flag=va lue", "*", "~", "#comment", "a;b&c|d", "-", "--",
  ];
  assert.deepStrictEqual(split(join(nasty)), nasty);
  for (const w of nasty) assert.deepStrictEqual(split(quote(w)), [w], JSON.stringify(w));
});

test("round trip: every short string over a tricky alphabet", () => {
  const alphabet = ["a", " ", "'", '"', "\\", "$", "\n"];
  let n = 0;
  const walk = (prefix, depth) => {
    assert.deepStrictEqual(split(quote(prefix)), [prefix], JSON.stringify(prefix));
    n++;
    if (depth === 0) return;
    for (const ch of alphabet) walk(prefix + ch, depth - 1);
  };
  walk("", 4);
  assert.ok(n > 2000);
});

test("main: split prints a JSON array", () => {
  let out = "";
  const code = main(["split", "a 'b c'"], { write: (s) => (out += s) }, { write() {} });
  assert.strictEqual(code, 0);
  assert.strictEqual(out, '["a","b c"]\n');
});

test("main: quote prints a command line", () => {
  let out = "";
  const code = main(["quote", "a b", "c"], { write: (s) => (out += s) }, { write() {} });
  assert.strictEqual(code, 0);
  assert.strictEqual(out, "'a b' c\n");
});

test("main: a syntax error returns 1 and writes to stderr only", () => {
  let out = "";
  let err = "";
  const code = main(["split", "'oops"], { write: (s) => (out += s) }, { write: (s) => (err += s) });
  assert.strictEqual(code, 1);
  assert.strictEqual(out, "");
  assert.match(err, /unterminated/);
});

test("main: usage errors return 2", () => {
  const err = { write() {} };
  const out = { write() {} };
  assert.strictEqual(main([], out, err), 2);
  assert.strictEqual(main(["quote"], out, err), 2);
  assert.strictEqual(main(["split", "a", "b"], out, err), 2);
  assert.strictEqual(main(["frobnicate", "a"], out, err), 2);
});

test("cli: split from an argument", () => {
  const r = run(["split", "git commit -m 'fix: it'\\''s done'"]);
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(JSON.parse(r.out), ["git", "commit", "-m", "fix: it's done"]);
});

test("cli: split from stdin", () => {
  const r = run(["split"], "a 'b c'\n");
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(JSON.parse(r.out), ["a", "b c"]);
});

test("cli: empty stdin gives an empty list", () => {
  const r = run(["split"], "");
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(JSON.parse(r.out), []);
});

test("cli: quote output splits back to the arguments", () => {
  const args = ["echo", "it's", "a b", "", "$x"];
  const r = run(["quote", ...args]);
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(split(r.out.trim()), args);
});

test("cli: exit codes", () => {
  assert.strictEqual(run(["split", '"x']).code, 1);
  assert.strictEqual(run([]).code, 2);
  assert.match(run([]).err, /usage/);
});
