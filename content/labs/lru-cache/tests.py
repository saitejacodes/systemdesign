@test("get on a missing key returns -1", input="LRUCache(2).get(1)")
def _(m):
    return m.LRUCache(2).get(1), -1


@test("put then get returns the value", input="put(1, 'a'); get(1)")
def _(m):
    c = m.LRUCache(2)
    c.put(1, "a")
    return c.get(1), "a"


@test("evicts the least recently used key", input="cap 2: put 1, put 2, put 3")
def _(m):
    c = m.LRUCache(2)
    c.put(1, "a"); c.put(2, "b"); c.put(3, "c")
    return [c.get(1), c.get(2), c.get(3)], [-1, "b", "c"]


@test("a get makes the key most recent, so the other key is evicted", input="cap 2: put 1, put 2, get 1, put 3")
def _(m):
    c = m.LRUCache(2)
    c.put(1, "a"); c.put(2, "b"); c.get(1); c.put(3, "c")
    return [c.get(2), c.get(1), c.get(3)], [-1, "a", "c"]


@test("updating a key changes its value and makes it most recent", input="cap 2: put 1, put 2, put 1='z', put 3")
def _(m):
    c = m.LRUCache(2)
    c.put(1, "a"); c.put(2, "b"); c.put(1, "z"); c.put(3, "c")
    return [c.get(1), c.get(2)], ["z", -1]


@test("an update does not grow the cache", input="cap 2: put 1 three times, put 2")
def _(m):
    c = m.LRUCache(2)
    for v in "xyz":
        c.put(1, v)
    c.put(2, "b")
    return sorted(c.keys()), [1, 2]


@test("capacity 1 keeps only the newest key", input="cap 1: put 1, put 2")
def _(m):
    c = m.LRUCache(1)
    c.put(1, "a"); c.put(2, "b")
    return [c.get(1), c.get(2), c.keys()], [-1, "b", [2]]


@test("keys() lists most to least recent", input="cap 3: put 1, 2, 3; get 1")
def _(m):
    c = m.LRUCache(3)
    c.put(1, 1); c.put(2, 2); c.put(3, 3); c.get(1)
    return c.keys(), [1, 3, 2]


@test("a miss does not change the order", input="cap 2: put 1, put 2, get 9, put 3")
def _(m):
    c = m.LRUCache(2)
    c.put(1, 1); c.put(2, 2); c.get(9); c.put(3, 3)
    return c.keys(), [3, 2]


@test("100,000 operations stay fast (O(1) each)", input="cap 1000, 100k mixed ops")
def _(m):
    c = m.LRUCache(1000)
    for i in range(100_000):
        c.put(i % 5000, i)
        c.get((i * 7) % 5000)
    return len(c.keys()), 1000
