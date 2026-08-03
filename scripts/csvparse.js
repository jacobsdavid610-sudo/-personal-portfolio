#!/usr/bin/env node
// RFC 4180 CSV parser: handles quoted fields containing commas, embedded
// newlines, and escaped quotes ("" inside a quoted field). No dependencies.

const fs = require("node:fs");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === ",") {
      endField();
      i += 1;
    } else if (ch === "\r" && text[i + 1] === "\n") {
      endRow();
      i += 2;
    } else if (ch === "\n" || ch === "\r") {
      endRow();
      i += 1;
    } else {
      field += ch;
      i += 1;
    }
  }

  // Trailing field/row, unless the input ended cleanly on a newline.
  if (field !== "" || row.length > 0) {
    endRow();
  }

  return rows;
}

function toObjects(rows) {
  if (rows.length === 0) return [];
  const [header, ...rest] = rows;
  return rest.map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx]])));
}

function main(argv) {
  const args = argv.slice(2);
  const asJson = args.includes("--json");
  const filePath = args.find((a) => !a.startsWith("--"));

  if (!filePath) {
    console.error("Usage: csvparse.js <file.csv> [--json]");
    return 1;
  }

  const text = fs.readFileSync(filePath, "utf8");
  const rows = parseCsv(text);

  if (asJson) {
    console.log(JSON.stringify(toObjects(rows), null, 2));
  } else {
    for (const row of rows) {
      console.log(JSON.stringify(row));
    }
  }
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { parseCsv, toObjects };
