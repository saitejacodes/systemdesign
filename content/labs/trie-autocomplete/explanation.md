A **trie** (prefix tree) stores strings one character per edge, so every string that shares a prefix shares the path that spells it. To find everything that starts with `res`, you walk three edges from the root and look only at the subtree below: the cost of reaching the prefix depends on the prefix length, not on how many strings the trie holds. That property is why tries (and their compressed cousins) sit under typeahead. Lucene, and so Elasticsearch's completion suggester, keeps suggestions in a finite-state transducer, a minimised trie-like automaton held in memory, precisely so a keystroke is a walk rather than a search.

Typeahead adds **ranking**. Users don't want every completion of `re`, they want the ten most popular ones, and they want them in well under 100 ms on every keystroke. Popularity comes from query logs: each time someone searches for `restaurant`, its weight goes up.

The structure:

- each **node** has a map from character to child node, and a **weight** that is 0 unless a word ends exactly at that node;
- **insert** walks (creating nodes as needed) to the end of the word and adds the weight there;
- **top-k** walks to the prefix node, collects every word in its subtree with its weight, and returns the best k.

Two invariants keep it correct. A node's position spells its string, so the path from the root *is* the key and nothing else needs storing per node. And a weight of 0 means "a prefix of something, not a word itself": `res` is on the path to `rest` but must never be suggested unless it was inserted.

## Your task

Implement `Trie()` with:

- `insert(word, weight=1)` (`insert(word, weight = 1)` in JavaScript). Words are non-empty strings. **Re-inserting a word adds `weight` to its existing weight**; it never replaces it and never creates a duplicate entry.
- `top_k(prefix, k)` (`topK` in JavaScript) returns a list of `[word, weight]` pairs (tuples `(word, weight)` in Python), sorted by **weight descending, then word ascending** (plain code-point order, as `<` compares strings). It returns at most `k` items.
- `weight(word)` returns the accumulated weight of a word, or `0` if it was never inserted (including when it is only a prefix of inserted words).

Edge cases the tests check:

- an **empty prefix** matches every word in the trie;
- an **unknown prefix** returns `[]`;
- `k` larger than the number of matches returns all of them; `k <= 0` returns `[]`;
- the prefix itself is included when it is a word (`top_k("car", …)` can return `car`);
- an empty trie returns `[]` for any prefix.

In Java `topK` returns a `List<Completion>` (a record of `word` and `weight`); in C++ it returns a `std::vector<std::pair<std::string, int>>`.

Don't build a list of all words and filter it with `startswith`: the point is that the prefix walk skips everything outside the subtree.

## Going further

This lab computes top-k at query time, which costs time proportional to the subtree. For short prefixes on a real query log that subtree is enormous (millions of completions under `s`), so production typeahead **precomputes** the top k at every node and answers a keystroke by returning a stored list. The price is update cost and memory (k entries per node), so those lists are usually rebuilt offline from logs, hourly or daily, with a small, frequently refreshed layer blended in for trending queries.

If weights only ever increase, you can also maintain the per-node lists online: after an insert, walk the word's path back up and, at each node, update the word's entry or insert it if it now beats the node's lowest entry, then trim to k. Decrements (or deletions) break this, because the replacement for an evicted entry may not be in any list.

Memory is the other lever. A **radix tree** (Patricia trie) merges chains of single-child nodes into one edge labelled with a string, and an FST also shares common *suffixes*, so `-ing` is stored once. Finally, real typeahead adds fuzziness (edit distance 1 on short prefixes), personalisation, and debouncing in the browser so most keystrokes never reach the server.
