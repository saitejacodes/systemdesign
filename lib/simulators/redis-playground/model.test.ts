import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { execLine, format, globToRegex, hllAdd, hllCount, initState, peek, redisModel, tokenize, type RedisState } from "./model";

const WT = "(error) WRONGTYPE Operation against a key holding the wrong kind of value";
const NI = "(error) ERR value is not an integer or out of range";
const args = (n: string) => `(error) ERR wrong number of arguments for '${n}' command`;

/** Runs lines and returns the last output, joined like a terminal would print it. */
function cli(s: RedisState = initState()) {
  return Object.assign((...lines: string[]) => lines.map((l) => execLine(s, l).out.join("\n")).at(-1)!, { s });
}

describe("parsing and reply format", () => {
  it("splits arguments like redis-cli", () => {
    expect(tokenize(`SET greeting "hello world"`)).toEqual(["SET", "greeting", "hello world"]);
    expect(tokenize(`SET k 'it\\'s' "a\\nb" "\\x41"`)).toEqual(["SET", "k", "it's", "a\nb", "A"]);
    expect(tokenize("  ")).toEqual([]);
    expect(tokenize(`GET "open`)).toBeNull();
    expect(tokenize(`GET "a"b`)).toBeNull();
    expect(cli()(`GET "open`)).toBe("Invalid argument(s)");
  });
  it("prints replies the way redis-cli does", () => {
    expect(format({ t: "arr", v: [] })).toEqual(["(empty array)"]);
    expect(format({ t: "bulk", v: 'say "hi"\n' })).toEqual(['"say \\"hi\\"\\n"']);
    const ten = Array.from({ length: 10 }, (_, i) => ({ t: "bulk" as const, v: String(i) }));
    expect(format({ t: "arr", v: ten })[0]).toBe(' 1) "0"');
    expect(format({ t: "arr", v: [{ t: "bulk", v: "0" }, { t: "arr", v: [{ t: "bulk", v: "a" }, { t: "bulk", v: "b" }] }] })).toEqual(['1) "0"', '2) 1) "a"', '   2) "b"']);
  });
  it("matches glob patterns", () => {
    expect(globToRegex("user:*").test("user:42")).toBe(true);
    expect(globToRegex("h?llo").test("hallo")).toBe(true);
    expect(globToRegex("h[ae]llo").test("hillo")).toBe(false);
    expect(globToRegex("a.b").test("axb")).toBe(false);
  });
  it("rejects unknown commands and wrong arity", () => {
    const r = cli();
    expect(r("FOO a b")).toBe("(error) ERR unknown command 'FOO', with args beginning with: 'a' 'b' ");
    expect(r("GET")).toBe(args("get"));
    expect(r("get a b")).toBe(args("get"));
    expect(r("MSET a 1 b")).toBe(args("mset"));
    expect(r("HSET h f")).toBe(args("hset"));
    expect(r("PING")).toBe("PONG");
    expect(r(`PING "hi there"`)).toBe('"hi there"');
  });
});

describe("strings and keys", () => {
  it("SET and GET with options", () => {
    const r = cli();
    expect(r("GET nope")).toBe("(nil)");
    expect(r(`SET greeting "hello world"`)).toBe("OK");
    expect(r("GET greeting")).toBe('"hello world"');
    expect(r("SET greeting x NX")).toBe("(nil)");
    expect(r("SET other x XX")).toBe("(nil)");
    expect(r("SET greeting bye XX")).toBe("OK");
    expect(r("SET k v NX XX")).toBe("(error) ERR syntax error");
    expect(r("SET k v EX 0")).toBe("(error) ERR invalid expire time in 'set' command");
    expect(r("SET k v EX ten")).toBe(NI);
    expect(r("SET k v EX")).toBe("(error) ERR syntax error");
    expect(r("SET k v PX 1500", "PTTL k")).toBe("(integer) 1500");
  });
  it("DEL, EXISTS, TYPE, MGET, MSET", () => {
    const r = cli();
    expect(r("MSET a 1 b 2")).toBe("OK");
    expect(r("RPUSH l x", "MGET a b l nope")).toBe('1) "1"\n2) "2"\n3) (nil)\n4) (nil)');
    expect(r("EXISTS a a nope")).toBe("(integer) 2");
    expect(r("TYPE l")).toBe("list");
    expect(r("TYPE nope")).toBe("none");
    expect(r("DEL a b nope")).toBe("(integer) 2");
    expect(r("DBSIZE")).toBe("(integer) 1");
    expect(r("FLUSHALL", "DBSIZE")).toBe("(integer) 0");
  });
  it("INCR family: counters, non-integers, overflow, wrong type", () => {
    const r = cli();
    expect(r("INCR c")).toBe("(integer) 1");
    expect(r("INCRBY c 10")).toBe("(integer) 11");
    expect(r("DECR c")).toBe("(integer) 10");
    expect(r("DECRBY c 15")).toBe("(integer) -5");
    expect(r("SET s abc", "INCR s")).toBe(NI);
    expect(r("SET f 1.5", "INCR f")).toBe(NI);
    expect(r("INCRBY c x")).toBe(NI);
    expect(r(`SET big ${Number.MAX_SAFE_INTEGER}`, "INCR big")).toBe("(error) ERR increment or decrement would overflow");
    expect(r("LPUSH l a", "INCR l")).toBe(WT);
    expect(r("GET l")).toBe(WT);
  });
  it("KEYS warns, SCAN pages with a cursor", () => {
    const r = cli();
    r("MSET user:1 a user:2 b page:1 c");
    const line = execLine(r.s, "KEYS user:*");
    expect(line.out).toEqual(['1) "user:1"', '2) "user:2"']);
    expect(line.note).toMatch(/SCAN/);
    expect(r("KEYS zzz*")).toBe("(empty array)");
    expect(r("SCAN 0 COUNT 2")).toBe('1) "2"\n2) 1) "user:1"\n   2) "user:2"');
    expect(r("SCAN 2 COUNT 2")).toBe('1) "0"\n2) 1) "page:1"');
    expect(r("SCAN 0 MATCH page:* COUNT 2")).toBe('1) "2"\n2) (empty array)');
    expect(r("SCAN abc")).toBe("(error) ERR invalid cursor");
  });
});

describe("TTLs on the simulated clock", () => {
  it("EXPIRE, TTL, PERSIST and lazy expiry", () => {
    const r = cli();
    expect(r("TTL nope")).toBe("(integer) -2");
    expect(r("SET k v", "TTL k")).toBe("(integer) -1");
    expect(r("EXPIRE nope 10")).toBe("(integer) 0");
    expect(r("EXPIRE k 10", "TTL k")).toBe("(integer) 10");
    r.s.now += 3_400;
    expect(r("TTL k")).toBe("(integer) 7");
    expect(r("PERSIST k", "TTL k")).toBe("(integer) -1");
    expect(r("PERSIST k")).toBe("(integer) 0");
    r("EXPIRE k 5");
    r.s.now += 5_000;
    expect(r.s.db.has("k")).toBe(true); // still in memory until touched
    expect(r("GET k")).toBe("(nil)");
    expect(r.s.db.has("k")).toBe(false);
    expect(r.s.stats.lazy).toBe(1);
  });
  it("a plain SET drops the TTL, KEEPTTL keeps it; EXPIRE options and non-positive expiry", () => {
    const r = cli();
    expect(r("SET k v EX 100", "SET k w", "TTL k")).toBe("(integer) -1");
    expect(r("SET k v EX 100", "SET k w KEEPTTL", "TTL k")).toBe("(integer) 100");
    expect(r("EXPIRE k 50 NX")).toBe("(integer) 0");
    expect(r("EXPIRE k 50 GT")).toBe("(integer) 0");
    expect(r("EXPIRE k 50 LT", "TTL k")).toBe("(integer) 50");
    expect(r("EXPIRE k 50 FOO")).toBe("(error) ERR Unsupported option FOO");
    expect(r("EXPIRE k 0", "EXISTS k")).toBe("(integer) 0");
  });
  it("the active cycle reclaims expired keys only while it runs (fault turns it off)", () => {
    const sim = new Simulation(redisModel, { group: "strings" }, 7);
    sim.act("exec", "SET a 1 EX 1");
    sim.act("exec", "SET b 2 EX 1");
    sim.act("exec", "SET c 3");
    sim.toggleFault("no-active-expiry");
    sim.runFor(2_000);
    expect(sim.state.db.size).toBe(3);
    expect(peek(sim.state, "a")).toBeUndefined();
    sim.toggleFault("no-active-expiry");
    sim.runFor(300);
    expect([...sim.state.db.keys()]).toEqual(["c"]);
    expect(sim.state.stats.active).toBe(2);
    expect(sim.log.entries().some((e) => e.message.includes("Active expiry removed a"))).toBe(true);
  });
  it("fast-forward moves the clock without ticking", () => {
    const sim = new Simulation(redisModel, { group: "strings" }, 1);
    sim.act("exec", "SET s v EX 1800");
    sim.act("forward", 1799);
    sim.act("exec", "TTL s");
    expect(sim.state.lines.at(-1)!.out).toEqual(["(integer) 1"]);
    sim.act("forward", 1);
    sim.act("exec", "GET s");
    expect(sim.state.lines.at(-1)!.out).toEqual(["(nil)"]);
  });
});

describe("hashes, lists, sets", () => {
  it("hash commands", () => {
    const r = cli();
    expect(r(`HSET user:42 name "Ada" plan pro logins 17`)).toBe("(integer) 3");
    expect(r("HSET user:42 plan free")).toBe("(integer) 0");
    expect(r("HINCRBY user:42 logins 1")).toBe("(integer) 18");
    expect(r("HINCRBY user:42 name 1")).toBe("(error) ERR hash value is not an integer");
    expect(r("HGET user:42 plan")).toBe('"free"');
    expect(r("HGET user:42 nope")).toBe("(nil)");
    expect(r("HGETALL user:42")).toBe('1) "name"\n2) "Ada"\n3) "plan"\n4) "free"\n5) "logins"\n6) "18"');
    expect(r("HGETALL nope")).toBe("(empty array)");
    expect(r("HDEL user:42 name plan logins nope")).toBe("(integer) 3");
    expect(r("EXISTS user:42")).toBe("(integer) 0");
    expect(r("SET s x", "HGET s f")).toBe(WT);
  });
  it("list commands", () => {
    const r = cli();
    expect(r("LPUSH l a b c")).toBe("(integer) 3");
    expect(r("RPUSH l z")).toBe("(integer) 4");
    expect(r("LRANGE l 0 -1")).toBe('1) "c"\n2) "b"\n3) "a"\n4) "z"');
    expect(r("LRANGE l -2 99")).toBe('1) "a"\n2) "z"');
    expect(r("LRANGE l 5 9")).toBe("(empty array)");
    expect(r("LPOP l")).toBe('"c"');
    expect(r("RPOP l 2")).toBe('1) "z"\n2) "a"');
    expect(r("LLEN l")).toBe("(integer) 1");
    expect(r("RPOP l", "EXISTS l")).toBe("(integer) 0");
    expect(r("LPOP nope")).toBe("(nil)");
    expect(r("LPOP nope 2")).toBe("(nil)");
    expect(r("LPOP l -1")).toBe("(error) ERR value is out of range, must be positive");
    expect(r("LPOP l 1 2")).toBe(args("lpop"));
    expect(r("SADD s a", "LPUSH s x")).toBe(WT);
  });
  it("set commands", () => {
    const r = cli();
    expect(r("SADD likes u1 u2 u1")).toBe("(integer) 2");
    expect(r("SISMEMBER likes u1")).toBe("(integer) 1");
    expect(r("SISMEMBER likes u9")).toBe("(integer) 0");
    expect(r("SCARD likes")).toBe("(integer) 2");
    expect(r("SMEMBERS likes")).toBe('1) "u1"\n2) "u2"');
    expect(r("SREM likes u1 u9")).toBe("(integer) 1");
    expect(r("SREM likes u2", "SMEMBERS likes")).toBe("(empty array)");
    expect(r("SCARD nope")).toBe("(integer) 0");
    expect(r("SET x 1", "SADD x a")).toBe(WT);
  });
});

describe("sorted sets", () => {
  it("ZADD, ranges, ranks and scores", () => {
    const r = cli();
    expect(r("ZADD lb 1500 alice 1320 bob 1320 ann")).toBe("(integer) 3");
    expect(r("ZINCRBY lb 40 bob")).toBe('"1360"');
    expect(r("ZRANGE lb 0 -1 WITHSCORES")).toBe('1) "ann"\n2) "1320"\n3) "bob"\n4) "1360"\n5) "alice"\n6) "1500"');
    expect(r("ZREVRANGE lb 0 1")).toBe('1) "alice"\n2) "bob"');
    expect(r("ZRANGE lb 0 0 REV")).toBe('1) "alice"');
    expect(r("ZRANK lb ann")).toBe("(integer) 0");
    expect(r("ZREVRANK lb ann")).toBe("(integer) 2");
    expect(r("ZRANK lb nobody")).toBe("(nil)");
    expect(r("ZSCORE lb alice")).toBe('"1500"');
    expect(r("ZSCORE lb nobody")).toBe("(nil)");
    expect(r("ZADD lb 1 alice")).toBe("(integer) 0");
    expect(r("ZADD lb CH 2 alice 5 zed")).toBe("(integer) 2");
    expect(r("ZADD lb NX 99 alice")).toBe("(integer) 0");
    expect(r("ZADD lb INCR 0.5 alice")).toBe('"2.5"');
    expect(r("ZADD lb abc x")).toBe("(error) ERR value is not a valid float");
    expect(r("ZADD lb 1 a 2")).toBe("(error) ERR syntax error");
    expect(r("ZADD lb NX XX 1 a")).toBe("(error) ERR XX and NX options at the same time are not compatible");
    expect(r("ZADD lb +inf top", "ZSCORE lb top")).toBe('"inf"');
    expect(r("ZREM lb top zed nobody")).toBe("(integer) 2");
    expect(r("ZCARD lb")).toBe("(integer) 3");
    expect(r("ZRANGE lb 0 -1 BYSCORE")).toBe("(error) ERR syntax error");
    expect(r("ZRANGE nope 0 -1")).toBe("(empty array)");
    expect(r("SET s x", "ZADD s 1 a")).toBe(WT);
  });
});

describe("HyperLogLog", () => {
  it("is approximate (about 3% error with 1,024 registers) and ignores repeats", () => {
    const reg = new Array<number>(1024).fill(0);
    for (let i = 0; i < 10_000; i++) hllAdd(reg, `user:${i}`);
    const n = hllCount(reg);
    expect(Math.abs(n - 10_000) / 10_000).toBeLessThan(0.1);
    const r = cli();
    expect(r("PFADD v a b c")).toBe("(integer) 1");
    expect(r("PFADD v a b")).toBe("(integer) 0");
    expect(r("PFCOUNT v")).toBe("(integer) 3");
    expect(r("PFADD w c d", "PFCOUNT v w nope")).toBe("(integer) 4");
    expect(r("PFADD empty")).toBe("(integer) 1");
    expect(r("PFCOUNT nope")).toBe("(integer) 0");
    expect(r("TYPE v")).toBe("string");
    expect(r("SADD s a", "PFADD s x")).toBe(WT);
  });
});

describe("MULTI / EXEC", () => {
  it("queues, runs back to back, and has no rollback", () => {
    const r = cli();
    expect(r("SET s abc", "MULTI")).toBe("OK");
    expect(r("INCR n")).toBe("QUEUED");
    expect(r("INCR s")).toBe("QUEUED");
    expect(r("GET n")).toBe("QUEUED"); // queued, so nothing has run yet
    expect(r("MULTI")).toBe("(error) ERR MULTI calls can not be nested");
    expect(r("EXEC")).toBe(`1) (integer) 1\n2) ${NI}\n3) "1"`);
    expect(r("GET n")).toBe('"1"');
  });
  it("aborts on a queue-time error and handles DISCARD", () => {
    const r = cli();
    r("MULTI", "INCR n");
    expect(r("INCR")).toBe(args("incr"));
    expect(r("EXEC")).toBe("(error) EXECABORT Transaction discarded because of previous errors.");
    expect(r("GET n")).toBe("(nil)");
    expect(r("EXEC")).toBe("(error) ERR EXEC without MULTI");
    expect(r("DISCARD")).toBe("(error) ERR DISCARD without MULTI");
    expect(r("MULTI", "SET a 1", "DISCARD", "EXISTS a")).toBe("(integer) 0");
    expect(r("MULTI", "EXEC")).toBe("(empty array)");
  });
});

describe("exercises and challenges", () => {
  const win = (id: string, s: RedisState) => challenges.find((c) => c.id === id)!.winCondition([] as never, s);
  const GOOD: Record<string, string[]> = {
    "exercises-strings": [`SET session:9f2c '{"userId":42}' EX 1800`, "INCR page:home:views", "INCR page:home:views", "INCR page:home:views"],
    "exercises-structures": [
      "ZADD leaderboard 10 a 20 b 30 c 40 d 50 e 60 f 70 g 80 h 90 i 100 j 110 k", "ZREVRANGE leaderboard 0 9 WITHSCORES", "ZREVRANK leaderboard c",
      "PFADD visitors:2026-11-02 u1 u2 u3 u4 u5 u1", "PFCOUNT visitors:2026-11-02",
    ],
    "exercises-atomic": ["MULTI", "INCR rate:user:42", "EXPIRE rate:user:42 60", "EXEC", "MSET balance:alice 100 balance:bob 50", "MULTI", "DECRBY balance:alice 30", "INCRBY balance:bob 30", "EXEC"],
  };
  const BAD: Record<string, string[]> = {
    // No TTL on the session; the counter written with SET.
    "exercises-strings": [`SET session:9f2c '{"userId":42}'`, "SET page:home:views 3"],
    // Only 3 players; no repeat visitor.
    "exercises-structures": ["ZADD leaderboard 1 a 2 b 3 c", "ZREVRANGE leaderboard 0 9", "ZREVRANK leaderboard a", "PFADD visitors:d u1 u2 u3 u4 u5", "PFCOUNT visitors:d"],
    // The naive limiter outside MULTI; a transfer that creates money.
    "exercises-atomic": ["INCR rate:user:42", "EXPIRE rate:user:42 60", "MULTI", "INCRBY balance:alice 30", "INCRBY balance:bob 30", "EXEC"],
  };
  for (const c of challenges) {
    it(`${c.id}: passes for a good session and fails for a bad one`, () => {
      const good = cli();
      good(...GOOD[c.id]);
      expect(win(c.id, good.s).passed).toBe(true);
      expect(c.done!(good.s)).toBe(true);
      const bad = cli();
      bad(...BAD[c.id]);
      const o = win(c.id, bad.s);
      expect(o.passed).toBe(false);
      expect(o.value).toBe(0);
    });
  }
  it("the session exercise fails once the session has expired", () => {
    const r = cli();
    r(`SET session:1 '{"userId":1}' EX 1`);
    expect(r.s.passed.session).toBe(true); // sticky once passed
    const late = cli();
    late("SET session:1 v EX 1");
    late.s.now += 2_000;
    late.s.passed = {};
    late("PING");
    expect(late.s.passed.session).toBeUndefined();
  });
});

describe("determinism", () => {
  it("same seed and commands give the same state", () => {
    const run = () => {
      const sim = new Simulation(redisModel, { group: "strings" }, 42);
      for (let i = 0; i < 60; i++) sim.act("exec", `SET k${i} v EX ${1 + (i % 5)}`);
      sim.runFor(3_000);
      return { keys: [...sim.state.db.keys()], m: sim.latest };
    };
    expect(run()).toEqual(run());
  });
});
