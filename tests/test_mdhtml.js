const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { render, inline, safeUrl } = require("../scripts/mdhtml.js");

const CLI = path.join(__dirname, "..", "scripts", "mdhtml.js");

function run(args, input) {
  const r = spawnSync(process.execPath, [CLI, ...args], { input });
  return { code: r.status, out: r.stdout.toString().replace(/\r\n/g, "\n"), err: r.stderr.toString() };
}

// Markdown on the left, expected HTML (without the final newline) on the right.
function check(cases) {
  for (const [md, html] of cases) assert.strictEqual(render(md), html + "\n", JSON.stringify(md));
}

test("headings: levels, trailing hashes, empty heading, not a heading", () => {
  check([
    ["# One", "<h1>One</h1>"],
    ["###### Six", "<h6>Six</h6>"],
    ["## Closed ##", "<h2>Closed</h2>"],
    ["#", "<h1></h1>"],
    ["####### seven", "<p>####### seven</p>"],
    ["#nospace", "<p>#nospace</p>"],
    ["# Hi *there*", "<h1>Hi <em>there</em></h1>"],
  ]);
});

test("paragraphs: joined lines, blank-line separation, hard breaks", () => {
  check([
    ["a\nb", "<p>a\nb</p>"],
    ["a\n\nb", "<p>a</p>\n<p>b</p>"],
    ["a  \nb", "<p>a<br>\nb</p>"],
    ["a\\\nb", "<p>a<br>\nb</p>"],
    ["   indented  ", "<p>indented</p>"],
  ]);
  assert.strictEqual(render(""), "");
  assert.strictEqual(render("\n\n  \n"), "");
});

test("emphasis and strong", () => {
  check([
    ["*a* _b_", "<p><em>a</em> <em>b</em></p>"],
    ["**a** __b__", "<p><strong>a</strong> <strong>b</strong></p>"],
    ["***a***", "<p><em><strong>a</strong></em></p>"],
    ["**bold *and em* text**", "<p><strong>bold <em>and em</em> text</strong></p>"],
    ["snake_case_name", "<p>snake_case_name</p>"],
    ["2 * 3 * 4", "<p>2 * 3 * 4</p>"],
    ["*unclosed", "<p>*unclosed</p>"],
    ["** not strong **", "<p>** not strong **</p>"],
    ["a*b*c", "<p>a<em>b</em>c</p>"],
  ]);
});

test("code spans: escaping, backtick runs, spacing", () => {
  check([
    ["`a < b`", "<p><code>a &lt; b</code></p>"],
    ["`` a ` b ``", "<p><code>a ` b</code></p>"],
    ["`*not em*`", "<p><code>*not em*</code></p>"],
    ["`unclosed", "<p>`unclosed</p>"],
    ["** `**` **", "<p>** <code>**</code> **</p>"],
  ]);
});

test("backslash escapes", () => {
  check([
    ["\\*a\\*", "<p>*a*</p>"],
    ["\\# not a heading", "<p># not a heading</p>"],
    ["a \\q b", "<p>a \\q b</p>"],
    ["\\<b\\>", "<p>&lt;b&gt;</p>"],
  ]);
});

test("links and images", () => {
  check([
    ["[x](http://e.com)", '<p><a href="http://e.com">x</a></p>'],
    ['[x](/a "T")', '<p><a href="/a" title="T">x</a></p>'],
    ["[x](<a b>)", '<p><a href="a b">x</a></p>'],
    ["[x](http://e.com/a_(b))", '<p><a href="http://e.com/a_(b)">x</a></p>'],
    ["[*em* `c`](u)", '<p><a href="u"><em>em</em> <code>c</code></a></p>'],
    ["![alt *x*](p.png)", '<p><img src="p.png" alt="alt x"></p>'],
    ["![a](p.png 'ti')", '<p><img src="p.png" alt="a" title="ti"></p>'],
    ["[a]", "<p>[a]</p>"],
    ["[a](unclosed", "<p>[a](unclosed</p>"],
    ["[[nested]](u)", '<p><a href="u">[nested]</a></p>'],
    ["<https://e.com/x?a=1&b=2>", '<p><a href="https://e.com/x?a=1&amp;b=2">https://e.com/x?a=1&amp;b=2</a></p>'],
    ["<me@e.com>", '<p><a href="mailto:me@e.com">me@e.com</a></p>'],
    ["a < b > c", "<p>a &lt; b &gt; c</p>"],
  ]);
});

test("fenced code", () => {
  check([
    ["```\na < b\n```", "<pre><code>a &lt; b\n</code></pre>"],
    ["```js\nlet x;\n```", '<pre><code class="language-js">let x;\n</code></pre>'],
    ["~~~\nx\n~~~", "<pre><code>x\n</code></pre>"],
    ["````\n```\ninner\n```\n````", "<pre><code>```\ninner\n```\n</code></pre>"],
    ["```\nunclosed\n\nstill code", "<pre><code>unclosed\n\nstill code\n</code></pre>"],
    ["```\n# not a heading\n- not a list\n```", "<pre><code># not a heading\n- not a list\n</code></pre>"],
    ["```\n```", "<pre><code></code></pre>"],
    ["~~~\n```\n~~~", "<pre><code>```\n</code></pre>"],
  ]);
});

test("a language name cannot break out of the class attribute", () => {
  const html = render('```x" onmouseover="alert(1)\ncode\n```');
  assert.ok(!html.includes('onmouseover="'), html);
  assert.ok(html.startsWith("<pre><code"));
});

test("block quotes, including nesting", () => {
  check([
    ["> a\n> b", "<blockquote>\n<p>a\nb</p>\n</blockquote>"],
    [">a", "<blockquote>\n<p>a</p>\n</blockquote>"],
    ["> # h\n> text", "<blockquote>\n<h1>h</h1>\n<p>text</p>\n</blockquote>"],
    ["> a\n>> b", "<blockquote>\n<p>a</p>\n<blockquote>\n<p>b</p>\n</blockquote>\n</blockquote>"],
    ["> a\n\nb", "<blockquote>\n<p>a</p>\n</blockquote>\n<p>b</p>"],
  ]);
});

test("horizontal rules", () => {
  check([
    ["---", "<hr>"],
    ["***", "<hr>"],
    ["___", "<hr>"],
    ["- - -", "<hr>"],
    ["--", "<p>--</p>"],
    ["a\n---\nb", "<p>a</p>\n<hr>\n<p>b</p>"],
  ]);
});

test("tight lists", () => {
  check([
    ["- a\n- b", "<ul>\n<li>a</li>\n<li>b</li>\n</ul>"],
    ["* a\n* b", "<ul>\n<li>a</li>\n<li>b</li>\n</ul>"],
    ["+ a", "<ul>\n<li>a</li>\n</ul>"],
    ["1. a\n2. b", "<ol>\n<li>a</li>\n<li>b</li>\n</ol>"],
    ["3. a\n4. b", '<ol start="3">\n<li>a</li>\n<li>b</li>\n</ol>'],
    ["1) a\n2) b", "<ol>\n<li>a</li>\n<li>b</li>\n</ol>"],
    ["- **a** `b`", "<ul>\n<li><strong>a</strong> <code>b</code></li>\n</ul>"],
    ["- a\n  continued\n- b", "<ul>\n<li>a\ncontinued</li>\n<li>b</li>\n</ul>"],
    ["- a\nlazy\n- b", "<ul>\n<li>a\nlazy</li>\n<li>b</li>\n</ul>"],
  ]);
});

test("nested lists", () => {
  check([
    ["- a\n  - b\n  - c\n- d", "<ul>\n<li>a\n<ul>\n<li>b</li>\n<li>c</li>\n</ul>\n</li>\n<li>d</li>\n</ul>"],
    ["1. a\n   - b", "<ol>\n<li>a\n<ul>\n<li>b</li>\n</ul>\n</li>\n</ol>"],
  ]);
});

test("loose lists wrap items in paragraphs", () => {
  check([
    ["- a\n\n- b", "<ul>\n<li><p>a</p></li>\n<li><p>b</p></li>\n</ul>"],
    ["- a\n\n  more\n- b", "<ul>\n<li>\n<p>a</p>\n<p>more</p>\n</li>\n<li><p>b</p></li>\n</ul>"],
  ]);
});

test("a changed marker starts a new list; a paragraph ends a list", () => {
  check([
    ["- a\n+ b", "<ul>\n<li>a</li>\n</ul>\n<ul>\n<li>b</li>\n</ul>"],
    ["- a\n\npara", "<ul>\n<li>a</li>\n</ul>\n<p>para</p>"],
    ["para\n- a", "<p>para</p>\n<ul>\n<li>a</li>\n</ul>"],
    ["2. a\npara", "<ol start=\"2\">\n<li>a\npara</li>\n</ol>"],
  ]);
});

test("code and quotes inside list items", () => {
  check([
    ["- a\n\n  ```\n  x\n  ```", "<ul>\n<li>\n<p>a</p>\n<pre><code>x\n</code></pre>\n</li>\n</ul>"],
    ["- > q", "<ul>\n<li><blockquote>\n<p>q</p>\n</blockquote>\n</li>\n</ul>"],
  ]);
});

test("a mixed document", () => {
  const md = "# T\n\nIntro with `code`.\n\n- x\n- y\n\n> note\n\n---\n";
  assert.strictEqual(
    render(md),
    "<h1>T</h1>\n<p>Intro with <code>code</code>.</p>\n<ul>\n<li>x</li>\n<li>y</li>\n</ul>\n<blockquote>\n<p>note</p>\n</blockquote>\n<hr>\n"
  );
});

test("line endings: CRLF, CR and tabs", () => {
  assert.strictEqual(render("# a\r\n\r\nb\r\nc"), "<h1>a</h1>\n<p>b\nc</p>\n");
  assert.strictEqual(render("a\rb"), "<p>a\nb</p>\n");
  assert.strictEqual(render("- a\n\t- b"), "<ul>\n<li>a\n<ul>\n<li>b</li>\n</ul>\n</li>\n</ul>\n");
});

test("raw HTML is escaped, never passed through", () => {
  check([
    ["<script>alert(1)</script>", "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>"],
    ['<img src=x onerror="alert(1)">', "<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>"],
    ["a & b &amp; c", "<p>a &amp; b &amp;amp; c</p>"],
    ["# <b>x</b>", "<h1>&lt;b&gt;x&lt;/b&gt;</h1>"],
    ["> <i>q</i>", "<blockquote>\n<p>&lt;i&gt;q&lt;/i&gt;</p>\n</blockquote>"],
    ["- <u>l</u>", "<ul>\n<li>&lt;u&gt;l&lt;/u&gt;</li>\n</ul>"],
  ]);
});

test("safeUrl: schemes", () => {
  const ok = ["http://a.com", "HTTPS://a.com", "mailto:a@b.c", "ftp://a", "tel:+123", "/rel/path", "../up", "#frag", "?q=1", "page.html", "a:b" === "" ? "" : "dir/a:b"];
  for (const u of ok) assert.strictEqual(safeUrl(u), u, u);
  const bad = [
    "javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "java\nscript:alert(1)",
    "\u0001javascript:alert(1)", "data:text/html,<script>1</script>", "vbscript:x", "file:///etc/passwd", "blob:http://a", "about:blank",
  ];
  for (const u of bad) assert.strictEqual(safeUrl(u), "", JSON.stringify(u));
});

test("dangerous link and image targets are emptied, and quotes cannot end an attribute", () => {
  check([
    ["[x](javascript:alert(1))", '<p><a href="">x</a></p>'],
    ["![x](javascript:alert(1))", '<p><img src="" alt="x"></p>'],
    ["<javascript:alert(1)>", '<p><a href="">javascript:alert(1)</a></p>'],
    ['[x](a"onmouseover="alert(1))', '<p><a href="a&quot;onmouseover=&quot;alert(1)">x</a></p>'],
    // an escaped quote inside a title is not supported: the whole thing stays plain, escaped text
    ['[x](/a "t\\" onclick=\\"x")', "<p>[x](/a &quot;t&quot; onclick=&quot;x&quot;)</p>"],
  ]);
});

test("alt text and titles are escaped", () => {
  assert.strictEqual(render('![a "q" <b>](p.png "t<>")'), '<p><img src="p.png" alt="a &quot;q&quot; &lt;b&gt;" title="t&lt;&gt;"></p>\n');
});

test("no output ever contains a live script tag or event handler", () => {
  const nasty = [
    "<script>x</script>", "<img src=x onerror=alert(1)>", "[a](javascript:x)", "![a](javascript:x)",
    "`</code><script>x</script>`", "```\n</code></pre><script>x</script>\n```", "*<script>*", "**<svg onload=x>**",
    "[<script>](u)", "> <script>", "- <script>", "# <script>", "<a href='javascript:x'>y</a>",
    '[x](u "<script>")', "![<script>](u)", "\\<script>",
  ];
  for (const md of nasty) {
    const html = render(md);
    assert.ok(!/<script/i.test(html), md + " -> " + html);
    assert.ok(!/<(img|svg|a)\s[^>]*\son\w+=/i.test(html), md + " -> " + html);
    assert.ok(!/(href|src)="\s*javascript:/i.test(html), md + " -> " + html);
  }
});

test("random input never throws and never emits an unescaped angle bracket from text", () => {
  let seed = 1126;
  const rnd = (n) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const bits = ["*", "_", "`", "[", "]", "(", ")", "!", "<", ">", "\\", "#", "-", "1.", " ", "  \n", "\n", "\n\n", "a", "b c", "```", "~~~", "http://x", '"', "'", "&", "\t"];
  const allowed = /^(?:<\/?(?:p|em|strong|code|pre|a|img|ul|ol|li|blockquote|h[1-6]|hr|br)(?: [a-z-]+="[^"<>]*")*>)$/;
  for (let n = 0; n < 1500; n++) {
    const md = Array.from({ length: rnd(40) }, () => bits[rnd(bits.length)]).join("");
    const html = render(md);
    for (const tag of html.match(/<[^>]*>?/g) || []) {
      assert.ok(allowed.test(tag), `${JSON.stringify(md)} produced ${JSON.stringify(tag)}`);
    }
  }
});

test("inline is exported and escapes plain text", () => {
  assert.strictEqual(inline("a < b & c"), "a &lt; b &amp; c");
});

test("render: wrong type is a TypeError", () => {
  assert.throws(() => render(null), TypeError);
});

test("CLI: file and stdin", () => {
  assert.deepStrictEqual(run([], "# Hi\n"), { code: 0, out: "<h1>Hi</h1>\n", err: "" });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdhtml-"));
  const file = path.join(dir, "a.md");
  fs.writeFileSync(file, "- x\n- y\n");
  assert.strictEqual(run([file], "").out, "<ul>\n<li>x</li>\n<li>y</li>\n</ul>\n");
});

test("CLI: errors", () => {
  assert.strictEqual(run(["no-such-file.md"], "").code, 1);
  assert.strictEqual(run(["--nope"], "").code, 2);
  assert.strictEqual(run(["a", "b"], "").code, 2);
});
