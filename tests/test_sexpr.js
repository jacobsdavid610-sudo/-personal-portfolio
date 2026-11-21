const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { parse, print, pretty, Sym, SexprError } = require("../scripts/sexpr.js");

const CLI = path.join(__dirname, "..", "scripts", "sexpr.js");

function run(args, input) {
  const r = spawnSync(process.execPath, [CLI, ...args], { input });
  return { code: r.status, out: r.stdout.toString().replace(/\r\n/g, "\n"), err: r.stderr.toString() };
}

const sym = (n) => new Sym(n);

test("atoms: numbers, symbols, strings", () => {
  assert.deepStrictEqual(parse("42 -7 3.5 .5 1e3 foo + - ... \"hi\""), [
    42, -7, 3.5, 0.5, 1000, sym("foo"), sym("+"), sym("-"), sym("..."), "hi",
  ]);
});

test("lone sign and look-alikes stay symbols", () => {
  assert.deepStrictEqual(parse("+ - 1+ 1a .e1"), [sym("+"), sym("-"), sym("1+"), sym("1a"), sym(".e1")]);
});

test("nested lists and empty list", () => {
  assert.deepStrictEqual(parse("(a (b ()) c)"), [[sym("a"), [sym("b"), []], sym("c")]]);
});

test("comments run to end of line and may sit anywhere", () => {
  assert.deepStrictEqual(parse("; top\n(a ; mid\n b) ; tail"), [[sym("a"), sym("b")]]);
});

test("quote shorthand, including nested", () => {
  assert.deepStrictEqual(parse("'a ''b '(1 2)"), [
    [sym("quote"), sym("a")],
    [sym("quote"), [sym("quote"), sym("b")]],
    [sym("quote"), [1, 2]],
  ]);
});

test("string escapes", () => {
  assert.deepStrictEqual(parse('"a\\nb\\t\\"q\\" \\\\"'), ['a\nb\t"q" \\']);
});

test("a string may span lines and hold parens and semicolons", () => {
  assert.deepStrictEqual(parse('"(a ;\nb)"'), ["(a ;\nb)"]);
});

test("atoms end at delimiters with no whitespace", () => {
  assert.deepStrictEqual(parse('(a"b"c)'), [[sym("a"), "b", sym("c")]]);
  assert.deepStrictEqual(parse("(a;c\n)"), [[sym("a")]]);
});

test("empty and comment-only input give no forms", () => {
  assert.deepStrictEqual(parse(""), []);
  assert.deepStrictEqual(parse("  ; nothing\n"), []);
});

test("errors report where the problem is", () => {
  const cases = [
    ["(a b", "unclosed (", 1, 1],
    ["a\n  )", "unexpected )", 2, 3],
    ["(a\n(b", "unclosed (", 2, 1],
    ['x "abc', "unterminated string", 1, 3],
    ['"a\\q"', "unknown escape \\q", 1, 3],
    ["'", "unexpected end of input", 1, 2],
  ];
  for (const [src, msg, line, col] of cases) {
    assert.throws(
      () => parse(src),
      (e) => e instanceof SexprError && e.message === `${msg} at ${line}:${col}` && e.line === line && e.col === col,
      src
    );
  }
});

test("a backslash as the last character of a string is unterminated", () => {
  assert.throws(() => parse('"abc\\'), /unterminated string at 1:1/);
});

test("non-string input is a TypeError", () => {
  assert.throws(() => parse(null), TypeError);
});

test("print: normalises spacing and quote forms", () => {
  assert.strictEqual(print(parse("(  a   (b\n c)  (quote d) )")[0]), "(a (b c) 'd)");
});

test("print: escapes strings", () => {
  assert.strictEqual(print('a"b\\c\nd'), '"a\\"b\\\\c\\nd"');
});

test("print: rejects values it does not know", () => {
  assert.throws(() => print([1, {}]), TypeError);
  assert.throws(() => print(undefined), TypeError);
});

test("print then parse round-trips random trees", () => {
  let seed = 12345;
  const rnd = (n) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const gen = (depth) => {
    const k = rnd(depth > 3 ? 4 : 6);
    if (k === 0) return rnd(2000) - 1000;
    if (k === 1) return sym("s" + rnd(50));
    if (k === 2) return ["", "a b", 'q"\\', "x\ny\t", "(;)"][rnd(5)];
    if (k === 3) return rnd(100) / 8;
    return Array.from({ length: rnd(5) }, () => gen(depth + 1));
  };
  for (let n = 0; n < 300; n++) {
    const tree = gen(0);
    const once = print(tree);
    assert.strictEqual(print(parse(once)[0]), once);
  }
});

test("pretty: short forms stay on one line", () => {
  assert.strictEqual(pretty(parse("(a (b c) d)")[0], 72), "(a (b c) d)");
});

test("pretty: long forms break under the first argument", () => {
  const form = parse("(define (fact n) (if (= n 0) 1 (* n (fact (- n 1)))) (display \"hello world this is long\"))")[0];
  assert.strictEqual(
    pretty(form, 40),
    [
      "(define (fact n)",
      "        (if (= n 0)",
      "            1",
      "            (* n (fact (- n 1))))",
      '        (display "hello world this is long"))',
    ].join("\n")
  );
});

test("pretty: output parses back to the same tree and respects the width", () => {
  const src = "(let ((alpha 1) (beta 2) (gamma (list 1 2 3 4 5 6 7 8 9))) (+ alpha beta (apply + gamma)) 'tail)";
  const form = parse(src)[0];
  const out = pretty(form, 30);
  assert.strictEqual(print(parse(out)[0]), print(form));
  assert.ok(out.includes("\n"));
  // The only lines allowed past the width are single atoms that cannot break.
  for (const l of out.split("\n")) assert.ok(l.length <= 30, l);
});

test("pretty: a list headed by a list is indented by one", () => {
  const out = pretty(parse("((aaaa bbbb) (cccc dddd) (eeee ffff))")[0], 20);
  assert.strictEqual(out, "((aaaa bbbb)\n (cccc dddd)\n (eeee ffff))");
});

test("CLI: prints one normalised form per line", () => {
  const r = run([], "(a   b) ; c\n'(1 2)\n");
  assert.deepStrictEqual([r.code, r.out], [0, "(a b)\n'(1 2)\n"]);
});

test("CLI: --json marks symbols", () => {
  const r = run(["--json"], '(a 1 "s")');
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(JSON.parse(r.out), [[{ sym: "a" }, 1, "s"]]);
});

test("CLI: syntax error exits 1 with the position", () => {
  const r = run([], "(a (b");
  assert.strictEqual(r.code, 1);
  assert.match(r.err, /unclosed \( at 1:4/);
  assert.strictEqual(r.out, "");
});

test("CLI: usage errors exit 2", () => {
  assert.strictEqual(run(["--nope"], "").code, 2);
  assert.strictEqual(run(["-w", "0"], "").code, 2);
  assert.strictEqual(run(["a", "b"], "").code, 2);
});

test("CLI: missing file exits 1", () => {
  const r = run(["no-such-file.scm"], "");
  assert.strictEqual(r.code, 1);
  assert.match(r.err, /^sexpr: /);
});

test("CLI: --pretty with -w", () => {
  const r = run(["--pretty", "-w", "20"], "((aaaa bbbb) (cccc dddd) (eeee ffff))");
  assert.strictEqual(r.out, "((aaaa bbbb)\n (cccc dddd)\n (eeee ffff))\n");
});
