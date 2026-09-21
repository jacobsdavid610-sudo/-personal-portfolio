import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from intervals import IntervalSet, parse_intervals  # noqa: E402


class ConstructionTest(unittest.TestCase):
    def test_start_after_end_raises_value_error(self):
        with self.assertRaises(ValueError):
            IntervalSet([(5, 1)])

    def test_empty_range_is_ignored(self):
        self.assertEqual(list(IntervalSet([(3, 3)])), [])

    def test_out_of_order_input_comes_back_sorted_and_merged(self):
        iset = IntervalSet([(20, 25), (0, 5), (3, 8)])
        self.assertEqual(list(iset), [(0, 8), (20, 25)])


class AddTest(unittest.TestCase):
    def test_overlapping_ranges_merge(self):
        iset = IntervalSet([(0, 5)])
        iset.add(3, 10)
        self.assertEqual(list(iset), [(0, 10)])

    def test_adjacent_ranges_merge(self):
        # The half-open point: [0, 5) and [5, 10) leave no gap between
        # them, so they have to come back as one interval.
        iset = IntervalSet([(0, 5)])
        iset.add(5, 10)
        self.assertEqual(list(iset), [(0, 10)])

    def test_disjoint_ranges_stay_separate(self):
        iset = IntervalSet([(0, 5)])
        iset.add(6, 10)
        self.assertEqual(list(iset), [(0, 5), (6, 10)])

    def test_one_range_swallowing_several_collapses_them(self):
        iset = IntervalSet([(0, 2), (4, 6), (8, 10)])
        iset.add(1, 9)
        self.assertEqual(list(iset), [(0, 10)])

    def test_range_inside_an_existing_one_changes_nothing(self):
        iset = IntervalSet([(0, 10)])
        iset.add(3, 4)
        self.assertEqual(list(iset), [(0, 10)])

    def test_float_bounds_merge_the_same_way(self):
        self.assertEqual(list(IntervalSet([(0.5, 1.5), (1.5, 2.0)])), [(0.5, 2.0)])


class RemoveTest(unittest.TestCase):
    def test_remove_from_the_middle_splits_the_interval(self):
        iset = IntervalSet([(0, 10)])
        iset.remove(4, 6)
        self.assertEqual(list(iset), [(0, 4), (6, 10)])

    def test_remove_a_merely_touching_range_removes_nothing(self):
        # [0, 5) and [5, 10) share no point, so subtracting the second
        # must leave the first completely intact.
        iset = IntervalSet([(0, 5)])
        iset.remove(5, 10)
        self.assertEqual(list(iset), [(0, 5)])

    def test_remove_spanning_several_intervals(self):
        iset = IntervalSet([(0, 2), (4, 6), (8, 10)])
        iset.remove(1, 9)
        self.assertEqual(list(iset), [(0, 1), (9, 10)])

    def test_remove_covering_everything_empties_the_set(self):
        iset = IntervalSet([(0, 5), (10, 15)])
        iset.remove(0, 20)
        self.assertEqual(list(iset), [])
        self.assertEqual(len(iset), 0)

    def test_remove_an_empty_range_is_a_no_op(self):
        iset = IntervalSet([(0, 10)])
        iset.remove(5, 5)
        self.assertEqual(list(iset), [(0, 10)])


class ContainsTest(unittest.TestCase):
    def test_start_is_inclusive_and_end_is_exclusive(self):
        iset = IntervalSet([(0, 5)])
        self.assertTrue(iset.contains(0))
        self.assertTrue(iset.contains(4))
        self.assertFalse(iset.contains(5))

    def test_point_in_a_gap_is_not_contained(self):
        iset = IntervalSet([(0, 5), (10, 15)])
        self.assertFalse(iset.contains(7))
        self.assertTrue(iset.contains(10))

    def test_empty_set_contains_nothing(self):
        self.assertFalse(IntervalSet().contains(0))


class SetOpsTest(unittest.TestCase):
    def test_intersection_keeps_only_shared_spans(self):
        a = IntervalSet([(0, 10), (20, 30)])
        b = IntervalSet([(5, 25)])
        self.assertEqual(list(a.intersection(b)), [(5, 10), (20, 25)])

    def test_intersection_of_disjoint_sets_is_empty(self):
        a = IntervalSet([(0, 5)])
        b = IntervalSet([(5, 10)])
        self.assertEqual(list(a.intersection(b)), [])

    def test_union_merges_across_both_sets(self):
        a = IntervalSet([(0, 10), (20, 30)])
        b = IntervalSet([(5, 25)])
        self.assertEqual(list(a.union(b)), [(0, 30)])

    def test_difference_subtracts_the_other_set(self):
        a = IntervalSet([(0, 10), (20, 30)])
        b = IntervalSet([(5, 25)])
        self.assertEqual(list(a.difference(b)), [(0, 5), (25, 30)])

    def test_set_ops_do_not_mutate_either_operand(self):
        a = IntervalSet([(0, 10)])
        b = IntervalSet([(5, 20)])
        a.union(b)
        a.difference(b)
        a.intersection(b)
        self.assertEqual(list(a), [(0, 10)])
        self.assertEqual(list(b), [(5, 20)])


class GapsTest(unittest.TestCase):
    def test_gaps_between_covered_spans(self):
        iset = IntervalSet([(0, 5), (10, 15)])
        self.assertEqual(iset.gaps(0, 20), [(5, 10), (15, 20)])

    def test_gaps_are_clipped_to_the_requested_bounds(self):
        iset = IntervalSet([(0, 5), (10, 15)])
        self.assertEqual(iset.gaps(3, 12), [(5, 10)])

    def test_fully_covered_range_has_no_gaps(self):
        self.assertEqual(IntervalSet([(0, 20)]).gaps(5, 10), [])

    def test_empty_set_leaves_the_whole_range_as_one_gap(self):
        self.assertEqual(IntervalSet().gaps(0, 10), [(0, 10)])


class TotalTest(unittest.TestCase):
    def test_total_counts_overlapping_cover_once(self):
        iset = IntervalSet([(0, 10), (5, 15)])
        self.assertEqual(iset.total(), 15)

    def test_total_of_empty_set_is_zero(self):
        self.assertEqual(IntervalSet().total(), 0)


class ParseTest(unittest.TestCase):
    def test_comments_and_blank_lines_are_skipped(self):
        text = "# header\n0 5\n\n10 15  # trailing note\n"
        self.assertEqual(parse_intervals(text), [(0, 5), (10, 15)])

    def test_comma_separated_form_is_accepted(self):
        self.assertEqual(parse_intervals("1,4\n"), [(1, 4)])

    def test_integers_stay_integers(self):
        start, end = parse_intervals("0 5\n")[0]
        self.assertIsInstance(start, int)
        self.assertIsInstance(end, int)

    def test_floats_are_parsed_as_floats(self):
        start, end = parse_intervals("0.5 1.5\n")[0]
        self.assertIsInstance(start, float)
        self.assertEqual((start, end), (0.5, 1.5))

    def test_wrong_field_count_is_rejected_with_the_line_number(self):
        with self.assertRaises(ValueError) as ctx:
            parse_intervals("0 5\n1 2 3\n")
        self.assertIn("line 2", str(ctx.exception))

    def test_non_numeric_bounds_are_rejected(self):
        with self.assertRaises(ValueError):
            parse_intervals("start end\n")


if __name__ == "__main__":
    unittest.main()
