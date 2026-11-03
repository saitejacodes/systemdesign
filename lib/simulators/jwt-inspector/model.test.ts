import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { makeSample, sign, verify } from "./crypto";
import { SAMPLES, b64urlDecode, b64urlEncode, bytesFromB64url, checks, decode, exposure, jwtModel, verdictOf, type JwtConfig, type JwtState } from "./model";

const CFG: JwtConfig = { longTtlMin: 60, shortTtlMin: 15, logoutAt: 23, demoMinPerSec: 2 };
const NOW = 1_790_000_000;
const SECRET = new Uint8Array(32).map((_, i) => i * 7 + 1);
const sim = (patch: Partial<JwtConfig> = {}, seed = 1) => new Simulation(jwtModel, { ...CFG, ...patch }, seed);
const check = (id: string, s: Simulation<JwtConfig, JwtState>) => challenges.find((c) => c.id === id)!.winCondition(s.metrics.history(), s.state);

/** What the view does: load, then feed the Web Crypto result back in. */
async function feed(s: Simulation<JwtConfig, JwtState>, token: string, source: JwtState["source"], secret = SECRET, sampleId?: string) {
  s.act("load", { token, now: NOW, source, sampleId });
  if (s.state.sig === "pending") s.act("verified", { token, ok: await verify(token, secret) });
}

describe("base64url and decoding", () => {
  it("round-trips UTF-8 without padding and rejects base64-only characters", () => {
    const e = b64urlEncode('{"name":"Zoë ✓"}');
    expect(e).not.toMatch(/[=+/]/);
    expect(b64urlDecode(e)).toBe('{"name":"Zoë ✓"}');
    expect(() => bytesFromB64url("ab+c")).toThrow();
    expect(() => bytesFromB64url("a")).toThrow();
  });

  it("explains malformed tokens", () => {
    expect(decode("abc.def").error).toMatch(/3 dot-separated parts/);
    expect(decode(`${b64urlEncode("hello")}.e30.x`).error).toMatch(/not JSON/);
  });

  // RFC 7515 Appendix A.1: the spec's own HS256 example must verify with the spec's key.
  it("verifies the RFC 7515 A.1 HS256 example", async () => {
    const key = bytesFromB64url("AyM1SysPpbyDfgZld3umj1qzKObwVMkoqQ-EstJQLr_T-1qS0gZH75aKtMN3Yj0iPS4hcgUuTwjAzZr1Z9CAow");
    const t = "eyJ0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(await verify(t, key)).toBe(true);
    expect(decode(t).payload).toEqual({ iss: "joe", exp: 1300819380, "http://example.com/is_root": true });
  });
});

describe("validation (RFC 7519 §7.2, RFC 8725 §3.1)", () => {
  it.each(SAMPLES.map((x) => [x.id, x] as const))("sample %s is judged %s by the checks", async (_id, x) => {
    const s = sim();
    await feed(s, await makeSample(x, SECRET, NOW), "sample", SECRET, x.id);
    expect(verdictOf(checks(s.state.decoded, s.state.sig, NOW))).toBe(x.expected);
  });

  it("alg: none is rejected by the allowlist and never verified", async () => {
    const s = sim();
    s.act("load", { token: await makeSample(SAMPLES[1], SECRET, NOW), now: NOW, source: "sample" });
    expect(s.state.sig).toBe("rejected-alg");
    const cs = checks(s.state.decoded, s.state.sig, NOW);
    expect(cs.find((c) => c.id === "alg")!.mark).toBe("fail");
    expect(cs.find((c) => c.id === "sig")!.detail).toMatch(/Not attempted/);
  });

  it("a token signed with another key fails, and a late verification result for an old token is ignored", async () => {
    const s = sim();
    const t = await sign({ alg: "HS256", typ: "JWT" }, { iss: "x" }, SECRET);
    await feed(s, t, "pasted", new Uint8Array(32));
    expect(s.state.sig).toBe("invalid");
    s.act("load", { token: t, now: NOW });
    s.act("verified", { token: "other", ok: true });
    expect(s.state.sig).toBe("pending");
  });
});

describe("revocation timeline", () => {
  it("a stolen long-lived token works until exp; short TTL bounds it; denylist closes it", () => {
    const s = sim();
    s.runFor(31_000); // 62 demo minutes at 2 min/s
    const r = s.state.rev;
    expect(exposure(r, "long") / 60).toBe(37); // issued at 0, exp 60, logout 23
    expect(exposure(r, "refresh") / 60).toBe(7); // token [15, 30) copied at 23
    expect(exposure(r, "denylist")).toBe(0);
    expect(r.lanes.refresh.refreshes).toBe(1);
    expect(r.lanes.denylist.lookups).toBeGreaterThan(100);
  });

  it("is deterministic and restarts when a TTL changes", () => {
    const a = sim(), b = sim();
    a.runFor(10_000); b.runFor(10_000);
    expect(a.state.rev).toEqual(b.state.rev);
    a.setConfig({ shortTtlMin: 5 });
    a.step();
    expect(a.state.rev.sec).toBeLessThan(2); // one tick into a fresh timeline
    expect(a.state.rev.lanes.refresh.ttl).toBe(300);
  });

  it("logout now moves the logout to the next beat", () => {
    const s = sim();
    s.runFor(3_000); // 6 demo minutes
    s.act("logoutNow");
    s.runFor(500);
    expect(s.state.rev.loggedOut).toBe(true);
    expect(s.state.rev.logoutAt).toBe(360);
  });
});

describe("challenges", () => {
  it("tamper: sign, verify, edit without re-signing → caught; never editing fails", async () => {
    const s = sim();
    const t = await sign({ alg: "HS256", typ: "JWT" }, { sub: "u1", role: "user" }, SECRET);
    await feed(s, t, "signed");
    expect(check("tamper", s).passed).toBe(false);
    const [h, , sig] = t.split(".");
    await feed(s, `${h}.${b64urlEncode(JSON.stringify({ sub: "u1", role: "admin" }))}.${sig}`, "edited");
    expect(s.state.sig).toBe("invalid");
    expect(s.state.tamper!.changed).toEqual(["role"]);
    expect(check("tamper", s).passed).toBe(true);
  });

  it("gatekeeper: all correct passes, accepting everything fails", () => {
    const s = sim();
    for (const x of SAMPLES) s.act("judge", { id: x.id, verdict: x.expected });
    expect(check("gatekeeper", s).passed).toBe(true);
    for (const x of SAMPLES) s.act("judge", { id: x.id, verdict: "accept" });
    expect(check("gatekeeper", s).passed).toBe(false);
  });

  it.each([1, 2, 3, 4, 5])("logout sticks: TTL 3–5 passes; 15 (default), 6 and 2 fail (seed %i)", (seed) => {
    const run = (shortTtlMin: number) => {
      const s = sim({ shortTtlMin }, seed);
      while (!challenges[2].done!(s.state)) s.step();
      return check("logout-sticks", s).passed;
    };
    expect([3, 4, 5].map(run)).toEqual([true, true, true]);
    expect([15, 6, 2].map(run)).toEqual([false, false, false]);
  });
});
