# trie.py

A Trie (prefix tree) supporting exact search, prefix checks, and
autocomplete. Pure stdlib, no dependencies.

## Why

The naive way to do autocomplete over a word list is to filter every word by
`str.startswith()` on every keystroke — O(n) per lookup regardless of how
short the prefix is. A Trie makes lookup cost proportional to the length of
the prefix/word being searched, not the size of the dictionary, which is the
whole point once the word list gets large (spell-checkers, search-box
autocomplete, IP routing tables all use this structure for the same reason).

## API

```python
from trie import Trie

t = Trie()
t.insert("car")
t.insert("card")
t.insert("care")
t.insert("cat")

t.search("car")        # True  - "car" was inserted as a complete word
t.search("ca")         # False - "ca" was never inserted, even though it's a prefix
t.starts_with("ca")    # True  - something in the trie starts with "ca"
t.autocomplete("car")  # ["car", "card", "care"]  - alphabetical, "car" included
                        #   because a word can also be a prefix of longer words
t.autocomplete("car", limit=2)  # ["card", "care"] is wrong intuition - it's
                                  # actually ["car", "card"]: alphabetical order,
                                  # first N
```

## Real example: autocomplete against a real word list

```
$ cat /tmp/words.txt
apple
apply
apt
application
banana
band

$ python trie.py /tmp/words.txt app
apple
application
apply
```

Note `apt` is correctly excluded — its third character (`t`) diverges from
the `app` prefix (`p`) even though it shares the first two letters with the
others.

## `search()` vs. `starts_with()`

This is the one subtlety worth calling out explicitly: `search("car")` and
`starts_with("car")` can both be true at once, because `"car"` is both a
complete stored word *and* a prefix of `"card"`/`"care"`. A node in the trie
tracks `is_word` independently of whether it has children — that's what
makes both queries correct simultaneously instead of one shadowing the
other.

## CLI usage

```
trie.py <wordlist-file> <prefix> [-n LIMIT]
```

Reads one word per line from `wordlist-file`, then prints autocomplete
matches for `prefix` (default limit: 10).

## Running the tests

```
python -m unittest tests.test_trie -v
```

10 tests: exact search (found/not-found/empty trie), `starts_with` on a real
but unstored prefix, the word-that's-also-a-prefix case, alphabetical
ordering, `limit`, a nonexistent prefix, autocomplete with an empty prefix
(returns everything), and inserting a duplicate word being harmless.
