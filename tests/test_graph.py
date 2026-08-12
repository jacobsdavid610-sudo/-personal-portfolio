import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from graph import Graph  # noqa: E402


class ShortestPathTest(unittest.TestCase):
    def test_direct_edge(self):
        g = Graph()
        g.add_edge("a", "b")
        self.assertEqual(g.shortest_path("a", "b"), ["a", "b"])

    def test_start_equals_end(self):
        g = Graph()
        g.add_node("a")
        self.assertEqual(g.shortest_path("a", "a"), ["a"])

    def test_finds_the_shortest_of_multiple_paths(self):
        # a -> b -> c -> d (long way) and a -> d (direct) both exist;
        # BFS must prefer the 1-edge path over the 3-edge one.
        g = Graph()
        g.add_edge("a", "b")
        g.add_edge("b", "c")
        g.add_edge("c", "d")
        g.add_edge("a", "d")
        self.assertEqual(g.shortest_path("a", "d"), ["a", "d"])

    def test_picks_shortest_among_two_indirect_routes(self):
        # a->b->d (2 edges) vs a->e->f->d (3 edges): must pick the 2-edge one.
        g = Graph()
        g.add_edge("a", "b")
        g.add_edge("b", "d")
        g.add_edge("a", "e")
        g.add_edge("e", "f")
        g.add_edge("f", "d")
        self.assertEqual(g.shortest_path("a", "d"), ["a", "b", "d"])

    def test_unreachable_returns_none(self):
        g = Graph()
        g.add_edge("a", "b")
        g.add_node("c")
        self.assertIsNone(g.shortest_path("a", "c"))

    def test_unknown_node_returns_none(self):
        g = Graph()
        g.add_edge("a", "b")
        self.assertIsNone(g.shortest_path("a", "nonexistent"))

    def test_respects_edge_direction(self):
        g = Graph()
        g.add_edge("a", "b")  # a -> b only, not b -> a
        self.assertIsNone(g.shortest_path("b", "a"))


class TopologicalSortTest(unittest.TestCase):
    def test_simple_chain(self):
        g = Graph()
        g.add_edge("a", "b")
        g.add_edge("b", "c")
        self.assertEqual(g.topological_sort(), ["a", "b", "c"])

    def test_respects_all_dependency_constraints(self):
        # Classic "getting dressed" style DAG: socks before shoes,
        # underwear before pants, pants before shoes.
        g = Graph()
        g.add_edge("socks", "shoes")
        g.add_edge("underwear", "pants")
        g.add_edge("pants", "shoes")

        order = g.topological_sort()
        self.assertLess(order.index("socks"), order.index("shoes"))
        self.assertLess(order.index("underwear"), order.index("pants"))
        self.assertLess(order.index("pants"), order.index("shoes"))

    def test_isolated_node_with_no_edges_is_included(self):
        g = Graph()
        g.add_edge("a", "b")
        g.add_node("standalone")
        order = g.topological_sort()
        self.assertIn("standalone", order)
        self.assertEqual(len(order), 3)

    def test_raises_on_a_cycle(self):
        g = Graph()
        g.add_edge("a", "b")
        g.add_edge("b", "c")
        g.add_edge("c", "a")
        with self.assertRaises(ValueError):
            g.topological_sort()

    def test_empty_graph_returns_empty_order(self):
        self.assertEqual(Graph().topological_sort(), [])


if __name__ == "__main__":
    unittest.main()
