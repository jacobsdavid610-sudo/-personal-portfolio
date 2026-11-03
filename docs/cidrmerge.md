# cidrmerge.py

Merges, subtracts and tests lists of IPv4 and IPv6 networks. Reads one
address or CIDR per line and prints the smallest list of networks that
covers exactly the same addresses. Pure stdlib (`ipaddress`, `argparse`).

## Why

Firewall rules, allow-lists and route tables grow by accretion: someone adds
a /24, someone else adds the two /25 halves of it, a third adds one host
inside it. Merging them by hand is error-prone, and "everything except our
private ranges" is worse. `ipcalc.py` describes one subnet; this one works on
whole lists.

## API

```python
import cidrmerge

nets = cidrmerge.parse_networks(open("allow.txt"))
cidrmerge.merge(nets)                      # fewest networks, same addresses
cidrmerge.subtract(nets, other_nets)       # nets minus other_nets, merged
cidrmerge.covers(nets, "10.0.0.9")         # True / False
```

`parse_networks(lines, strict=False)` accepts a CIDR or a bare address
(treated as a single host) per line, ignores blank lines and `#` comments,
and raises `ValueError` naming the line number.

## CLI usage

```
cidrmerge.py [-x FILE] [-c ADDRESS] [--strict] [-n] [FILE]

  FILE            list of networks (default: stdin)
  -x, --exclude   remove the networks in FILE from the result
  -c, --check     print nothing; exit 0 if ADDRESS is covered, 1 if not
  --strict        reject CIDRs that have host bits set
  -n, --count     print how many addresses are covered, not the networks
```

## Real example

```
$ cat allow.txt
10.0.0.0/25
10.0.0.128/25     # second half of the same /24
10.0.0.5          # already inside it
192.168.1.7/24    # host bits set, rounded down
2001:db8::/33
2001:db8:8000::/33

$ python scripts/cidrmerge.py allow.txt
10.0.0.0/24
192.168.1.0/24
2001:db8::/32

$ printf '10.0.0.0/24\n10.0.0.0/25\n' | python scripts/cidrmerge.py -n
256

$ echo 0.0.0.0/0 | python scripts/cidrmerge.py -x private.txt   # "the public internet"

$ python scripts/cidrmerge.py -c 10.0.0.9 allow.txt && echo allowed
allowed
```

## Exit codes

- `0` - success (with `-c`: the address is covered).
- `1` - only with `-c`: the address is not covered.
- `2` - usage error or a file could not be opened.
- `3` - invalid input: a bad line (the message names it), invalid UTF-8, or
  an invalid `-c` address.

## Design notes

- **Same addresses, fewer lines.** Merge never adds or drops an address. A
  test compares the full address set before and after.
- **Adjacent is not always mergeable.** `10.0.1.0/24` and `10.0.2.0/24`
  touch but are not the two halves of one /23, so they stay separate. Only
  correctly aligned siblings join.
- **Subtracting splits only where it must.** Networks either nest or do not
  overlap, so a hole is either outside a network, covers it entirely, or sits
  strictly inside it, and only that last case needs
  `address_exclude`. The result is merged again afterwards.
- **IPv4 and IPv6 never interact.** They are processed separately and printed
  IPv4 first, so `::/0` as a hole removes nothing from an IPv4 list.
- **Host bits are rounded down unless `--strict`.** `192.168.1.7/24` is a
  common way to write an interface, and rounding is usually what you want;
  `--strict` is for checking a list you expect to be clean.
- **Bare addresses are `/32` or `/128`.**
- **`-c` is silent.** It is for `if`/`&&` in scripts; the answer is the exit
  code. It sees the result after `-x`, so "is this address allowed once the
  exceptions are removed" is one command.
- **Nothing is printed for bad input.** The whole list is parsed before any
  output, so a typo on line 900 never leaves a partial list behind.

## Running the tests

```
python -m unittest tests/test_cidrmerge.py
```

56 tests: parsing (comments, whitespace, CRLF, host bits, strict mode, line
numbers in errors), merging (halves, duplicates, containment, chains,
adjacent-but-unalignable, IPv4/IPv6 ordering, same address set before and
after, input unmodified, idempotence), subtracting (no-op, everything,
oversized hole, disjoint, middle, single host, several holes, a hole spanning
networks, exact remaining-address check, mixed versions, the default route
minus private space), `covers`, and the CLI including every exit code.
