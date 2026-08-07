const test = require("node:test");
const assert = require("node:assert");
const { render, escapeHtml, lookup } = require("../scripts/template.js");

test("substitutes a simple value", () => {
  assert.strictEqual(render("Hello, {{name}}!", { name: "Ada" }), "Hello, Ada!");
});

test("escapes HTML-significant characters by default", () => {
  const out = render("{{bio}}", { bio: '<script>alert("hi")</script>' });
  assert.strictEqual(out, "&lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt;");
});

test("triple braces render raw, unescaped HTML", () => {
  const out = render("{{{html}}}", { html: "<b>bold</b>" });
  assert.strictEqual(out, "<b>bold</b>");
});

test("supports dotted paths into nested objects", () => {
  const out = render("{{user.profile.name}}", { user: { profile: { name: "Grace" } } });
  assert.strictEqual(out, "Grace");
});

test("missing keys render as empty string, not 'undefined'", () => {
  assert.strictEqual(render("[{{missing}}]", {}), "[]");
  assert.strictEqual(render("[{{a.b.c}}]", { a: {} }), "[]");
});

test("renders multiple placeholders, mixing escaped and raw", () => {
  const out = render("{{name}} says {{{html}}} ({{escaped}})", {
    name: "Bob",
    html: "<i>hi</i>",
    escaped: "<i>hi</i>",
  });
  assert.strictEqual(out, "Bob says <i>hi</i> (&lt;i&gt;hi&lt;/i&gt;)");
});

test("escapeHtml escapes all five HTML-significant characters", () => {
  assert.strictEqual(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
});

test("lookup returns undefined when it hits a null/undefined partway through the path", () => {
  assert.strictEqual(lookup({ a: null }, "a.b.c"), undefined);
  assert.strictEqual(lookup({}, "a.b"), undefined);
});

test("non-string values are stringified before escaping", () => {
  assert.strictEqual(render("{{count}}", { count: 42 }), "42");
  assert.strictEqual(render("{{ok}}", { ok: false }), "false");
});
