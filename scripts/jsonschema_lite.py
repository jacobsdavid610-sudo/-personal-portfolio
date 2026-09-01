#!/usr/bin/env python3
"""Minimal JSON-Schema-style validator: type, enum, required, properties,
items, minLength/maxLength, minimum/maximum, pattern, additionalProperties.
Pure stdlib, no jsonschema dependency.
"""

import re


class SchemaError(ValueError):
    pass


def validate(instance, schema):
    """Validate instance against schema, returning a list of error strings
    (empty means valid). Never raises on a bad instance - only on a
    malformed schema (e.g. an unknown "type")."""
    errors = []
    _validate(instance, schema, "$", errors)
    return errors


def is_valid(instance, schema):
    return not validate(instance, schema)


def _check_type(value, type_name):
    if type_name == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if type_name == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if type_name == "string":
        return isinstance(value, str)
    if type_name == "boolean":
        return isinstance(value, bool)
    if type_name == "null":
        return value is None
    if type_name == "array":
        return isinstance(value, list)
    if type_name == "object":
        return isinstance(value, dict)
    raise SchemaError(f"unknown type {type_name!r} in schema")


def _type_name_of(value):
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if value is None:
        return "null"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def _validate(value, schema, path, errors):
    if "type" in schema:
        types = schema["type"]
        types = [types] if isinstance(types, str) else types
        if not any(_check_type(value, t) for t in types):
            expected = " or ".join(types)
            errors.append(f"{path}: expected type '{expected}', got '{_type_name_of(value)}'")
            return  # further checks would just be noise against the wrong type

    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: {value!r} is not one of {schema['enum']!r}")

    if isinstance(value, (str, list)):
        length = len(value)
        if "minLength" in schema and length < schema["minLength"]:
            errors.append(f"{path}: length {length} is less than minLength {schema['minLength']}")
        if "maxLength" in schema and length > schema["maxLength"]:
            errors.append(f"{path}: length {length} is greater than maxLength {schema['maxLength']}")

    if isinstance(value, str) and "pattern" in schema:
        if re.search(schema["pattern"], value) is None:
            errors.append(f"{path}: {value!r} does not match pattern {schema['pattern']!r}")

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{path}: {value} is less than minimum {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{path}: {value} is greater than maximum {schema['maximum']}")

    if isinstance(value, list) and "items" in schema:
        for i, item in enumerate(value):
            _validate(item, schema["items"], f"{path}[{i}]", errors)

    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                errors.append(f"{path}: missing required property '{key}'")

        properties = schema.get("properties", {})
        for key, subschema in properties.items():
            if key in value:
                _validate(value[key], subschema, f"{path}.{key}", errors)

        if schema.get("additionalProperties") is False:
            for key in sorted(set(value) - set(properties)):
                errors.append(f"{path}: additional property '{key}' is not allowed")


def main():
    import argparse
    import json
    import sys

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("instance", help="path to the JSON file to validate")
    parser.add_argument("schema", help="path to the JSON schema file")
    args = parser.parse_args()

    with open(args.instance) as f:
        instance = json.load(f)
    with open(args.schema) as f:
        schema = json.load(f)

    errors = validate(instance, schema)
    if not errors:
        print("valid")
        return

    for error in errors:
        print(error)
    sys.exit(1)


if __name__ == "__main__":
    main()
