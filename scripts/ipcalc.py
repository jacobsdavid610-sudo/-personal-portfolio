#!/usr/bin/env python3
"""IPv4 subnet calculator: given an address in CIDR notation, report the
network address, broadcast address, netmask, usable host range, and total
host count. Pure stdlib (ipaddress), no dependencies."""

import argparse
import ipaddress


def calculate(cidr):
    """Return a dict of subnet facts for a CIDR string like '192.168.1.10/24'."""
    interface = ipaddress.ip_interface(cidr)
    network = interface.network

    prefixlen = network.prefixlen
    total_addresses = network.num_addresses

    if prefixlen >= 31:
        # /31 (point-to-point, RFC 3021) and /32 (single host) have no
        # separate network/broadcast/usable-range distinction.
        usable_first = network.network_address
        usable_last = network.broadcast_address
        usable_count = total_addresses
    else:
        usable_first = network.network_address + 1
        usable_last = network.broadcast_address - 1
        usable_count = total_addresses - 2

    return {
        "address": str(interface.ip),
        "network": str(network.network_address),
        "broadcast": str(network.broadcast_address),
        "netmask": str(network.netmask),
        "prefixlen": prefixlen,
        "wildcard": str(network.hostmask),
        "usable_first": str(usable_first),
        "usable_last": str(usable_last),
        "usable_count": usable_count,
        "total_addresses": total_addresses,
        "cidr": str(network),
    }


def format_report(info):
    lines = [
        f"Address:      {info['address']}",
        f"Network:      {info['cidr']}",
        f"Netmask:      {info['netmask']} (/{info['prefixlen']})",
        f"Wildcard:     {info['wildcard']}",
        f"Broadcast:    {info['broadcast']}",
        f"Usable range: {info['usable_first']} - {info['usable_last']}",
        f"Usable hosts: {info['usable_count']}",
        f"Total addrs:  {info['total_addresses']}",
    ]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cidr", help="IPv4 address in CIDR notation, e.g. 192.168.1.10/24")
    args = parser.parse_args()

    try:
        info = calculate(args.cidr)
    except ValueError as e:
        parser.error(str(e))
        return

    print(format_report(info))


if __name__ == "__main__":
    main()
