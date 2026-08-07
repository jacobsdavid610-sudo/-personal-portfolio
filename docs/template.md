# template.js

A tiny mustache-style templating engine: `{{value}}` for HTML-escaped
substitution, `{{{value}}}` for raw/trusted HTML. No dependencies.

## Why

Most from-scratch templating snippets people write for a quick project skip
escaping entirely and end up vulnerable to injection the moment a value
comes from user input (a bio field, a comment, a query param). This one
escapes by default and makes "render raw HTML" an explicit, visible opt-in
(`{{{...}}}`) instead of the default — the safe path is the short path.

## Usage

```js
const { render } = require("./template.js");

render("Hello, {{name}}!", { name: "Ada" });
// "Hello, Ada!"

render("{{bio}}", { bio: "<script>alert(1)</script>" });
// "&lt;script&gt;alert(1)&lt;/script&gt;"  (escaped, safe to drop into HTML)

render("{{{trusted}}}", { trusted: "<strong>bold</strong>" });
// "<strong>bold</strong>"  (raw, only for content you already trust)

render("{{user.profile.name}}", { user: { profile: { name: "Grace" } } });
// "Grace"  (dotted paths reach into nested objects)
```

## Real example: escaping actually neutralizes an injection

```js
render(
  "<h1>Welcome, {{user.name}}</h1><p>Bio: {{user.bio}}</p><div>{{{trustedHtml}}}</div>",
  {
    user: { name: "Ada", bio: "<script>steal(document.cookie)</script>" },
    trustedHtml: "<strong>Verified account</strong>",
  }
);
```

Output:

```html
<h1>Welcome, Ada</h1><p>Bio: &lt;script&gt;steal(document.cookie)&lt;/script&gt;</p><div><strong>Verified account</strong></div>
```

The attacker-controlled `bio` is inert text in the output. The
`trustedHtml` value — because the caller explicitly chose `{{{...}}}` for
it — renders as real markup.

## Behavior notes

- Missing keys (including a path that hits `null`/`undefined` partway
  through, like `{{a.b.c}}` when `a.b` doesn't exist) render as an empty
  string rather than the literal text `"undefined"` or throwing.
- Non-string values (numbers, booleans) are stringified before escaping.
- `{{{raw}}}` is matched before `{{escaped}}` in the implementation, since a
  triple-brace expression also matches the double-brace pattern as a
  substring — getting this order backwards would corrupt raw output.
- This is intentionally *not* a full templating language: no loops,
  conditionals, or partials. Just safe variable substitution.

## Running the tests

```
node --test tests/test_template.js
```

9 tests, covering plain substitution, escaping of all five HTML-significant
characters, raw vs. escaped mixed in one template, nested dotted paths,
missing keys, and non-string values.
