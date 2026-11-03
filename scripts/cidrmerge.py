#!/usr/bin/env python3
"""Merge, subtract and test lists of IPv4/IPv6 networks.

Reads one address or CIDR per line and prints the smallest list of networks
that covers exactly the same addresses: overlapping and adjacent ranges are
joined, duplicates and ranges inside a bigger one vanish. Can also remove
another list from the result, or check whether an address is covered. Pure
stdlib (ipaddress)."""

import argparse
import ipaddress
import sys


def parse_networks(lines, strict=False):
    """Parse one address or CIDR per line (`#` starts a comment, blank lines
    are skipped) into a list of networks. A bare address is a single-host
    network. With `strict`, a CIDR that has host bits set (10.0.0.5/24) is an
    error instead of being rounded down to its network (10.0.0.0/24).
    Raises ValueError naming the line number."""
    networks = []
    for number, raw in enumerate(lines, 1):
        text = raw.split("#", 1)[0].strip()
        if not text:
            continue
        try:
            networks.append(ipaddress.ip_network(text, strict=strict))
        except ValueError as err:
            raise ValueError(f"line {number}: {err}") from None
    return networks


def merge(networks):
    """Return the fewest networks covering exactly the same addresses,
    IPv4 first, each family in address order."""
    v4 = [n for n in networks if n.version == 4]
    v6 = [n for n in networks if n.version == 6]
    return list(ipaddress.collapse_addresses(v4)) + list(ipaddress.collapse_addresses(v6))


def subtract(networks, excluded):
    """Return `networks`, merged, with every address in `excluded` removed.
    Networks of different IP versions never overlap, so they are ignored
    against each other."""
    remaining = merge(networks)
    for hole in merge(excluded):
        pieces = []
        for net in remaining:
            if net.version != hole.version or not net.overlaps(hole):
                pieces.append(net)
            elif net.subnet_of(hole):
                continue  # entirely inside the hole
            else:
                # The hole is strictly inside `net`, since they overlap and
                # `net` is not inside it. Networks nest or are disjoint.
                pieces.extend(net.address_exclude(hole))
        remaining = merge(pieces)
    return remaining


def covers(networks, address):
    """True if `address` (a string) is inside any of `networks`."""
    addr = ipaddress.ip_address(address)
    return any(addr.version == n.version and addr in n for n in networks)


def _read(path, strict):
    if path == "-":
        return parse_networks(sys.stdin, strict)
    with open(path, encoding="utf-8") as handle:
        return parse_networks(handle, strict)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("file", nargs="?", default="-", help="list of networks (default: stdin)")
    parser.add_argument("-x", "--exclude", metavar="FILE", help="remove the networks in FILE from the result")
    parser.add_argument("-c", "--check", metavar="ADDRESS",
                        help="print nothing; exit 0 if ADDRESS is covered, 1 if not")
    parser.add_argument("--strict", action="store_true", help="reject CIDRs that have host bits set")
    parser.add_argument("-n", "--count", action="store_true", help="print the number of addresses covered, not the networks")
    args = parser.parse_args(argv)

    try:
        networks = _read(args.file, args.strict)
        if args.exclude is not None:
            result = subtract(networks, _read(args.exclude, args.strict))
        else:
            result = merge(networks)
        if args.check is not None:
            return 0 if covers(result, args.check) else 1
    except OSError as err:
        print(f"cidrmerge: {err}", file=sys.stderr)
        return 2
    except (ValueError, UnicodeDecodeError) as err:
        print(f"cidrmerge: {err}", file=sys.stderr)
        return 3

    if args.count:
        print(sum(n.num_addresses for n in result))
    else:
        for net in result:
            print(net)
    return 0


if __name__ == "__main__":
    sys.exit(main())
