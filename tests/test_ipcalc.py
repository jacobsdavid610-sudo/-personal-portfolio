import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from ipcalc import calculate  # noqa: E402


class CalculateTest(unittest.TestCase):
    def test_typical_slash24(self):
        info = calculate("192.168.1.10/24")
        self.assertEqual(info["network"], "192.168.1.0")
        self.assertEqual(info["broadcast"], "192.168.1.255")
        self.assertEqual(info["netmask"], "255.255.255.0")
        self.assertEqual(info["usable_first"], "192.168.1.1")
        self.assertEqual(info["usable_last"], "192.168.1.254")
        self.assertEqual(info["usable_count"], 254)
        self.assertEqual(info["total_addresses"], 256)

    def test_slash30_small_subnet(self):
        info = calculate("10.0.0.5/30")
        self.assertEqual(info["network"], "10.0.0.4")
        self.assertEqual(info["broadcast"], "10.0.0.7")
        self.assertEqual(info["usable_first"], "10.0.0.5")
        self.assertEqual(info["usable_last"], "10.0.0.6")
        self.assertEqual(info["usable_count"], 2)

    def test_slash31_point_to_point_has_no_network_broadcast_split(self):
        info = calculate("10.0.0.0/31")
        self.assertEqual(info["network"], "10.0.0.0")
        self.assertEqual(info["broadcast"], "10.0.0.1")
        # Both addresses are usable per RFC 3021 - no split into
        # network/broadcast-only addresses the way larger subnets have.
        self.assertEqual(info["usable_first"], "10.0.0.0")
        self.assertEqual(info["usable_last"], "10.0.0.1")
        self.assertEqual(info["usable_count"], 2)

    def test_slash32_single_host(self):
        info = calculate("10.0.0.5/32")
        self.assertEqual(info["network"], "10.0.0.5")
        self.assertEqual(info["broadcast"], "10.0.0.5")
        self.assertEqual(info["usable_first"], "10.0.0.5")
        self.assertEqual(info["usable_last"], "10.0.0.5")
        self.assertEqual(info["usable_count"], 1)
        self.assertEqual(info["total_addresses"], 1)

    def test_slash8_large_network(self):
        info = calculate("10.5.5.5/8")
        self.assertEqual(info["network"], "10.0.0.0")
        self.assertEqual(info["broadcast"], "10.255.255.255")
        self.assertEqual(info["total_addresses"], 16777216)
        self.assertEqual(info["usable_count"], 16777214)

    def test_slash0_entire_ipv4_space(self):
        info = calculate("1.2.3.4/0")
        self.assertEqual(info["network"], "0.0.0.0")
        self.assertEqual(info["broadcast"], "255.255.255.255")

    def test_host_bits_are_masked_out_of_the_reported_network(self):
        # The host address itself (with all its host-portion bits) is
        # preserved separately from the derived network address.
        info = calculate("192.168.1.200/24")
        self.assertEqual(info["address"], "192.168.1.200")
        self.assertEqual(info["network"], "192.168.1.0")

    def test_wildcard_mask_is_the_inverse_of_the_netmask(self):
        info = calculate("192.168.1.10/24")
        self.assertEqual(info["netmask"], "255.255.255.0")
        self.assertEqual(info["wildcard"], "0.0.0.255")

    def test_cidr_field_reflects_the_network_not_the_original_host(self):
        info = calculate("192.168.1.200/24")
        self.assertEqual(info["cidr"], "192.168.1.0/24")

    def test_invalid_cidr_raises_value_error(self):
        with self.assertRaises(ValueError):
            calculate("not-an-address/24")

    def test_out_of_range_prefix_raises_value_error(self):
        with self.assertRaises(ValueError):
            calculate("10.0.0.0/33")


if __name__ == "__main__":
    unittest.main()
