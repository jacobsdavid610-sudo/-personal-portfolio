import ipaddress
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import cidrmerge  # noqa: E402

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "scripts", "cidrmerge.py")


def nets(*texts):
    return [ipaddress.ip_network(t) for t in texts]


def strs(networks):
    return [str(n) for n in networks]


def addresses(networks):
    """Every address in the networks, as a set. Only for small test ranges."""
    return {a for n in networks for a in n}


class ParseTest(unittest.TestCase):
    def test_cidrs_and_bare_addresses(self):
        self.assertEqual(strs(cidrmerge.parse_networks(["10.0.0.0/24", "1.2.3.4", "::1"])),
                         ["10.0.0.0/24", "1.2.3.4/32", "::1/128"])

    def test_comments_and_blank_lines(self):
        text = ["# office", "", "10.0.0.0/24  # main", "   "]
        self.assertEqual(strs(cidrmerge.parse_networks(text)), ["10.0.0.0/24"])

    def test_host_bits_are_rounded_down_by_default(self):
        self.assertEqual(strs(cidrmerge.parse_networks(["10.0.0.77/24"])), ["10.0.0.0/24"])

    def test_strict_rejects_host_bits(self):
        with self.assertRaises(ValueError) as ctx:
            cidrmerge.parse_networks(["10.0.0.0/24", "10.0.0.77/24"], strict=True)
        self.assertIn("line 2", str(ctx.exception))

    def test_strict_accepts_a_clean_network(self):
        self.assertEqual(strs(cidrmerge.parse_networks(["10.0.0.0/24"], strict=True)), ["10.0.0.0/24"])

    def test_bad_line_names_its_number(self):
        with self.assertRaises(ValueError) as ctx:
            cidrmerge.parse_networks(["10.0.0.0/24", "", "# c", "nonsense"])
        self.assertIn("line 4", str(ctx.exception))

    def test_bad_prefix_length(self):
        with self.assertRaises(ValueError):
            cidrmerge.parse_networks(["10.0.0.0/33"])

    def test_surrounding_whitespace(self):
        self.assertEqual(strs(cidrmerge.parse_networks(["  10.0.0.0/24\t"])), ["10.0.0.0/24"])

    def test_windows_line_endings(self):
        self.assertEqual(strs(cidrmerge.parse_networks(["10.0.0.0/24\r\n"])), ["10.0.0.0/24"])


class MergeTest(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(cidrmerge.merge([]), [])

    def test_adjacent_halves_become_the_parent(self):
        self.assertEqual(strs(cidrmerge.merge(nets("10.0.0.0/25", "10.0.0.128/25"))), ["10.0.0.0/24"])

    def test_duplicates_collapse(self):
        self.assertEqual(strs(cidrmerge.merge(nets("10.0.0.0/24", "10.0.0.0/24"))), ["10.0.0.0/24"])

    def test_contained_network_disappears(self):
        self.assertEqual(strs(cidrmerge.merge(nets("10.0.0.5/32", "10.0.0.0/24"))), ["10.0.0.0/24"])

    def test_chain_of_merges(self):
        four = nets("10.0.0.0/26", "10.0.0.64/26", "10.0.0.128/26", "10.0.0.192/26")
        self.assertEqual(strs(cidrmerge.merge(four)), ["10.0.0.0/24"])

    def test_non_adjacent_stay_separate(self):
        self.assertEqual(strs(cidrmerge.merge(nets("10.0.2.0/24", "10.0.0.0/24"))),
                         ["10.0.0.0/24", "10.0.2.0/24"])

    def test_two_networks_that_do_not_make_a_valid_parent(self):
        # 10.0.1.0/24 and 10.0.2.0/24 are adjacent but not a /23 together.
        self.assertEqual(strs(cidrmerge.merge(nets("10.0.1.0/24", "10.0.2.0/24"))),
                         ["10.0.1.0/24", "10.0.2.0/24"])

    def test_ipv4_comes_before_ipv6(self):
        self.assertEqual(strs(cidrmerge.merge(nets("::1/128", "10.0.0.0/8"))), ["10.0.0.0/8", "::1/128"])

    def test_ipv6_merges(self):
        self.assertEqual(strs(cidrmerge.merge(nets("2001:db8::/33", "2001:db8:8000::/33"))), ["2001:db8::/32"])

    def test_mixed_versions_do_not_raise(self):
        self.assertEqual(len(cidrmerge.merge(nets("1.2.3.4/32", "::2/128", "1.2.3.5/32"))), 2)

    def test_covers_exactly_the_same_addresses(self):
        original = nets("10.0.0.0/30", "10.0.0.2/31", "10.0.0.8/29", "10.0.0.12/30", "10.0.0.20/32")
        self.assertEqual(addresses(cidrmerge.merge(original)), addresses(original))

    def test_input_is_not_modified(self):
        original = nets("10.0.0.0/25", "10.0.0.128/25")
        cidrmerge.merge(original)
        self.assertEqual(strs(original), ["10.0.0.0/25", "10.0.0.128/25"])

    def test_merging_twice_changes_nothing(self):
        once = cidrmerge.merge(nets("10.0.0.0/25", "10.0.0.128/25", "10.0.5.0/24"))
        self.assertEqual(cidrmerge.merge(once), once)


class SubtractTest(unittest.TestCase):
    def test_nothing_to_remove(self):
        self.assertEqual(strs(cidrmerge.subtract(nets("10.0.0.0/24"), [])), ["10.0.0.0/24"])

    def test_remove_everything(self):
        self.assertEqual(cidrmerge.subtract(nets("10.0.0.0/24"), nets("10.0.0.0/24")), [])

    def test_hole_bigger_than_the_network(self):
        self.assertEqual(cidrmerge.subtract(nets("10.0.0.0/24"), nets("10.0.0.0/8")), [])

    def test_disjoint_hole_changes_nothing(self):
        self.assertEqual(strs(cidrmerge.subtract(nets("10.0.0.0/24"), nets("192.168.0.0/16"))), ["10.0.0.0/24"])

    def test_hole_in_the_middle(self):
        got = cidrmerge.subtract(nets("10.0.0.0/24"), nets("10.0.0.64/26"))
        self.assertEqual(strs(got), ["10.0.0.0/26", "10.0.0.128/25"])

    def test_single_address_hole(self):
        got = cidrmerge.subtract(nets("10.0.0.0/29"), nets("10.0.0.3/32"))
        self.assertEqual(addresses(got), addresses(nets("10.0.0.0/29")) - {ipaddress.ip_address("10.0.0.3")})
        self.assertEqual(strs(got), ["10.0.0.0/31", "10.0.0.2/32", "10.0.0.4/30"])

    def test_several_holes(self):
        got = cidrmerge.subtract(nets("10.0.0.0/24"), nets("10.0.0.0/26", "10.0.0.192/26"))
        # 10.0.0.64-191 is not aligned to a /25, so it stays two /26s.
        self.assertEqual(strs(got), ["10.0.0.64/26", "10.0.0.128/26"])

    def test_hole_spanning_two_networks(self):
        got = cidrmerge.subtract(nets("10.0.0.0/25", "10.0.1.0/25"), nets("10.0.0.0/23"))
        self.assertEqual(got, [])

    def test_result_has_exactly_the_remaining_addresses(self):
        keep = nets("10.0.0.0/28", "10.0.0.32/27")
        holes = nets("10.0.0.4/30", "10.0.0.40/29", "10.0.0.200/32")
        got = cidrmerge.subtract(keep, holes)
        self.assertEqual(addresses(got), addresses(keep) - addresses(holes))

    def test_different_versions_are_independent(self):
        got = cidrmerge.subtract(nets("10.0.0.0/24", "2001:db8::/32"), nets("::/0"))
        self.assertEqual(strs(got), ["10.0.0.0/24"])

    def test_result_is_merged(self):
        got = cidrmerge.subtract(nets("10.0.0.0/25", "10.0.0.128/25"), nets("10.9.0.0/16"))
        self.assertEqual(strs(got), ["10.0.0.0/24"])

    def test_default_route_minus_private_space(self):
        got = cidrmerge.subtract(nets("0.0.0.0/0"), nets("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))
        total = sum(n.num_addresses for n in got)
        self.assertEqual(total, 2**32 - 2**24 - 2**20 - 2**16)
        self.assertFalse(cidrmerge.covers(got, "10.1.2.3"))
        self.assertTrue(cidrmerge.covers(got, "8.8.8.8"))


class CoversTest(unittest.TestCase):
    def test_inside_and_outside(self):
        n = nets("10.0.0.0/24")
        self.assertTrue(cidrmerge.covers(n, "10.0.0.255"))
        self.assertFalse(cidrmerge.covers(n, "10.0.1.0"))

    def test_edges_of_a_network(self):
        n = nets("10.0.0.0/24")
        self.assertTrue(cidrmerge.covers(n, "10.0.0.0"))
        self.assertFalse(cidrmerge.covers(n, "9.255.255.255"))

    def test_other_ip_version_is_not_covered(self):
        self.assertFalse(cidrmerge.covers(nets("10.0.0.0/8"), "::1"))
        self.assertFalse(cidrmerge.covers(nets("::/0"), "1.2.3.4"))

    def test_ipv6(self):
        self.assertTrue(cidrmerge.covers(nets("2001:db8::/32"), "2001:db8::1"))

    def test_empty_list_covers_nothing(self):
        self.assertFalse(cidrmerge.covers([], "1.2.3.4"))

    def test_invalid_address_raises(self):
        with self.assertRaises(ValueError):
            cidrmerge.covers(nets("10.0.0.0/8"), "10.0.0")


def run_cli(*args, stdin=""):
    proc = subprocess.run([sys.executable, SCRIPT, *args], input=stdin,
                          capture_output=True, text=True, timeout=30)
    return proc.returncode, proc.stdout, proc.stderr


class CliTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def write(self, name, text):
        path = os.path.join(self.tmp.name, name)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(text)
        return path

    def test_merges_stdin(self):
        code, out, _ = run_cli(stdin="10.0.0.0/25\n10.0.0.128/25\n")
        self.assertEqual((code, out), (0, "10.0.0.0/24\n"))

    def test_reads_a_file(self):
        path = self.write("a.txt", "192.168.0.0/24\n192.168.1.0/24\n")
        self.assertEqual(run_cli(path)[:2], (0, "192.168.0.0/23\n"))

    def test_exclude(self):
        holes = self.write("holes.txt", "10.0.0.0/25\n")
        code, out, _ = run_cli("-x", holes, stdin="10.0.0.0/24\n")
        self.assertEqual((code, out), (0, "10.0.0.128/25\n"))

    def test_count(self):
        code, out, _ = run_cli("-n", stdin="10.0.0.0/24\n10.0.0.0/25\n")
        self.assertEqual((code, out), (0, "256\n"))

    def test_count_of_nothing_is_zero(self):
        self.assertEqual(run_cli("-n", stdin="")[:2], (0, "0\n"))

    def test_empty_input_prints_nothing(self):
        self.assertEqual(run_cli(stdin="")[:2], (0, ""))

    def test_check_covered_exits_0_silently(self):
        self.assertEqual(run_cli("-c", "10.0.0.9", stdin="10.0.0.0/24\n")[:2], (0, ""))

    def test_check_not_covered_exits_1_silently(self):
        self.assertEqual(run_cli("-c", "10.0.1.9", stdin="10.0.0.0/24\n")[:2], (1, ""))

    def test_check_respects_exclude(self):
        holes = self.write("holes.txt", "10.0.0.8/29\n")
        self.assertEqual(run_cli("-c", "10.0.0.9", "-x", holes, stdin="10.0.0.0/24\n")[0], 1)
        self.assertEqual(run_cli("-c", "10.0.0.1", "-x", holes, stdin="10.0.0.0/24\n")[0], 0)

    def test_check_with_a_bad_address_exits_3(self):
        code, _, err = run_cli("-c", "nope", stdin="10.0.0.0/24\n")
        self.assertEqual(code, 3)
        self.assertIn("cidrmerge:", err)

    def test_invalid_line_exits_3_and_prints_nothing_on_stdout(self):
        code, out, err = run_cli(stdin="10.0.0.0/24\nbogus\n")
        self.assertEqual((code, out), (3, ""))
        self.assertIn("line 2", err)

    def test_strict_flag(self):
        self.assertEqual(run_cli("--strict", stdin="10.0.0.5/24\n")[0], 3)
        self.assertEqual(run_cli(stdin="10.0.0.5/24\n")[:2], (0, "10.0.0.0/24\n"))

    def test_missing_file_exits_2(self):
        code, _, err = run_cli(os.path.join(self.tmp.name, "nope.txt"))
        self.assertEqual(code, 2)
        self.assertIn("cidrmerge:", err)

    def test_missing_exclude_file_exits_2(self):
        self.assertEqual(run_cli("-x", os.path.join(self.tmp.name, "nope.txt"), stdin="10.0.0.0/24\n")[0], 2)

    def test_unknown_option_exits_2(self):
        self.assertEqual(run_cli("--bogus")[0], 2)

    def test_invalid_utf8_exits_3_without_a_traceback(self):
        path = os.path.join(self.tmp.name, "bad.txt")
        with open(path, "wb") as handle:
            handle.write(b"10.0.0.0/24 \xff\n")
        code, _, err = run_cli(path)
        self.assertEqual(code, 3)
        self.assertNotIn("Traceback", err)


if __name__ == "__main__":
    unittest.main()
