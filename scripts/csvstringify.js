#!/usr/bin/env node
// RFC 4180 CSV writer, the counterpart to csvparse.js: quotes a field only
// when it actually needs it (contains the delimiter, a double quote, or a
// line break), and doubles embedded quotes. No dependencies.

const fs = require("node:fs");

const NEEDS_QUOTING_RE = /[",\r\n]/;

function quoteField(value) {
  const str = value === null || value === undefined ? "" : String(value);
  if (!NEEDS_QUOTING_RE.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

function stringifyRow(fields) {
  return fields.map(quoteField).join(",");
}

function stringify(rows, { lineTerminator = "\r\n" } = {}) {
  if (rows.length === 0) return "";
  return rows.map(stringifyRow).join(lineTerminator) + lineTerminator;
}

function fromObjects(records, headers) {
  const cols = headers || collectHeaders(records);
  const rows = [cols];
  for (const record of records) {
    rows.push(cols.map((col) => (record[col] === undefined ? "" : record[col])));
  }
  return rows;
}

function collectHeaders(records) {
  const seen = new Set();
  const headers = [];
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  return headers;
}

function stringifyObjects(records, headers, options) {
  return stringify(fromObjects(records, headers), options);
}

function main(argv) {
  const args = argv.slice(2);
  const headersArg = args.find((a) => a.startsWith("--headers="));
  const headers = headersArg ? headersArg.slice("--headers=".length).split(",") : undefined;
  const filePath = args.find((a) => !a.startsWith("--"));

  if (!filePath) {
    console.error("Usage: csvstringify.js <file.json> [--headers=a,b,c]");
    return 1;
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (data.length === 0) {
    return 0;
  }

  const text = Array.isArray(data[0]) ? stringify(data) : stringifyObjects(data, headers);
  process.stdout.write(text);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { quoteField, stringifyRow, stringify, fromObjects, stringifyObjects };
