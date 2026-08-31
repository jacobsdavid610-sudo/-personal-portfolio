#!/usr/bin/env node
// Render tabular data as a bordered ASCII table for CLI output. No
// dependencies.

/**
 * Renders `rows` (array of objects) as a bordered ASCII table.
 * `columns` (optional) controls column order/selection and headers; if
 * omitted, columns are inferred from the keys of the first row, in
 * insertion order. Every cell is stringified via String(value), with
 * null/undefined rendered as an empty string.
 *
 * @param {object[]} rows
 * @param {(string|{key: string, header?: string})[]} [columns]
 */
function renderTable(rows, columns) {
  if (rows.length === 0 && !columns) return "(no rows)";

  const cols = (columns || Object.keys(rows[0] || {})).map((c) =>
    typeof c === "string" ? { key: c, header: c } : { key: c.key, header: c.header ?? c.key }
  );

  const cellText = (value) => (value === null || value === undefined ? "" : String(value));

  const widths = cols.map((col) => {
    const headerWidth = col.header.length;
    const cellWidths = rows.map((row) => cellText(row[col.key]).length);
    return Math.max(headerWidth, ...cellWidths, 0);
  });

  const pad = (text, width) => text + " ".repeat(width - text.length);

  const border = "+" + widths.map((w) => "-".repeat(w + 2)).join("+") + "+";

  const formatRow = (cells) =>
    "|" + cells.map((text, i) => ` ${pad(text, widths[i])} `).join("|") + "|";

  const lines = [border];
  lines.push(formatRow(cols.map((c) => c.header)));
  lines.push(border);
  for (const row of rows) {
    lines.push(formatRow(cols.map((c) => cellText(row[c.key]))));
  }
  // With zero data rows, the header-separator border and this closing
  // border would be identical, adjacent lines - skip the redundant one.
  if (rows.length > 0) {
    lines.push(border);
  }

  return lines.join("\n");
}

module.exports = { renderTable };

if (require.main === module) {
  const fs = require("fs");
  const file = process.argv[2];
  const text = file ? fs.readFileSync(file, "utf8") : fs.readFileSync(0, "utf8");

  let rows;
  try {
    rows = JSON.parse(text);
  } catch (err) {
    console.error(`Invalid JSON input: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(rows)) {
    console.error("Input must be a JSON array of objects");
    process.exit(1);
  }

  console.log(renderTable(rows));
}
