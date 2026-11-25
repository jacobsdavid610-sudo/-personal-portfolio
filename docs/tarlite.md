# tarlite.js

A small tar reader and writer. It writes plain ustar archives, reads ustar plus
the two common long-name extensions, and its extractor refuses any name that
could land outside the target directory. No dependencies.

## Why

tar is the format everything else gets wrapped in, and its quirks are
instructive: 512-byte blocks, numbers written as octal text, a checksum that
includes itself, and a 100-byte name field that had to be patched twice
(ustar's prefix field, then GNU and pax extensions). I also wanted an extractor
I could read in one sitting, because "unpack an archive someone else made" is
where path traversal bugs live.

## API

```js
const { pack, unpack, extract, safeName, TarError } = require("./scripts/tarlite.js");

const tar = pack([
  { name: "proj", type: "dir" },
  { name: "proj/a.txt", type: "file", data: "hello\n", mode: 0o644, mtime: 1700000000 },
]);                                  // Buffer, ends with two zero blocks

unpack(tar);   // [{ name: "proj/", type: "dir", ... }, { name: "proj/a.txt", type: "file", size: 6, data: <Buffer>, mode, mtime }]
extract(tar, "out", (msg) => console.error(msg));   // writes into ./out, returns the number of entries written
safeName("a/./b//c");                // "a/b/c"
safeName("../x");                    // throws TarError
```

Entry types on reading are `file`, `dir`, `symlink` (with `linkname`),
`hardlink` and `other`. `pack` only writes `file` and `dir`.

## CLI usage

```
tarlite.js c ARCHIVE PATH...     create ARCHIVE from files and directories
tarlite.js t ARCHIVE             list the contents
tarlite.js x ARCHIVE [-C DIR]    extract into DIR (default: current directory)
```

## Real example

```
$ node scripts/tarlite.js c out.tar proj
$ node scripts/tarlite.js t out.tar
dir      666         0 proj/
file     666         6 proj/a.txt
dir      666         0 proj/sub/
file     666         6 proj/sub/b.txt
$ tar -tf out.tar          # GNU tar agrees
proj/
proj/a.txt
proj/sub/
proj/sub/b.txt
$ node scripts/tarlite.js x out.tar -C ex
extracted 4 entries
```

(Modes show as 666 here because Windows doesn't keep Unix permissions.)

## Exit codes

- `0` - success.
- `1` - an invalid, truncated or unsafe archive, or an I/O error.
- `2` - usage error.

## Design notes

- **Header layout.** Fixed offsets in a 512-byte block: name, mode, uid, gid,
  size, mtime, checksum, type flag, link name, `ustar\0` + version, user and
  group names, device numbers and a 155-byte prefix. Numbers are octal
  ASCII, NUL-terminated.
- **The checksum includes itself.** It is the sum of every byte of the header
  with the checksum field counted as eight spaces, written as six octal digits,
  a NUL and a space. The reader also accepts the signed-byte sum some old tars
  wrote.
- **Long names.** A name over 100 bytes is split at a `/` into prefix (up to
  155 bytes) and name (up to 100). Lengths are bytes, not characters, so
  `é` counts as two. If no split works the write fails rather than truncating.
  Reading also understands GNU `L` entries and pax `path`, `size` and
  `linkpath` records, which is what GNU tar writes for longer names.
- **Extraction is checked up front.** Every name is validated before anything
  is written, so a bad archive leaves no half-extracted tree. Absolute paths,
  drive letters, NUL bytes and any `..` segment are refused, `.` and empty
  segments are dropped, and a final check confirms the resolved path is still
  inside the target.
- **No links.** Symlinks, hard links, devices and FIFOs are listed and skipped
  with a message, never created. That is what stops a symlink followed by a
  file written "through" it.
- **Limits.** Sizes above 8 GiB (the 11-digit octal limit) and base-256
  numbers are rejected rather than half-supported.

## Running the tests

```
node --test tests/test_tarlite.js
```

27 tests: round trips, every size around a block boundary, the long-name
split at 100/101 bytes, non-ASCII names, corrupt checksums, truncation, bad
octal and base-256 fields, hand-built GNU `L` and pax headers, links, a table
of path-traversal names, a traversal archive that must write nothing, the CLI,
and (when GNU `tar` is installed) interop both ways: GNU tar listing and
extracting what tarlite writes, and tarlite reading ustar, GNU, pax and v7
archives that GNU tar writes.
