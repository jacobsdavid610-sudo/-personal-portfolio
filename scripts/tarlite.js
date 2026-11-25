#!/usr/bin/env node
"use strict";
// A small tar (ustar) reader and writer. It writes plain ustar, splitting long
// names into prefix + name the way tar does, and reads ustar plus the two
// common long-name extensions (GNU "L" entries and pax "x" headers). The
// extractor refuses names that would escape the target directory and never
// creates links. No dependencies.

const fs = require("node:fs");
const path = require("node:path");

const USAGE = `usage: tarlite.js c ARCHIVE PATH...    create ARCHIVE from files and directories
       tarlite.js t ARCHIVE            list the contents
       tarlite.js x ARCHIVE [-C DIR]   extract into DIR (default: current directory)

Exit 0 on success, 1 for a bad or unsafe archive or an I/O error, 2 for a
usage error. Links and special files are listed but never extracted.`;

const BLOCK = 512;
const MAX_OCTAL_11 = 0o77777777777; // largest size an 11-digit octal field holds

class TarError extends Error {}

// ---- helpers --------------------------------------------------------------

function octal(value, width) {
  const s = value.toString(8);
  if (s.length > width - 1) throw new TarError(`value ${value} does not fit in a ${width}-byte field`);
  return s.padStart(width - 1, "0") + "\0";
}

function putString(buf, offset, width, text) {
  const b = Buffer.from(text, "utf8");
  if (b.length > width) throw new TarError(`${JSON.stringify(text)} is too long for its field`);
  b.copy(buf, offset);
}

function readString(buf, offset, width) {
  const end = buf.indexOf(0, offset);
  const stop = end === -1 || end > offset + width ? offset + width : end;
  return buf.toString("utf8", offset, stop);
}

function readOctal(buf, offset, width, what) {
  if (buf[offset] & 0x80) throw new TarError(`${what}: base-256 numbers are not supported`);
  const text = buf.toString("latin1", offset, offset + width).replace(/[\0 ]+$/, "").replace(/^ +/, "");
  if (text === "") return 0;
  if (!/^[0-7]+$/.test(text)) throw new TarError(`${what}: bad octal field ${JSON.stringify(text)}`);
  return parseInt(text, 8);
}

function checksum(header) {
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : header[i];
  return sum;
}

function splitName(name) {
  if (Buffer.byteLength(name) <= 100) return ["", name];
  // The split has to fall on a "/", with at most 155 bytes before it and 100 after.
  for (let i = name.length - 1; i > 0; i--) {
    if (name[i] !== "/") continue;
    const prefix = name.slice(0, i);
    const rest = name.slice(i + 1);
    if (rest && Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(rest) <= 100) return [prefix, rest];
  }
  throw new TarError(`name too long for ustar: ${name}`);
}

// ---- write ----------------------------------------------------------------

// entries: { name, type: "file" | "dir", data?: Buffer|string, mode?, mtime? (seconds) }
function pack(entries) {
  const parts = [];
  for (const e of entries) {
    const isDir = e.type === "dir";
    if (e.type !== "file" && !isDir) throw new TarError(`unsupported entry type ${JSON.stringify(e.type)}`);
    let name = String(e.name).replace(/\\/g, "/");
    if (isDir && !name.endsWith("/")) name += "/";
    const data = isDir ? Buffer.alloc(0) : Buffer.from(e.data ?? "");
    if (data.length > MAX_OCTAL_11) throw new TarError(`${name}: file too large for ustar`);
    const [prefix, rest] = splitName(name);
    const h = Buffer.alloc(BLOCK);
    putString(h, 0, 100, rest);
    h.write(octal(e.mode ?? (isDir ? 0o755 : 0o644), 8), 100, "latin1");
    h.write(octal(0, 8), 108, "latin1");
    h.write(octal(0, 8), 116, "latin1");
    h.write(octal(data.length, 12), 124, "latin1");
    h.write(octal(Math.floor(e.mtime ?? 0), 12), 136, "latin1");
    h.write(isDir ? "5" : "0", 156, "latin1");
    h.write("ustar\0" + "00", 257, "latin1");
    putString(h, 345, 155, prefix);
    h.write(octal(checksum(h), 7) + " ", 148, "latin1"); // 6 digits, NUL, space
    parts.push(h);
    if (data.length) {
      parts.push(data);
      const pad = (BLOCK - (data.length % BLOCK)) % BLOCK;
      if (pad) parts.push(Buffer.alloc(pad));
    }
  }
  parts.push(Buffer.alloc(BLOCK * 2));
  return Buffer.concat(parts);
}

// ---- read -----------------------------------------------------------------

function parsePax(data) {
  const out = {};
  let i = 0;
  while (i < data.length) {
    const sp = data.indexOf(0x20, i);
    const len = Number(data.toString("latin1", i, sp));
    if (sp === -1 || !Number.isInteger(len) || len < 1 || i + len > data.length) throw new TarError("bad pax record");
    const record = data.toString("utf8", sp + 1, i + len - 1);
    const eq = record.indexOf("=");
    if (eq > 0) out[record.slice(0, eq)] = record.slice(eq + 1);
    i += len;
  }
  return out;
}

const TYPES = { "0": "file", "\0": "file", "7": "file", "5": "dir", "2": "symlink", "1": "hardlink" };

function unpack(archive) {
  const buf = Buffer.from(archive);
  const entries = [];
  let pos = 0;
  let longName = null;
  let pax = {};
  for (;;) {
    if (pos === buf.length) break; // tolerate a missing end marker
    if (pos + BLOCK > buf.length) throw new TarError("truncated archive: partial header block");
    const h = buf.subarray(pos, pos + BLOCK);
    pos += BLOCK;
    if (h.every((b) => b === 0)) break;
    const stored = readOctal(h, 148, 8, "checksum");
    const sum = checksum(h);
    let signed = 0;
    for (let i = 0; i < BLOCK; i++) signed += i >= 148 && i < 156 ? 32 : (h[i] << 24) >> 24;
    if (stored !== sum && stored !== signed) throw new TarError(`bad checksum at offset ${pos - BLOCK}`);
    let size = readOctal(h, 124, 12, "size");
    const flag = String.fromCharCode(h[156]);
    if (pax.size !== undefined && flag !== "x" && flag !== "g" && flag !== "L") {
      size = Number(pax.size); // a pax header may carry the real size of the entry that follows
      if (!Number.isSafeInteger(size) || size < 0) throw new TarError("bad pax size");
    }
    const end = pos + size;
    if (end > buf.length) throw new TarError("truncated archive: file data is cut short");
    const data = buf.subarray(pos, end);
    pos += Math.ceil(size / BLOCK) * BLOCK;
    if (flag === "L") {
      longName = readString(data, 0, data.length);
      continue;
    }
    if (flag === "x") {
      pax = { ...pax, ...parsePax(data) };
      continue;
    }
    if (flag === "g") continue;
    let name = readString(h, 0, 100);
    if (readString(h, 257, 6) === "ustar") {
      const prefix = readString(h, 345, 155);
      if (prefix) name = prefix + "/" + name;
    }
    if (longName !== null) name = longName;
    if (pax.path !== undefined) name = pax.path;
    longName = null;
    const type = TYPES[flag] ?? "other";
    const entry = {
      name,
      type,
      size: type === "file" ? size : 0,
      mode: readOctal(h, 100, 8, "mode"),
      mtime: readOctal(h, 136, 12, "mtime"),
    };
    if (type === "file") entry.data = Buffer.from(data);
    if (type === "symlink" || type === "hardlink") entry.linkname = pax.linkpath ?? readString(h, 157, 100);
    pax = {};
    entries.push(entry);
  }
  return entries;
}

// ---- safe extraction ------------------------------------------------------

// Returns the cleaned relative path, or throws if it could leave the target.
function safeName(name) {
  const s = name.replace(/\\/g, "/");
  if (s === "" || s.includes("\0")) throw new TarError(`unsafe name ${JSON.stringify(name)}`);
  if (s.startsWith("/") || /^[A-Za-z]:/.test(s)) throw new TarError(`absolute path in archive: ${name}`);
  const parts = s.split("/").filter((p) => p !== "" && p !== ".");
  if (parts.includes("..")) throw new TarError(`path escapes the target directory: ${name}`);
  if (parts.length === 0) throw new TarError(`unsafe name ${JSON.stringify(name)}`);
  return parts.join("/");
}

function extract(archive, dest, log = () => {}) {
  const entries = unpack(archive);
  // Validate every name before writing anything, so a bad archive leaves no partial tree.
  const plan = entries.map((e) => ({ e, rel: e.type === "file" || e.type === "dir" ? safeName(e.name) : null }));
  const root = path.resolve(dest);
  fs.mkdirSync(root, { recursive: true });
  for (const { e, rel } of plan) {
    if (rel === null) {
      log(`skipped ${e.type}: ${e.name}`);
      continue;
    }
    const target = path.resolve(root, ...rel.split("/"));
    if (target !== root && !target.startsWith(root + path.sep)) throw new TarError(`path escapes the target directory: ${e.name}`);
    if (e.type === "dir") {
      fs.mkdirSync(target, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, e.data);
    }
  }
  return plan.filter((p) => p.rel !== null).length;
}

// ---- create from disk and CLI ---------------------------------------------

function collect(p, out) {
  const st = fs.lstatSync(p);
  const name = p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (st.isDirectory()) {
    out.push({ name, type: "dir", mode: st.mode & 0o777, mtime: st.mtimeMs / 1000 });
    for (const child of fs.readdirSync(p).sort()) collect(path.join(p, child), out);
  } else if (st.isFile()) {
    out.push({ name, type: "file", data: fs.readFileSync(p), mode: st.mode & 0o777, mtime: st.mtimeMs / 1000 });
  } else {
    throw new TarError(`${p}: only regular files and directories can be archived`);
  }
}

function main(argv) {
  const [cmd, archive, ...rest] = argv;
  if (cmd === "-h" || cmd === "--help") {
    console.log(USAGE);
    return 0;
  }
  const usage = (msg) => {
    console.error(`${msg}\n${USAGE}`);
    return 2;
  };
  try {
    if (cmd === "c") {
      if (!archive || rest.length === 0) return usage("tarlite: c needs an archive and at least one path");
      const entries = [];
      for (const p of rest) collect(p, entries);
      fs.writeFileSync(archive, pack(entries));
      return 0;
    }
    if (cmd === "t") {
      if (!archive || rest.length) return usage("tarlite: t takes exactly one archive");
      for (const e of unpack(fs.readFileSync(archive))) {
        const mode = (e.mode & 0o777).toString(8).padStart(3, "0");
        console.log(`${e.type.padEnd(8)} ${mode} ${String(e.size).padStart(9)} ${e.name}`);
      }
      return 0;
    }
    if (cmd === "x") {
      let dest = ".";
      const args = [...rest];
      const i = args.indexOf("-C");
      if (i !== -1) {
        if (i + 1 >= args.length) return usage("tarlite: -C needs a directory");
        dest = args[i + 1];
        args.splice(i, 2);
      }
      if (!archive || args.length) return usage("tarlite: x takes an archive and an optional -C DIR");
      const n = extract(fs.readFileSync(archive), dest, (m) => console.error(`tarlite: ${m}`));
      console.log(`extracted ${n} entr${n === 1 ? "y" : "ies"}`);
      return 0;
    }
  } catch (err) {
    if (err instanceof TarError || err.code) {
      console.error(`tarlite: ${err.message}`);
      return 1;
    }
    throw err;
  }
  return usage(cmd ? `tarlite: unknown command ${cmd}` : "tarlite: missing command");
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { pack, unpack, extract, safeName, TarError };
