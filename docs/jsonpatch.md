# jsonpatch.js

JSON Pointer (RFC 6901) and JSON Patch (RFC 6902) in one file, plus a `diff`
that builds a patch from two documents. `apply` never modifies its input and
is all-or-nothing. No dependencies.

## Why

A patch is a small, replayable description of a change, which makes it a good
format for "what did this config edit actually do?" I wanted the exact RFC
semantics (the array-index rules, `move` ordering, `test`) in something short
enough to read in one sitting, and a `diff` so the two halves check each other.

## API

```js
const { apply, diff, get } = require("./scripts/jsonpatch.js");

apply({ a: 1 }, [{ op: "add", path: "/b", value: [1, 2] }]);
// { a: 1, b: [1, 2] }

diff({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 });
// [ { op: "replace", path: "/b", value: 3 }, { op: "add", path: "/c", value: 4 } ]

get({ "a/b": [10, 20] }, "/a~1b/1");   // 20
```

- `apply(doc, patch)` returns a new document. It throws `PatchError`, with the
  index of the failing operation in the message, and nothing is half-applied.
- `diff(a, b)` returns a patch such that `apply(a, diff(a, b))` equals `b`.
- `get(doc, pointer)`, `parsePointer`, `formatPointer` and `equal` (deep JSON
  equality, key order ignored) are exported too.

Operations: `add`, `remove`, `replace`, `move`, `copy`, `test`. Unknown extra
members on an operation are ignored, as the RFC says.

## CLI usage

```
jsonpatch.js apply DOC.json PATCH.json
jsonpatch.js diff  OLD.json NEW.json
```

Either file can be `-` for stdin (not both). The result is printed as JSON.

## Real example

```
$ cat doc.json
{"name": "app", "tags": ["a", "b"]}
$ cat patch.json
[{"op": "test", "path": "/name", "value": "app"},
 {"op": "add", "path": "/tags/-", "value": "c"},
 {"op": "move", "from": "/name", "path": "/title"}]
$ node scripts/jsonpatch.js apply doc.json patch.json
{
  "tags": ["a", "b", "c"],
  "title": "app"
}

$ echo '[{"op":"test","path":"/name","value":"other"}]' | node scripts/jsonpatch.js apply doc.json -
jsonpatch: operation 0: test failed at /name
```

(The real output is pretty-printed with one array element per line.)

## Exit codes

- `0` - success.
- `1` - the patch failed (including a failed `test`), or a file could not be
  read or parsed.
- `2` - usage error.

## Design notes

- **Pointers.** `~1` becomes `/` and then `~0` becomes `~`, in that order, so
  `~01` means the literal text `~1`. A pointer must be empty or start with `/`.
- **Array indices are strict.** Only `0` or digits with no leading zero. `-`
  means "one past the end" and is allowed only when adding. An index past the
  end is an error rather than being clamped.
- **Lookups use own properties only.** `/constructor` and `/length` are "not
  found", not the inherited function or the array length.
- **`__proto__` is ordinary data.** Values are written with
  `Object.defineProperty`, so a patch can't swap an object's prototype. Cloning
  does the same, so a document parsed from JSON with a `__proto__` key stays
  safe.
- **`move` removes first, then adds.** That is what the RFC specifies, and it
  matters for arrays: moving index 0 to index 2 of `[1,2,3,4]` gives
  `[2,3,1,4]`. Moving a value into one of its own children is refused.
- **Values are cloned in.** The patch can't end up aliased inside the result,
  so a later operation can't change the patch you passed in.
- **`diff` is simple, not minimal.** Objects are compared key by key. Arrays
  are compared by position, with extra tail elements removed from the end first
  so indices stay valid. It never emits `move` or `copy`. A change of type
  becomes a `replace`.

## Running the tests

```
node --test tests/test_jsonpatch.js
```

42 tests: every example in RFC 6901 section 5 and RFC 6902 appendix A,
canonical-index rules, pointer escapes, the root-document cases, immutability
of the inputs, the all-or-nothing behaviour, `__proto__`, malformed operations,
and `diff`. A fuzz of 2,000 random document pairs checks that
`apply(a, diff(a, b))` equals `b` and that `a` is left untouched. The CLI is
covered for files, stdin, a failed patch and bad usage.
