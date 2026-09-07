import os
import random
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from semver import InvalidVersion, Version, compare, sort_versions  # noqa: E402


class ParseTest(unittest.TestCase):
    def test_basic_major_minor_patch(self):
        v = Version.parse("1.2.3")
        self.assertEqual((v.major, v.minor, v.patch), (1, 2, 3))
        self.assertEqual(v.prerelease, ())
        self.assertIsNone(v.build)

    def test_prerelease_is_split_on_dots(self):
        v = Version.parse("1.2.3-alpha.1")
        self.assertEqual(v.prerelease, ("alpha", "1"))

    def test_build_metadata_is_captured(self):
        v = Version.parse("1.2.3+build.5")
        self.assertEqual(v.build, "build.5")

    def test_prerelease_and_build_together(self):
        v = Version.parse("1.2.3-rc.1+exp.sha.5114f85")
        self.assertEqual(v.prerelease, ("rc", "1"))
        self.assertEqual(v.build, "exp.sha.5114f85")

    def test_missing_patch_is_invalid(self):
        with self.assertRaises(InvalidVersion):
            Version.parse("1.2")

    def test_leading_zero_in_a_numeric_component_is_invalid(self):
        with self.assertRaises(InvalidVersion):
            Version.parse("01.2.3")

    def test_negative_or_non_numeric_component_is_invalid(self):
        with self.assertRaises(InvalidVersion):
            Version.parse("-1.2.3")
        with self.assertRaises(InvalidVersion):
            Version.parse("a.b.c")

    def test_str_round_trips_the_original_form(self):
        for text in ("1.2.3", "1.2.3-alpha.1", "1.2.3+build.5", "1.2.3-rc.1+exp.sha.5114f85"):
            self.assertEqual(str(Version.parse(text)), text)


class CompareTest(unittest.TestCase):
    def test_major_minor_patch_compare_numerically(self):
        self.assertEqual(compare("1.2.3", "1.2.4"), -1)
        self.assertEqual(compare("2.0.0", "1.9.9"), 1)
        self.assertEqual(compare("1.2.3", "1.2.3"), 0)

    def test_a_prerelease_version_has_lower_precedence_than_the_same_release(self):
        self.assertEqual(compare("1.0.0-alpha", "1.0.0"), -1)
        self.assertEqual(compare("1.0.0", "1.0.0-alpha"), 1)

    def test_numeric_prerelease_identifiers_compare_numerically_not_lexically(self):
        # Lexical comparison would put "11" before "2".
        self.assertEqual(compare("1.0.0-beta.2", "1.0.0-beta.11"), -1)

    def test_alphanumeric_identifiers_outrank_numeric_ones_at_the_same_position(self):
        self.assertEqual(compare("1.0.0-alpha.1", "1.0.0-alpha.beta"), -1)

    def test_more_prerelease_fields_outrank_fewer_when_the_prefix_matches(self):
        self.assertEqual(compare("1.0.0-alpha", "1.0.0-alpha.1"), -1)

    def test_build_metadata_is_ignored_for_precedence(self):
        self.assertEqual(compare("1.0.0+build1", "1.0.0+build2"), 0)
        self.assertEqual(compare("1.0.0-rc.1+a", "1.0.0-rc.1+b"), 0)

    def test_versions_are_directly_orderable_as_objects(self):
        self.assertTrue(Version.parse("1.0.0") > Version.parse("1.0.0-rc.1"))
        self.assertTrue(Version.parse("1.0.0-alpha") < Version.parse("1.0.0-alpha.1"))
        self.assertEqual(Version.parse("1.0.0+a"), Version.parse("1.0.0+b"))


class SortTest(unittest.TestCase):
    def test_sorts_the_official_semver_org_precedence_example(self):
        canonical = [
            "1.0.0-alpha",
            "1.0.0-alpha.1",
            "1.0.0-alpha.beta",
            "1.0.0-beta",
            "1.0.0-beta.2",
            "1.0.0-beta.11",
            "1.0.0-rc.1",
            "1.0.0",
        ]
        shuffled = canonical[:]
        random.Random(42).shuffle(shuffled)
        self.assertEqual(sort_versions(shuffled), canonical)

    def test_reverse_sort(self):
        self.assertEqual(sort_versions(["1.0.0", "2.0.0", "1.5.0"], reverse=True), ["2.0.0", "1.5.0", "1.0.0"])


if __name__ == "__main__":
    unittest.main()
