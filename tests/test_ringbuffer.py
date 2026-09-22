import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from ringbuffer import RingBuffer  # noqa: E402


class ConstructionTest(unittest.TestCase):
    def test_zero_capacity_raises_value_error(self):
        with self.assertRaises(ValueError):
            RingBuffer(0)

    def test_negative_capacity_raises_value_error(self):
        with self.assertRaises(ValueError):
            RingBuffer(-1)

    def test_new_buffer_is_empty_and_not_full(self):
        r = RingBuffer(3)
        self.assertEqual(len(r), 0)
        self.assertFalse(r.is_full)


class PushTest(unittest.TestCase):
    def test_partial_fill_keeps_everything_in_order(self):
        r = RingBuffer(5)
        r.push("a")
        r.push("b")
        self.assertEqual(list(r), ["a", "b"])
        self.assertEqual(len(r), 2)
        self.assertFalse(r.is_full)

    def test_exactly_at_capacity_is_full(self):
        r = RingBuffer(3)
        for x in "abc":
            r.push(x)
        self.assertEqual(list(r), ["a", "b", "c"])
        self.assertTrue(r.is_full)

    def test_pushing_past_capacity_overwrites_the_oldest(self):
        r = RingBuffer(3)
        for x in "abcd":
            r.push(x)
        self.assertEqual(list(r), ["b", "c", "d"])
        self.assertEqual(len(r), 3)

    def test_wrapping_multiple_times_stays_correct(self):
        # Capacity 3, pushed 10 items - the wrap index has cycled past
        # zero more than once, so this only passes if the modulo
        # arithmetic is right, not just the first wrap.
        r = RingBuffer(3)
        for i in range(10):
            r.push(i)
        self.assertEqual(list(r), [7, 8, 9])

    def test_capacity_one_always_holds_just_the_last_push(self):
        r = RingBuffer(1)
        r.push("a")
        r.push("b")
        r.push("c")
        self.assertEqual(list(r), ["c"])


class IndexingTest(unittest.TestCase):
    def setUp(self):
        self.r = RingBuffer(3)
        for x in "abcd":  # wraps once: buffer holds b, c, d
            self.r.push(x)

    def test_positive_index_is_logical_oldest_to_newest(self):
        self.assertEqual(self.r[0], "b")
        self.assertEqual(self.r[2], "d")

    def test_negative_index_counts_from_the_newest(self):
        self.assertEqual(self.r[-1], "d")
        self.assertEqual(self.r[-3], "b")

    def test_index_at_or_past_length_raises_index_error(self):
        with self.assertRaises(IndexError):
            self.r[3]

    def test_negative_index_past_the_start_raises_index_error(self):
        with self.assertRaises(IndexError):
            self.r[-4]

    def test_empty_buffer_any_index_raises_index_error(self):
        with self.assertRaises(IndexError):
            RingBuffer(3)[0]


class ClearTest(unittest.TestCase):
    def test_clear_empties_the_buffer(self):
        r = RingBuffer(3)
        for x in "abc":
            r.push(x)
        r.clear()
        self.assertEqual(list(r), [])
        self.assertEqual(len(r), 0)
        self.assertFalse(r.is_full)

    def test_clear_drops_references_to_old_items(self):
        # A slot that still points at an old object after clear() would
        # keep it alive for no reason - the internal storage should be
        # reset to None, not just have count/start zeroed.
        r = RingBuffer(2)
        r.push("a")
        r.push("b")
        r.clear()
        self.assertEqual(r._buf, [None, None])

    def test_buffer_is_usable_after_clear(self):
        r = RingBuffer(2)
        r.push("a")
        r.clear()
        r.push("x")
        r.push("y")
        r.push("z")
        self.assertEqual(list(r), ["y", "z"])


if __name__ == "__main__":
    unittest.main()
