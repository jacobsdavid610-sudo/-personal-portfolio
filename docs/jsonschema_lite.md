# jsonschema_lite.py

A minimal JSON-Schema-style validator: `type`, `enum`, `required`,
`properties`, `items`, `minLength`/`maxLength`, `minimum`/`maximum`,
`pattern`, `additionalProperties`. Pure stdlib, no `jsonschema` dependency.

## Why

Validating an API payload or config file by hand usually turns into a pile
of `if "name" not in data or not isinstance(data["name"], str): ...` checks
that are easy to get subtly wrong (an `int` sneaking past a `str` check
because it was never tested, a `bool` silently passing an `int` check since
`bool` is a subclass of `int` in Python). A small declarative schema fixes
the check once and reports every problem at once instead of failing on the
first `KeyError` three functions later.

## API

```python
from jsonschema_lite import validate

schema = {
    "type": "object",
    "required": ["name", "age"],
    "properties": {
        "name": {"type": "string", "minLength": 1},
        "age": {"type": "integer", "minimum": 0},
        "role": {"type": "string", "enum": ["admin", "user"]},
    },
    "additionalProperties": False,
}

validate({"name": "Ada", "age": 30, "role": "admin"}, schema)
# [] - valid

validate({"name": "", "age": -1, "role": "root", "extra": 1}, schema)
# ["$.name: length 0 is less than minLength 1",
#  "$.age: -1 is less than minimum 0",
#  "$.role: 'root' is not one of ['admin', 'user']",
#  "$: additional property 'extra' is not allowed"]
```

- `validate(instance, schema) -> list[str]` — every violation, not just the
  first. Empty list means valid.
- `is_valid(instance, schema) -> bool` — shorthand for `not validate(...)`.
- Nested errors are pathed from `$` (`$.user.roles[0]`), following the
  actual location of the bad value through objects and arrays.
- A malformed schema (an unrecognized `"type"`) raises `SchemaError`
  instead of silently passing everything.

## CLI usage

```
jsonschema_lite.py <instance.json> <schema.json>
```

Prints `valid` and exits `0` if the instance matches the schema; otherwise
prints one error per line and exits `1`.

## Real example

```
$ cat schema.json
{"type": "object", "required": ["name", "age"],
 "properties": {"name": {"type": "string", "minLength": 1},
                 "age": {"type": "integer", "minimum": 0}},
 "additionalProperties": false}

$ cat sample.json
{"name": "Ada", "age": 30, "tags": ["x"]}

$ jsonschema_lite.py sample.json schema.json
$: additional property 'tags' is not allowed
$ echo $?
1
```

## Design notes

- **`bool` is never accepted as `integer` or `number`**, even though
  Python's `bool` is technically an `int` subclass — `isinstance(True, int)`
  is `True`, and a schema check that didn't guard against this would let a
  stray `True`/`False` through a numeric field.
- **Type checks short-circuit the rest of that node's checks.** If a value
  fails `type`, there's no point also reporting `minimum`/`pattern`/etc.
  against a value of the wrong shape — that's noise, not signal.
- **`minLength`/`maxLength` apply to both strings and arrays** (by `len()`),
  matching real JSON Schema, rather than having separate `minItems` — kept
  it to one pair of keywords since this is meant to stay small.
- Only `additionalProperties: false` is checked explicitly; any other value
  (including it being absent) allows extra keys, which is the common case
  for permissive APIs.

## Exit codes

`0` if the instance is valid against the schema, `1` if there are any
validation errors, non-zero (uncaught exception) on a malformed schema or
unreadable file.

## Running the tests

```
python -m unittest tests.test_jsonschema_lite -v
```

20 tests: every `type` value passing and a mismatch reporting expected vs.
actual, `bool` correctly rejected for `integer`/`number`, `integer`
accepted for `number`, union types (`["string", "null"]`), an unknown type
raising `SchemaError`, enum pass/fail, string `minLength`/`maxLength` and
`pattern`, numeric `minimum`/`maximum`, array `items` validation with the
index in the error path, array length limits, a valid object, a missing
required property, a nested dotted-path error, `additionalProperties:
false` rejecting an extra key (and the default allowing it), multiple
errors all reported together instead of stopping at the first, and a
deeply nested array-of-objects case.
