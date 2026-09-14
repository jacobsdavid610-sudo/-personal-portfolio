import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from consistenthash import ConsistentHashRing  # noqa: E402


class ConstructionTest(unittest.TestCase):
    def test_zero_replicas_raises_value_error(self):
        with self.assertRaises(ValueError):
            ConsistentHashRing(["a"], replicas=0)

    def test_negative_replicas_raises_value_error(self):
        with self.assertRaises(ValueError):
            ConsistentHashRing(["a"], replicas=-1)

    def test_empty_ring_get_node_raises_lookup_error(self):
        ring = ConsistentHashRing()
        with self.assertRaises(LookupError):
            ring.get_node("anything")


class MembershipTest(unittest.TestCase):
    def test_len_and_contains_reflect_added_nodes(self):
        ring = ConsistentHashRing(["a", "b"])
        self.assertEqual(len(ring), 2)
        self.assertIn("a", ring)
        self.assertNotIn("z", ring)

    def test_adding_an_existing_node_is_a_no_op(self):
        ring = ConsistentHashRing(["a"])
        ring.add_node("a")
        self.assertEqual(len(ring), 1)

    def test_removing_an_unknown_node_raises_key_error(self):
        ring = ConsistentHashRing(["a"])
        with self.assertRaises(KeyError):
            ring.remove_node("ghost")

    def test_removing_a_node_drops_it_from_the_ring(self):
        ring = ConsistentHashRing(["a", "b"])
        ring.remove_node("a")
        self.assertNotIn("a", ring)
        self.assertEqual(len(ring), 1)

    def test_single_node_owns_every_key(self):
        ring = ConsistentHashRing(["only"])
        for key in ["x", "y", "z", 42]:
            self.assertEqual(ring.get_node(key), "only")


class DeterminismTest(unittest.TestCase):
    def test_same_key_always_maps_to_the_same_node(self):
        ring = ConsistentHashRing(["a", "b", "c"])
        first = ring.get_node("some-key")
        for _ in range(20):
            self.assertEqual(ring.get_node("some-key"), first)

    def test_two_separately_built_rings_with_the_same_nodes_agree(self):
        ring1 = ConsistentHashRing(["a", "b", "c"])
        ring2 = ConsistentHashRing(["c", "a", "b"])  # different add order
        for i in range(100):
            key = f"key-{i}"
            self.assertEqual(ring1.get_node(key), ring2.get_node(key))


class RebalancingTest(unittest.TestCase):
    def setUp(self):
        self.ring = ConsistentHashRing(["a", "b", "c"], replicas=100)
        self.keys = [f"key-{i}" for i in range(2000)]

    def test_adding_a_fourth_node_remaps_roughly_one_quarter_of_keys(self):
        # The core promise of consistent hashing versus hash(key) % n: adding
        # one node to an even N should remap only about 1/(N+1) of keys, not
        # nearly all of them. Give it a wide but still meaningful band around
        # the theoretical 25% so this only fails on a real regression in the
        # ring logic, not on ordinary hash-distribution noise.
        before = {k: self.ring.get_node(k) for k in self.keys}
        self.ring.add_node("d")
        after = {k: self.ring.get_node(k) for k in self.keys}

        moved_fraction = sum(1 for k in self.keys if before[k] != after[k]) / len(self.keys)
        self.assertGreater(moved_fraction, 0.10)
        self.assertLess(moved_fraction, 0.40)

    def test_removing_a_node_only_moves_keys_that_were_on_it(self):
        self.ring.add_node("d")
        before = {k: self.ring.get_node(k) for k in self.keys}
        keys_on_d = {k for k, node in before.items() if node == "d"}

        self.ring.remove_node("d")
        after = {k: self.ring.get_node(k) for k in self.keys}
        moved_keys = {k for k in self.keys if before[k] != after[k]}

        self.assertEqual(moved_keys, keys_on_d)
        self.assertTrue(all(after[k] in ("a", "b", "c") for k in keys_on_d))

    def test_remaining_nodes_stay_untouched_by_an_unrelated_removal(self):
        self.ring.add_node("d")
        before = {k: self.ring.get_node(k) for k in self.keys}
        self.ring.remove_node("d")
        after = {k: self.ring.get_node(k) for k in self.keys}

        for k in self.keys:
            if before[k] != "d":
                self.assertEqual(before[k], after[k])


if __name__ == "__main__":
    unittest.main()
