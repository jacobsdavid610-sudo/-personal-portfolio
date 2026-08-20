#!/usr/bin/env node
// Line-based diff via longest common subsequence, printed unified-diff
// style. No dependencies.

/**
 * Computes the LCS-based edit script between two arrays of lines.
 * Returns an array of { type: "same"|"add"|"del", line }.
 */
function diffLines(a, b) {
  const n = a.length;
  const m = b.length;

  // dp[i][j] = length of the LCS of a[i:] and b[j:]
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "same", line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "del", line: a[i] });
      i++;
    } else {
      ops.push({ type: "add", line: b[j] });
      j++;
    }
  }
  while (i < n) {
    ops.push({ type: "del", line: a[i] });
    i++;
  }
  while (j < m) {
    ops.push({ type: "add", line: b[j] });
    j++;
  }

  return ops;
}

function formatUnified(ops, contextLines = 3) {
  const out = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].type === "same") {
      i++;
      continue;
    }
    const start = Math.max(0, i - contextLines);
    let end = i;
    while (end < ops.length) {
      if (ops[end].type !== "same") {
        end++;
        continue;
      }
      // Look ahead: is this a short "same" gap between two changes, or the
      // real end of this hunk?
      let lookahead = end;
      while (lookahead < ops.length && ops[lookahead].type === "same" && lookahead - end < contextLines) {
        lookahead++;
      }
      if (lookahead < ops.length && ops[lookahead].type !== "same") {
        end = lookahead;
        continue;
      }
      break;
    }
    const hunkEnd = Math.min(ops.length, end + contextLines);

    for (let k = start; k < hunkEnd; k++) {
      const op = ops[k];
      const prefix = op.type === "add" ? "+" : op.type === "del" ? "-" : " ";
      out.push(prefix + op.line);
    }
    i = hunkEnd;
  }
  return out;
}

function hasChanges(ops) {
  return ops.some((op) => op.type !== "same");
}

module.exports = { diffLines, formatUnified, hasChanges };

if (require.main === module) {
  const fs = require("fs");
  const [fileA, fileB] = process.argv.slice(2);
  if (!fileA || !fileB) {
    console.error("Usage: linediff.js <fileA> <fileB>");
    process.exit(2);
  }

  const splitLines = (text) => {
    if (text === "") return [];
    const lines = text.split("\n");
    // A trailing newline produces a phantom empty final element; drop it so
    // a file ending in a normal newline doesn't show a spurious extra line.
    if (lines[lines.length - 1] === "") lines.pop();
    return lines;
  };
  const a = splitLines(fs.readFileSync(fileA, "utf8"));
  const b = splitLines(fs.readFileSync(fileB, "utf8"));

  const ops = diffLines(a, b);
  if (!hasChanges(ops)) {
    process.exit(0);
  }
  console.log(`--- ${fileA}`);
  console.log(`+++ ${fileB}`);
  for (const line of formatUnified(ops)) {
    console.log(line);
  }
  process.exit(1);
}
