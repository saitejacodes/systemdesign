import type { SimModel } from "@/lib/sim/engine";

/*
 * Two halves. The inspector is action-driven: the view does the Web Crypto work (HMAC-SHA256 with a
 * secret generated in the tab) and feeds the model tokens and verification results, so this file
 * stays pure and deterministic. The revocation timeline is tick-driven: one user, one stolen access
 * token at logout, and three servers that handle it differently.
 */

// ── base64url (RFC 4648 §5, no padding, as RFC 7515 §2 requires) ───────────

export const b64urlFromBytes = (b: Uint8Array) => btoa(Array.from(b, (c) => String.fromCharCode(c)).join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export function bytesFromB64url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("not base64url: only A–Z a–z 0–9 - _ are allowed");
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(t + "===".slice((t.length + 3) % 4)), (c) => c.charCodeAt(0));
}
export const b64urlEncode = (s: string) => b64urlFromBytes(new TextEncoder().encode(s));
export const b64urlDecode = (s: string) => new TextDecoder("utf-8", { fatal: true }).decode(bytesFromB64url(s));

// ── Decoding and validation ─────────────────────────────────────────────────

export type Json = Record<string, unknown>;
export interface Decoded { parts: string[]; header?: Json; payload?: Json; error?: string }
export function decode(token: string): Decoded {
  const parts = token.trim().split(".");
  if (parts.length !== 3) return { parts, error: `A JWS compact token has 3 dot-separated parts; this has ${parts.length}.` };
  const json = (p: string, what: string): Json => {
    let text: string;
    try { text = b64urlDecode(p); } catch { throw new Error(`The ${what} is not valid base64url.`); }
    let v: unknown;
    try { v = JSON.parse(text); } catch { throw new Error(`The ${what} decodes to "${text.slice(0, 40)}", which is not JSON.`); }
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(`The ${what} must be a JSON object.`);
    return v as Json;
  };
  try { return { parts, header: json(parts[0], "header"), payload: json(parts[1], "payload") }; } catch (e) { return { parts, error: (e as Error).message }; }
}

/** What this demo API accepts. The allowlist belongs to the server, never to the token (RFC 8725 §3.1). */
export const POLICY = { algs: ["HS256"], iss: "https://auth.example.com", aud: "orders-api" } as const;

export type SigState = "none" | "pending" | "valid" | "invalid" | "rejected-alg" | "malformed";
export type Mark = "pass" | "fail" | "pending";
export interface Check { id: string; label: string; mark: Mark; detail: string }

export function checks(d: Decoded | null, sig: SigState, now: number): Check[] {
  if (!d) return [];
  if (d.error || !d.header || !d.payload) return [{ id: "shape", label: "Three parts, JSON header and payload", mark: "fail", detail: d.error ?? "Malformed." }];
  const h = d.header, p = d.payload;
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  const exp = num(p.exp), nbf = num(p.nbf);
  const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
  const alg = String(h.alg);
  const algOk = (POLICY.algs as readonly string[]).includes(alg);
  return [
    { id: "shape", label: "Three parts, JSON header and payload", mark: "pass", detail: "header.payload.signature, each base64url." },
    { id: "alg", label: `alg in the server's allowlist [${POLICY.algs.join(", ")}]`, mark: algOk ? "pass" : "fail", detail: algOk ? "The server picks the algorithm; the header only has to match it." : `alg is "${alg}". Rejected before any signature check (RFC 8725 §3.1).` },
    { id: "sig", label: "Signature verifies with the server's key", mark: !algOk ? "fail" : sig === "valid" ? "pass" : sig === "pending" ? "pending" : "fail", detail: !algOk ? "Not attempted: the algorithm is not allowed." : sig === "valid" ? "HMAC-SHA256 over header.payload matches." : sig === "pending" ? "Verifying…" : "HMAC-SHA256 over header.payload does not match: modified, or signed with another key." },
    { id: "exp", label: "Not expired (exp)", mark: exp === undefined ? "fail" : now < exp ? "pass" : "fail", detail: exp === undefined ? "No exp: this API requires one (RFC 7519 makes it optional; RFC 8725 says to set your own rules)." : now < exp ? `Expires ${rel(exp - now)}.` : `Expired ${rel(exp - now)} (RFC 7519 §4.1.4).` },
    { id: "nbf", label: "Already valid (nbf, if present)", mark: nbf === undefined || now >= nbf ? "pass" : "fail", detail: nbf === undefined ? "No nbf claim." : now >= nbf ? `Valid since ${rel(nbf - now)}.` : `Not valid until ${rel(nbf - now)}.` },
    { id: "iss", label: `Issuer is ${POLICY.iss}`, mark: p.iss === POLICY.iss ? "pass" : "fail", detail: p.iss === POLICY.iss ? "Minted by the issuer this API trusts." : `iss is ${JSON.stringify(p.iss)}.` },
    { id: "aud", label: `Audience includes ${POLICY.aud}`, mark: aud.includes(POLICY.aud) ? "pass" : "fail", detail: aud.includes(POLICY.aud) ? "Addressed to this API." : `aud is ${JSON.stringify(p.aud)}: a token for another service must not work here (RFC 8725 §3.9).` },
  ];
}
export const verdictOf = (cs: Check[]) => (cs.length && cs.every((c) => c.mark === "pass") ? "accept" : cs.some((c) => c.mark === "fail") ? "reject" : "pending");
export function rel(sec: number) {
  const a = Math.abs(Math.round(sec));
  const t = a < 90 ? `${a} s` : a < 5400 ? `${Math.round(a / 60)} min` : `${(a / 3600).toFixed(1)} h`;
  return sec >= 0 ? `in ${t}` : `${t} ago`;
}

// ── Gatekeeper samples ──────────────────────────────────────────────────────

export type SampleId = "good" | "alg-none" | "expired" | "refreshed" | "tampered" | "wrong-aud";
export type Verdict = "accept" | "reject";
export interface Sample { id: SampleId; label: string; mode: "sign" | "none" | "tamper"; expected: Verdict; header: Json; payload: (now: number) => Json; tamper?: Json }
const claims = (now: number, extra: Json = {}): Json => ({ iss: POLICY.iss, sub: "user_8271", aud: POLICY.aud, role: "user", iat: now - 60, exp: now + 840, jti: "a1f3", ...extra });
const HS = { alg: "HS256", typ: "JWT" };
export const SAMPLES: Sample[] = [
  { id: "good", label: "Mobile app request", mode: "sign", expected: "accept", header: HS, payload: (n) => claims(n) },
  { id: "alg-none", label: "Header says alg: none", mode: "none", expected: "reject", header: { alg: "none", typ: "JWT" }, payload: (n) => claims(n, { role: "admin", jti: "b7c2" }) },
  { id: "expired", label: "Yesterday's token", mode: "sign", expected: "reject", header: HS, payload: (n) => claims(n, { iat: n - 86_400, exp: n - 85_500, jti: "c9d0" }) },
  { id: "refreshed", label: "Just refreshed, starts now", mode: "sign", expected: "accept", header: HS, payload: (n) => claims(n, { sub: "user_1904", iat: n, nbf: n, exp: n + 300, jti: "d4e8" }) },
  { id: "tampered", label: "role edited after signing", mode: "tamper", expected: "reject", header: HS, payload: (n) => claims(n, { jti: "e5f1" }), tamper: { role: "admin" } },
  { id: "wrong-aud", label: "Token for the billing API", mode: "sign", expected: "reject", header: HS, payload: (n) => claims(n, { aud: "billing-api", jti: "f2a6" }) },
];

// ── Revocation timeline ─────────────────────────────────────────────────────

export interface JwtConfig { longTtlMin: number; shortTtlMin: number; logoutAt: number; demoMinPerSec: number }
export type LaneId = "long" | "refresh" | "denylist";
export const LANES: { id: LaneId; label: string; how: string }[] = [
  { id: "long", label: "Long-lived JWT, nothing else", how: "Stateless: the API checks the signature and exp, nothing more. Logout only deletes the token on the user's device." },
  { id: "refresh", label: "Short TTL + refresh token", how: "Access tokens live minutes; the client trades a refresh token (revocable, checked by the auth server) for a new one. Logout revokes the refresh token." },
  { id: "denylist", label: "Denylist of revoked jti", how: "Logout adds the token's jti to a shared store until it expires. Every API request checks the store first." },
];
export const TIMELINE_SEC = 3600;
export const REQ_EVERY_SEC = 30;
export interface Issued { iat: number; exp: number; jti: number }
export interface Attempt { t: number; ok: boolean }
export interface Lane { id: LaneId; ttl: number; tokens: Issued[]; stolen?: Issued; refreshes: number; lookups: number; attempts: Attempt[]; lastOk?: number }
export interface Rev { key: string; sec: number; next: number; logoutAt: number; loggedOut: boolean; denied: number[]; jti: number; lanes: Record<LaneId, Lane> }

export interface JwtState {
  now: number;
  token: string; decoded: Decoded | null; sig: SigState;
  source: "pasted" | "signed" | "edited" | "sample"; sampleId?: SampleId;
  signedOk: boolean;
  tamper?: { changed: string[] };
  /** signature → payload part of tokens that verified, to recognise a tampered copy. */
  verified: Record<string, string>;
  judged: Partial<Record<SampleId, Verdict>>;
  rev: Rev;
}

const revKey = (c: Pick<JwtConfig, "longTtlMin" | "shortTtlMin" | "logoutAt">) => `${c.longTtlMin}|${c.shortTtlMin}|${c.logoutAt}`;
export function freshRev(c: Pick<JwtConfig, "longTtlMin" | "shortTtlMin" | "logoutAt">, logoutAt = c.logoutAt * 60): Rev {
  const lane = (id: LaneId, ttl: number): Lane => ({ id, ttl, tokens: [], refreshes: 0, lookups: 0, attempts: [] });
  return { key: revKey(c), sec: 0, next: 0, logoutAt, loggedOut: false, denied: [], jti: 1, lanes: { long: lane("long", c.longTtlMin * 60), refresh: lane("refresh", c.shortTtlMin * 60), denylist: lane("denylist", c.longTtlMin * 60) } };
}

/** One 30-second beat: the user calls the API while logged in; after logout the attacker replays the stolen token. */
function beat(r: Rev, t: number, log: (lvl: "info" | "warn" | "error", m: string) => void) {
  const all = Object.values(r.lanes);
  if (!r.loggedOut && t >= r.logoutAt) {
    r.loggedOut = true;
    for (const l of all) {
      l.stolen = l.tokens.at(-1);
      if (l.id === "denylist" && l.stolen) r.denied.push(l.stolen.jti);
    }
    log("warn", `t=${fmt(t)} user logs out; the access token was already copied`);
  }
  for (const l of all) {
    if (!r.loggedOut) {
      const cur = l.tokens.at(-1);
      if (!cur || t >= cur.exp) {
        // Refresh lane: a refresh-token exchange at the auth server. The others: the user signs in again.
        if (cur && l.id === "refresh") l.refreshes++;
        l.tokens.push({ iat: t, exp: t + l.ttl, jti: r.jti++ });
      }
      if (l.id === "denylist") l.lookups++;
      continue;
    }
    if (!l.stolen) continue;
    if (l.id === "denylist") l.lookups++;
    const ok = t < l.stolen.exp && !(l.id === "denylist" && r.denied.includes(l.stolen.jti));
    l.attempts.push({ t, ok });
    if (ok) l.lastOk = t;
    else if (l.attempts.filter((a) => !a.ok).length === 1) log("info", `t=${fmt(t)} ${l.id}: stolen token rejected${l.id === "denylist" ? " (jti on the denylist)" : " (expired)"}`);
  }
}
export const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
/** Seconds the stolen token kept working after logout (measured at 30 s replays). */
export const exposure = (r: Rev, id: LaneId) => { const l = r.lanes[id]; return l.lastOk === undefined || !l.stolen ? 0 : Math.min(l.lastOk + REQ_EVERY_SEC, l.stolen.exp) - r.logoutAt; };
/** Worst case over every possible logout moment: the token lives until its exp. */
export const worstExposure = (r: Rev, id: LaneId) => (id === "denylist" ? 0 : r.lanes[id].ttl);
/** Auth-server work per logged-in user-hour: refresh exchanges or denylist lookups. */
export const callsPerHour = (r: Rev, id: LaneId) => (id === "refresh" ? 3600 / r.lanes.refresh.ttl : id === "denylist" ? 3600 / REQ_EVERY_SEC : 0);
export const revDone = (r: Rev) => r.sec >= TIMELINE_SEC;

// ── Model ───────────────────────────────────────────────────────────────────

export interface LoadPayload { token: string; now: number; source?: JwtState["source"]; sampleId?: SampleId }

export function load(st: JwtState, p: LoadPayload): JwtState {
  const decoded = decode(p.token);
  const alg = decoded.header?.alg;
  const sig: SigState = decoded.error ? "malformed" : alg !== "HS256" ? "rejected-alg" : "pending";
  return { ...st, now: p.now, token: p.token.trim(), decoded, sig, source: p.source ?? "pasted", sampleId: p.sampleId };
}

export function applyVerify(st: JwtState, p: { token: string; ok: boolean }): JwtState {
  if (p.token.trim() !== st.token || st.sig !== "pending" || !st.decoded) return st;
  const [, payload, sig] = st.decoded.parts;
  const s = structuredClone(st);
  s.sig = p.ok ? "valid" : "invalid";
  if (p.ok) {
    s.verified[sig] = payload;
    const keys = Object.keys(s.verified);
    if (keys.length > 20) delete s.verified[keys[0]];
    if (st.source === "signed") s.signedOk = true;
  } else if (s.verified[sig] && s.verified[sig] !== payload) {
    // Same signature that verified before, different payload: someone edited a signed token.
    const before = decode(`e30.${s.verified[sig]}.x`).payload ?? {};
    const after = st.decoded.payload ?? {};
    const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    if (st.source !== "sample") s.tamper = { changed };
  }
  return s;
}

export const jwtModel: SimModel<JwtConfig, JwtState> = {
  init: (c) => ({ now: 0, token: "", decoded: null, sig: "none", source: "pasted", signedOk: false, verified: {}, judged: {}, rev: freshRev(c) }),
  tick(st, ctx) {
    if (st.rev.key !== revKey(ctx.config)) st.rev = freshRev(ctx.config);
    const r = st.rev;
    if (revDone(r)) return st;
    r.sec = Math.min(TIMELINE_SEC, r.sec + (ctx.dt * ctx.config.demoMinPerSec * 60) / 1000);
    while (r.next <= r.sec && r.next < TIMELINE_SEC) { beat(r, r.next, ctx.log); r.next += REQ_EVERY_SEC; }
    if (revDone(r)) ctx.log("info", `Timeline done. Stolen token worked for ${LANES.map((l) => `${fmt(exposure(r, l.id))} (${l.id})`).join(", ")} after logout`);
    return st;
  },
  actions: {
    load: (st, p) => load(st, p as LoadPayload),
    verified: (st, p) => applyVerify(st, p as { token: string; ok: boolean }),
    judge: (st, p) => {
      const q = (p ?? {}) as { id?: SampleId; verdict?: Verdict };
      if (!q.id || !SAMPLES.some((x) => x.id === q.id) || (q.verdict !== "accept" && q.verdict !== "reject")) return st;
      return { ...st, judged: { ...st.judged, [q.id]: q.verdict } };
    },
    /** Log out at the next request beat instead of the configured minute. */
    logoutNow: (st) => {
      if (st.rev.loggedOut) return st;
      const s = structuredClone(st);
      s.rev.logoutAt = Math.ceil(s.rev.sec / REQ_EVERY_SEC) * REQ_EVERY_SEC;
      return s;
    },
    restart: (st) => {
      const [longTtlMin, shortTtlMin, logoutAt] = st.rev.key.split("|").map(Number);
      return { ...st, rev: freshRev({ longTtlMin, shortTtlMin, logoutAt }) };
    },
  },
  faults: [],
  metrics: (st) => {
    const r = st.rev;
    return {
      minute: r.sec / 60,
      sigValid: st.sig === "valid" ? 1 : 0,
      judged: Object.keys(st.judged).length,
      judgedRight: SAMPLES.filter((x) => st.judged[x.id] === x.expected).length,
      expLong: exposure(r, "long") / 60, expRefresh: exposure(r, "refresh") / 60, expDeny: exposure(r, "denylist") / 60,
      refreshPerHour: callsPerHour(r, "refresh"), lookupsPerHour: callsPerHour(r, "denylist"),
    };
  },
};
