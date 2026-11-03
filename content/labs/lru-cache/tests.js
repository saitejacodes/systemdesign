test("get on a missing key returns -1", "new LRUCache(2).get(1)", (m) => [new m.LRUCache(2).get(1), -1]);

test("put then get returns the value", "put(1, 'a'); get(1)", (m) => {
  const c = new m.LRUCache(2); c.put(1, "a");
  return [c.get(1), "a"];
});

test("evicts the least recently used key", "cap 2: put 1, put 2, put 3", (m) => {
  const c = new m.LRUCache(2); c.put(1, "a"); c.put(2, "b"); c.put(3, "c");
  return [[c.get(1), c.get(2), c.get(3)], [-1, "b", "c"]];
});

test("a get makes the key most recent, so the other key is evicted", "cap 2: put 1, put 2, get 1, put 3", (m) => {
  const c = new m.LRUCache(2); c.put(1, "a"); c.put(2, "b"); c.get(1); c.put(3, "c");
  return [[c.get(2), c.get(1), c.get(3)], [-1, "a", "c"]];
});

test("updating a key changes its value and makes it most recent", "cap 2: put 1, put 2, put 1='z', put 3", (m) => {
  const c = new m.LRUCache(2); c.put(1, "a"); c.put(2, "b"); c.put(1, "z"); c.put(3, "c");
  return [[c.get(1), c.get(2)], ["z", -1]];
});

test("an update does not grow the cache", "cap 2: put 1 three times, put 2", (m) => {
  const c = new m.LRUCache(2); for (const v of "xyz") c.put(1, v); c.put(2, "b");
  return [c.keys().sort(), [1, 2]];
});

test("capacity 1 keeps only the newest key", "cap 1: put 1, put 2", (m) => {
  const c = new m.LRUCache(1); c.put(1, "a"); c.put(2, "b");
  return [[c.get(1), c.get(2), c.keys()], [-1, "b", [2]]];
});

test("keys() lists most to least recent", "cap 3: put 1, 2, 3; get 1", (m) => {
  const c = new m.LRUCache(3); c.put(1, 1); c.put(2, 2); c.put(3, 3); c.get(1);
  return [c.keys(), [1, 3, 2]];
});

test("a miss does not change the order", "cap 2: put 1, put 2, get 9, put 3", (m) => {
  const c = new m.LRUCache(2); c.put(1, 1); c.put(2, 2); c.get(9); c.put(3, 3);
  return [c.keys(), [3, 2]];
});

test("100,000 operations stay fast (O(1) each)", "cap 1000, 100k mixed ops", (m) => {
  const c = new m.LRUCache(1000);
  for (let i = 0; i < 100000; i++) { c.put(i % 5000, i); c.get((i * 7) % 5000); }
  return [c.keys().length, 1000];
});
