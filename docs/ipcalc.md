# ipcalc.py

IPv4 subnet calculator: given an address in CIDR notation, reports the
network address, broadcast address, netmask, wildcard mask, usable host
range, and host counts — the "what subnet is this address actually in, and
how many hosts fit" tool.

## Why

The classic sysadmin/networking mental-math task, done once so it's never
done by hand again: given `192.168.1.10/24`, working out the network and
broadcast addresses correctly (especially at the edges — `/31`, `/32`, `/0`)
is easy to get subtly wrong, and Python's stdlib `ipaddress` module already
does the hard bitwise arithmetic correctly — this wraps it in a readable
report instead of requiring `python3 -c "..."` one-liners.

## Usage

```
ipcalc.py <address/prefix>
```

## Example

```
$ ipcalc.py 192.168.1.10/24
Address:      192.168.1.10
Network:      192.168.1.0/24
Netmask:      255.255.255.0 (/24)
Wildcard:     0.0.0.255
Broadcast:    192.168.1.255
Usable range: 192.168.1.1 - 192.168.1.254
Usable hosts: 254
Total addrs:  256

$ ipcalc.py 10.0.0.5/30
Address:      10.0.0.5
Network:      10.0.0.4/30
Netmask:      255.255.255.252 (/30)
Wildcard:     0.0.0.3
Broadcast:    10.0.0.7
Usable range: 10.0.0.5 - 10.0.0.6
Usable hosts: 2
Total addrs:  4
```

## Exit codes

- `0` — success.
- `2` — invalid CIDR (unparseable address, or a prefix length outside
  0-32), reported via `argparse.error`.

## Design notes

- `/31` and `/32` are handled as special cases, not exceptions bolted on
  after the fact: RFC 3021 defines `/31` as a 2-address point-to-point
  link where *both* addresses are usable hosts (no dedicated
  network/broadcast address), and `/32` is a single host. Treating them
  through the normal "first and last address are reserved" logic would
  report 0 or negative usable hosts, which is wrong, not just an edge case
  to ignore.
- The reported `address` field preserves the exact host address you typed
  (host bits and all), while `network`/`cidr` report the address with host
  bits masked to zero — so `192.168.1.200/24` correctly shows `address:
  192.168.1.200` alongside `network: 192.168.1.0/24`, rather than losing
  the distinction between "the host I asked about" and "the subnet it's in."
- IPv4 only, by design — mixing IPv4 and IPv6 subnet math (very different
  host-count scales, no broadcast address in IPv6) into one report would
  make the output harder to read for the common case this is built for.

## Running the tests

```
python -m unittest tests.test_ipcalc -v
```

11 tests: a typical `/24`, a small `/30`, the `/31` point-to-point edge
case (both addresses usable, no network/broadcast split), the `/32`
single-host case, a large `/8`, the entire-IPv4-space `/0`, host bits
being correctly masked out of the reported network while preserved in the
original address, the wildcard mask being the netmask's bitwise inverse,
the `cidr` field reflecting the network (not the original host address),
and rejection of both an unparseable address and an out-of-range prefix
length.
