import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from jsonschema_lite import SchemaError, validate  # noqa: E402


class TypeTest(unittest.TestCase):
    def test_matching_type_passes(self):
        self.assertEqual(validate("hi", {"type": "string"}), [])
        self.assertEqual(validate(5, {"type": "integer"}), [])
        self.assertEqual(validate(5.5, {"type": "number"}), [])
        self.assertEqual(validate(True, {"type": "boolean"}), [])
        self.assertEqual(validate(None, {"type": "null"}), [])
        self.assertEqual(validate([1, 2], {"type": "array"}), [])
        self.assertEqual(validate({"a": 1}, {"type": "object"}), [])

    def test_mismatched_type_reports_expected_and_actual(self):
        errors = validate(5, {"type": "string"})
        self.assertEqual(errors, ["$: expected type 'string', got 'integer'"])

    def test_bool_is_not_accepted_as_integer_or_number(self):
        self.assertNotEqual(validate(True, {"type": "integer"}), [])
        self.assertNotEqual(validate(True, {"type": "number"}), [])

    def test_integer_is_accepted_as_number(self):
        self.assertEqual(validate(5, {"type": "number"}), [])

    def test_union_type_accepts_either(self):
        schema = {"type": ["string", "null"]}
        self.assertEqual(validate("hi", schema), [])
        self.assertEqual(validate(None, schema), [])
        self.assertNotEqual(validate(5, schema), [])

    def test_unknown_type_in_schema_raises_schema_error(self):
        with self.assertRaises(SchemaError):
            validate(5, {"type": "not-a-real-type"})


class EnumTest(unittest.TestCase):
    def test_value_in_enum_passes(self):
        self.assertEqual(validate("admin", {"enum": ["admin", "user"]}), [])

    def test_value_not_in_enum_fails(self):
        errors = validate("root", {"enum": ["admin", "user"]})
        self.assertEqual(len(errors), 1)
        self.assertIn("not one of", errors[0])


class StringConstraintTest(unittest.TestCase):
    def test_min_and_max_length(self):
        schema = {"type": "string", "minLength": 2, "maxLength": 4}
        self.assertEqual(validate("abc", schema), [])
        self.assertNotEqual(validate("a", schema), [])
        self.assertNotEqual(validate("abcde", schema), [])

    def test_pattern_match_and_mismatch(self):
        schema = {"type": "string", "pattern": r"^\d{3}-\d{4}$"}
        self.assertEqual(validate("555-1234", schema), [])
        self.assertNotEqual(validate("not-a-number", schema), [])


class NumberConstraintTest(unittest.TestCase):
    def test_minimum_and_maximum(self):
        schema = {"type": "number", "minimum": 0, "maximum": 100}
        self.assertEqual(validate(50, schema), [])
        self.assertNotEqual(validate(-1, schema), [])
        self.assertNotEqual(validate(101, schema), [])


class ArrayTest(unittest.TestCase):
    def test_items_schema_applied_to_each_element(self):
        schema = {"type": "array", "items": {"type": "integer"}}
        self.assertEqual(validate([1, 2, 3], schema), [])
        errors = validate([1, "two", 3], schema)
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0], "$[1]: expected type 'integer', got 'string'")

    def test_min_and_max_length_apply_to_arrays_too(self):
        schema = {"type": "array", "minLength": 1, "maxLength": 2}
        self.assertEqual(validate([1], schema), [])
        self.assertNotEqual(validate([], schema), [])
        self.assertNotEqual(validate([1, 2, 3], schema), [])


class ObjectTest(unittest.TestCase):
    def setUp(self):
        self.schema = {
            "type": "object",
            "required": ["name", "age"],
            "properties": {
                "name": {"type": "string", "minLength": 1},
                "age": {"type": "integer", "minimum": 0},
                "role": {"type": "string", "enum": ["admin", "user"]},
            },
            "additionalProperties": False,
        }

    def test_valid_object_passes(self):
        instance = {"name": "Ada", "age": 30, "role": "admin"}
        self.assertEqual(validate(instance, self.schema), [])

    def test_missing_required_property_is_reported(self):
        errors = validate({"age": 30}, self.schema)
        self.assertIn("$: missing required property 'name'", errors)

    def test_nested_property_error_includes_dotted_path(self):
        errors = validate({"name": "", "age": 30}, self.schema)
        self.assertIn("$.name: length 0 is less than minLength 1", errors)

    def test_additional_property_rejected_when_disallowed(self):
        errors = validate({"name": "Ada", "age": 30, "extra": 1}, self.schema)
        self.assertIn("$: additional property 'extra' is not allowed", errors)

    def test_additional_properties_allowed_by_default(self):
        schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        self.assertEqual(validate({"name": "Ada", "extra": 1}, schema), [])

    def test_multiple_errors_are_all_reported_together(self):
        errors = validate({"name": "", "age": -1, "role": "root"}, self.schema)
        self.assertEqual(len(errors), 3)

    def test_deeply_nested_object_and_array_of_objects(self):
        schema = {
            "type": "object",
            "properties": {
                "users": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["id"],
                        "properties": {"id": {"type": "integer"}},
                    },
                }
            },
        }
        instance = {"users": [{"id": 1}, {"name": "no id"}]}
        errors = validate(instance, schema)
        self.assertEqual(errors, ["$.users[1]: missing required property 'id'"])


if __name__ == "__main__":
    unittest.main()
