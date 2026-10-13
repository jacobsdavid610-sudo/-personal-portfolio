import os
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import ulid  # noqa: E402

# The example from the ULID spec.
SPEC_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
SPEC_MS = 1469922850259


class EncodeDecodeTest(unittest.TestCase):
    def test_spec_example_timestamp(self):
        ms, _ = ulid.decode(SPEC_ID)
        self.assertEqual(ms, SPEC_MS)

    def test_round_trip(self):
        ms, rnd = ulid.decode(SPEC_ID)
        self.assertEqual(ulid.encode(ms, rnd), SPEC_ID)

    def test_zero_and_max(self):
        self.assertEqual(ulid.encode(0, 0), "0" * 26)
        top = ulid.encode(ulid.MAX_TIME, ulid.MAX_RANDOM)
        self.assertEqual(top, "7" + "Z" * 25)
        self.assertEqual(ulid.decode(top), (ulid.MAX_TIME, ulid.MAX_RANDOM))

    def test_encode_rejects_out_of_range(self):
        with self.assertRaises(ValueError):
            ulid.encode(-1, 0)
        with self.assertRaises(ValueError):
            ulid.encode(ulid.MAX_TIME + 1, 0)
        with self.assertRaises(ValueError):
            ulid.encode(0, ulid.MAX_RANDOM + 1)

    def test_sorts_by_time_as_text(self):
        ids = [ulid.encode(ms, 0) for ms in (5, 1_000, 10 ** 12, 10 ** 13)]
        self.assertEqual(ids, sorted(ids))

    def test_to_datetime(self):
        dt = ulid.to_datetime(SPEC_ID)
        self.assertEqual(dt.isoformat(), "2016-07-30T23:54:10.259000+00:00")


class ValidationTest(unittest.TestCase):
    def test_lowercase_and_whitespace_accepted(self):
        self.assertEqual(ulid.decode("  " + SPEC_ID.lower() + "\n"), ulid.decode(SPEC_ID))

    def test_ambiguous_letters_read_as_digits(self):
        # I and L are 1, O is 0 - same ID as the all-digit spelling.
        self.assertEqual(ulid.decode("O" * 26), ulid.decode("0" * 26))
        self.assertEqual(ulid.decode("IL" + "0" * 24), ulid.decode("11" + "0" * 24))

    def test_wrong_length(self):
        for bad in ("", SPEC_ID[:-1], SPEC_ID + "0"):
            self.assertFalse(ulid.is_valid(bad), bad)

    def test_invalid_character(self):
        # U is not in the Crockford alphabet.
        self.assertFalse(ulid.is_valid(SPEC_ID[:-1] + "U"))
        self.assertFalse(ulid.is_valid(SPEC_ID[:-1] + "!"))

    def test_first_character_overflow(self):
        self.assertTrue(ulid.is_valid("7" + "Z" * 25))
        self.assertFalse(ulid.is_valid("8" + "0" * 25))

    def test_non_string(self):
        self.assertFalse(ulid.is_valid(None))
        self.assertFalse(ulid.is_valid(12345))


class GeneratorTest(unittest.TestCase):
    def test_shape(self):
        value = ulid.Generator().new()
        self.assertEqual(len(value), 26)
        self.assertTrue(ulid.is_valid(value))

    def test_same_millisecond_increments(self):
        gen = ulid.Generator(clock=lambda: 1000, rand=lambda: 41)
        first, second, third = gen.new(), gen.new(), gen.new()
        self.assertEqual(ulid.decode(first), (1000, 41))
        self.assertEqual(ulid.decode(second), (1000, 42))
        self.assertEqual(ulid.decode(third), (1000, 43))
        self.assertLess(first, second)
        self.assertLess(second, third)

    def test_new_millisecond_gets_fresh_randomness(self):
        times = iter([1000, 1000, 1001])
        rands = iter([7, 500])
        gen = ulid.Generator(clock=lambda: next(times), rand=lambda: next(rands))
        gen.new()
        gen.new()
        self.assertEqual(ulid.decode(gen.new()), (1001, 500))

    def test_clock_going_backwards_keeps_order(self):
        times = iter([2000, 1990])
        gen = ulid.Generator(clock=lambda: next(times), rand=lambda: 0)
        first, second = gen.new(), gen.new()
        self.assertEqual(ulid.decode(second)[0], 2000)
        self.assertLess(first, second)

    def test_overflow_raises(self):
        gen = ulid.Generator(clock=lambda: 1, rand=lambda: ulid.MAX_RANDOM)
        gen.new()
        with self.assertRaises(OverflowError):
            gen.new()

    def test_many_real_ids_are_unique_and_sorted(self):
        gen = ulid.Generator()
        ids = [gen.new() for _ in range(2000)]
        self.assertEqual(ids, sorted(ids))
        self.assertEqual(len(set(ids)), len(ids))


class CliTest(unittest.TestCase):
    SCRIPT = os.path.join(os.path.dirname(__file__), "..", "scripts", "ulid.py")

    def run_cli(self, *args):
        return subprocess.run([sys.executable, self.SCRIPT, *args],
                              capture_output=True, text=True)

    def test_new_count(self):
        out = self.run_cli("new", "-n", "4")
        self.assertEqual(out.returncode, 0)
        self.assertEqual(len(out.stdout.split()), 4)

    def test_decode_prints_time(self):
        out = self.run_cli("decode", SPEC_ID)
        self.assertEqual(out.returncode, 0)
        self.assertIn("2016-07-30T23:54:10.259+00:00", out.stdout)

    def test_decode_bad_input_exits_1(self):
        out = self.run_cli("decode", "nope")
        self.assertEqual(out.returncode, 1)
        self.assertIn("26 characters", out.stderr)

    def test_check_exit_codes(self):
        self.assertEqual(self.run_cli("check", SPEC_ID).returncode, 0)
        self.assertEqual(self.run_cli("check", "nope").returncode, 1)


if __name__ == "__main__":
    unittest.main()
