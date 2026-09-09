import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from unionfind import UnionFind  # noqa: E402


class BasicTest(unittest.TestCase):
    def test_a_fresh_element_is_only_connected_to_itself(self):
        uf = UnionFind(["a"])
        self.assertTrue(uf.connected("a", "a"))

    def test_union_of_two_new_elements_connects_them(self):
        uf = UnionFind()
        uf.union("a", "b")
        self.assertTrue(uf.connected("a", "b"))

    def test_union_auto_registers_elements_that_were_never_add_ed(self):
        uf = UnionFind()
        uf.union("a", "b")
        self.assertEqual(len(uf), 2)

    def test_unrelated_elements_are_not_connected(self):
        uf = UnionFind()
        uf.union("a", "b")
        uf.union("c", "d")
        self.assertFalse(uf.connected("a", "c"))

    def test_union_is_transitive_across_a_chain(self):
        uf = UnionFind()
        uf.union("a", "b")
        uf.union("b", "c")
        self.assertTrue(uf.connected("a", "c"))

    def test_union_returns_true_when_merging_separate_sets(self):
        uf = UnionFind()
        self.assertTrue(uf.union("a", "b"))

    def test_union_returns_false_when_already_in_the_same_set(self):
        uf = UnionFind()
        uf.union("a", "b")
        self.assertFalse(uf.union("a", "b"))

    def test_find_on_an_unregistered_element_raises_key_error(self):
        uf = UnionFind()
        uf.union("a", "b")
        with self.assertRaises(KeyError):
            uf.find("z")

    def test_connected_on_an_unregistered_element_raises_key_error(self):
        uf = UnionFind(["a"])
        with self.assertRaises(KeyError):
            uf.connected("a", "z")

    def test_add_is_idempotent(self):
        uf = UnionFind()
        uf.add("a")
        uf.union("a", "b")
        uf.add("a")  # re-adding a already-known element must not reset its set
        self.assertTrue(uf.connected("a", "b"))


class SizeAndGroupsTest(unittest.TestCase):
    def test_size_of_a_singleton_is_one(self):
        uf = UnionFind(["a"])
        self.assertEqual(uf.size("a"), 1)

    def test_size_reflects_the_whole_merged_component(self):
        uf = UnionFind()
        uf.union("a", "b")
        uf.union("b", "c")
        self.assertEqual(uf.size("a"), 3)
        self.assertEqual(uf.size("c"), 3)

    def test_groups_partitions_every_added_element(self):
        uf = UnionFind()
        uf.union("a", "b")
        uf.union("c", "d")
        uf.add("e")
        groups = sorted((sorted(members) for members in uf.groups().values()))
        self.assertEqual(groups, [["a", "b"], ["c", "d"], ["e"]])

    def test_num_components_decreases_as_sets_merge(self):
        uf = UnionFind(["a", "b", "c", "d"])
        self.assertEqual(uf.num_components(), 4)
        uf.union("a", "b")
        self.assertEqual(uf.num_components(), 3)
        uf.union("c", "d")
        self.assertEqual(uf.num_components(), 2)
        uf.union("a", "d")
        self.assertEqual(uf.num_components(), 1)

    def test_merging_the_same_pair_twice_does_not_double_count_size(self):
        uf = UnionFind()
        uf.union("a", "b")
        uf.union("a", "b")
        self.assertEqual(uf.size("a"), 2)


class LargeChainTest(unittest.TestCase):
    def test_path_compression_preserves_correctness_over_a_long_chain(self):
        uf = UnionFind()
        for i in range(999):
            uf.union(i, i + 1)
        self.assertTrue(uf.connected(0, 999))
        self.assertEqual(uf.size(0), 1000)
        self.assertEqual(uf.num_components(), 1)


if __name__ == "__main__":
    unittest.main()
