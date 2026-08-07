// Tiny mustache-style templating engine. No dependencies.
//
// {{path.to.value}}   -> HTML-escaped substitution (safe by default)
// {{{path.to.value}}} -> raw, unescaped substitution (opt-in, for trusted HTML)
// Missing keys render as an empty string, not "undefined" or a thrown error.

const ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

function lookup(context, path) {
  const parts = path.trim().split(".");
  let value = context;
  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    value = value[part];
  }
  return value;
}

function render(template, context) {
  // {{{raw}}} must be matched before {{escaped}}, since {{{x}}} also
  // matches the {{...}} pattern on a substring.
  return template
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_match, path) => {
      const value = lookup(context, path);
      return value === undefined ? "" : String(value);
    })
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path) => {
      const value = lookup(context, path);
      return value === undefined ? "" : escapeHtml(value);
    });
}

module.exports = { render, escapeHtml, lookup };
