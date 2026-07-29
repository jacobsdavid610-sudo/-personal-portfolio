import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from dupefinder import find_duplicates  # noqa: E402


class FindDuplicatesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, name, content):
        path = os.path.join(self.root, name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write(content)
        return path

    def test_no_duplicates(self):
        self.write("a.txt", "hello")
        self.write("b.txt", "world")
        self.assertEqual(find_duplicates(self.root), {})

    def test_finds_duplicate_pair(self):
        a = self.write("a.txt", "same content")
        b = self.write(os.path.join("sub", "b.txt"), "same content")

        groups = find_duplicates(self.root)

        self.assertEqual(len(groups), 1)
        (paths,) = groups.values()
        self.assertEqual(sorted(paths), sorted([a, b]))

    def test_same_size_different_content_not_flagged(self):
        # Same length, different bytes -> must not collide via the
        # size-bucketing pre-filter.
        self.write("a.txt", "aaaa")
        self.write("b.txt", "bbbb")
        self.assertEqual(find_duplicates(self.root), {})

    def test_three_way_duplicate_group(self):
        a = self.write("a.txt", "triplet")
        b = self.write("b.txt", "triplet")
        c = self.write("c.txt", "triplet")

        groups = find_duplicates(self.root)

        self.assertEqual(len(groups), 1)
        (paths,) = groups.values()
        self.assertEqual(sorted(paths), sorted([a, b, c]))

    def test_empty_directory(self):
        self.assertEqual(find_duplicates(self.root), {})


if __name__ == "__main__":
    unittest.main()
