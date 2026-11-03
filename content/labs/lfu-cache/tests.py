@test("get on a missing key returns -1", input="LFUCache(2).get(1)")
def _(m):
    return m.LFUCache(2).get(1), -1


@test("put then get returns the value", input="put(1, 'a'); get(1)")
def _(m):
    c = m.LFUCache(2)
    c.put(1, "a")
    return c.get(1), "a"


@test("evicts the least frequently used key", input="cap 2: put 1, put 2, get 1, put 3")
def _(m):
    c = m.LFUCache(2)
    c.put(1, "a"); c.put(2, "b"); c.get(1); c.put(3, "c")
    return [c.get(2), c.get(1), c.get(3)], [-1, "a", "c"]


@test("a frequency tie evicts the least recently used key", input="cap 3: put 1, 2, 3; get 3, get 1, get 2; put 4")
def _(m):
    c = m.LFUCache(3)
    c.put(1, 1); c.put(2, 2); c.put(3, 3)
    c.get(3); c.get(1); c.get(2)          # all at freq 2; 3 is now the least recent of them
    c.put(4, 4)
    return [c.get(3), c.get(1), c.get(2), c.get(4)], [-1, 1, 2, 4]


@test("an update changes the value and counts as a use", input="cap 2: put 1, put 2, put 1='z', put 3")
def _(m):
    c = m.LFUCache(2)
    c.put(1, "a"); c.put(2, "b"); c.put(1, "z"); c.put(3, "c")
    return [c.freq(1), c.get(1), c.get(2), c.get(3)], [2, "z", -1, "c"]


@test("a new key is the next victim, not an older hot key", input="cap 2: put 1, get 1 x3, put 2, put 3")
def _(m):
    c = m.LFUCache(2)
    c.put(1, "hot")
    for _ in range(3):
        c.get(1)
    c.put(2, "b"); c.put(3, "c")
    return [c.get(1), c.get(2), c.get(3)], ["hot", -1, "c"]


@test("min_freq moves up when its bucket empties", input="cap 2: put 1, put 2, get 1, get 2, get 2, put 3")
def _(m):
    c = m.LFUCache(2)
    c.put(1, 1); c.put(2, 2)
    c.get(1); c.get(2); c.get(2)          # freq(1) = 2, freq(2) = 3: no key left at freq 1
    c.put(3, 3)                            # must evict 1, the lowest at freq 2
    return [c.get(1), c.freq(2), c.freq(3)], [-1, 3, 1]


@test("freq() counts uses, and a miss changes nothing", input="cap 2: put 1, get 1, get 1, get 9")
def _(m):
    c = m.LFUCache(2)
    c.put(1, 1); c.get(1); c.get(1); c.get(9)
    return [c.freq(1), c.freq(9)], [3, 0]


@test("capacity 0 stores nothing", input="cap 0: put 1; get 1")
def _(m):
    c = m.LFUCache(0)
    c.put(1, "a")
    return [c.get(1), c.freq(1)], [-1, 0]


@test("capacity 1 keeps only the newest key", input="cap 1: put 1, get 1, put 2")
def _(m):
    c = m.LFUCache(1)
    c.put(1, "a"); c.get(1); c.put(2, "b")
    return [c.get(1), c.get(2)], [-1, "b"]


@test("a longer sequence (LeetCode 460 shape)", input="cap 2: put 1, put 2, get 1, put 3, get 2, get 3, put 4, get 1, get 3, get 4")
def _(m):
    c = m.LFUCache(2)
    out = []
    c.put(1, 1); c.put(2, 2); out.append(c.get(1))
    c.put(3, 3); out.append(c.get(2)); out.append(c.get(3))
    c.put(4, 4); out += [c.get(1), c.get(3), c.get(4)]
    return out, [1, -1, 3, -1, 3, 4]


@test("100,000 operations stay fast (O(1) each)", input="cap 1000, 100k mixed ops")
def _(m):
    c = m.LFUCache(1000)
    hits = 0
    for i in range(50_000):
        c.put(i % 3000, i)
        if c.get((i * 7) % 3000) != -1:
            hits += 1
    size = sum(1 for k in range(3000) if c.freq(k) > 0)
    return [size, hits > 0], [1000, True]
