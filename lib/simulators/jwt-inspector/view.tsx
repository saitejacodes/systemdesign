"use client";
import { useEffect, useRef, useState } from "react";
import type { ViewProps } from "@/lib/sim/definition";
import { makeSample, newSecret, sign, verify } from "./crypto";
import { LANES, POLICY, SAMPLES, TIMELINE_SEC, b64urlEncode, b64urlFromBytes, callsPerHour, checks, decode, exposure, fmt, rel, verdictOf, worstExposure, type Json, type JwtConfig, type JwtState, type LoadPayload, type Mark, type SampleId } from "./model";

type Act = ViewProps<JwtConfig, JwtState>["act"];
const nowSec = () => Math.floor(Date.now() / 1000);
const PART = ["var(--status-over)", "var(--phase-4)", "var(--cobalt)"];
const MARK: Record<Mark, { c: string; t: string }> = { pass: { c: "var(--status-ok)", t: "PASS" }, fail: { c: "var(--status-over)", t: "FAIL" }, pending: { c: "var(--ink-muted)", t: "…" } };
const DOCS: Record<string, string> = {
  alg: "Algorithm the signer used (RFC 7515 §4.1.1). The server must not let this choose how to verify.",
  typ: "Media type, usually JWT (RFC 7519 §5.1).",
  kid: "Key id: which key to verify with, for key rotation (RFC 7515 §4.1.4).",
  iss: "Issuer: who minted it (RFC 7519 §4.1.1). Compare with the one issuer you trust.",
  sub: "Subject: the user or service it is about (§4.1.2).",
  aud: "Audience: the API it is for (§4.1.3). Reject tokens addressed elsewhere.",
  exp: "Expiration, seconds since 1970 (§4.1.4). Reject at or after it.",
  nbf: "Not before (§4.1.5). Reject earlier.",
  iat: "Issued at (§4.1.6). Informational.",
  jti: "JWT id (§4.1.7): unique per token; what a denylist stores.",
};
const TIME = new Set(["exp", "nbf", "iat"]);

export function JwtView({ state: s, act }: ViewProps<JwtConfig, JwtState>) {
  const secret = useRef<Uint8Array | null>(null);
  const [secretText, setSecretText] = useState("");
  const [show, setShow] = useState(false);

  const loadToken = (token: string, source: LoadPayload["source"], sampleId?: SampleId) => {
    act("load", { token, now: nowSec(), source, sampleId });
    const d = decode(token);
    if (!d.error && d.header?.alg === "HS256" && secret.current) verify(token, secret.current).then((ok) => act("verified", { token, ok }));
  };
  const signNew = async (payload?: Json, header: Json = { alg: "HS256", typ: "JWT" }) => {
    if (!secret.current) return;
    const n = nowSec();
    const p = payload ?? { iss: POLICY.iss, sub: "user_8271", aud: POLICY.aud, name: "Ada", role: "user", iat: n, exp: n + 900, jti: crypto.randomUUID().slice(0, 8) };
    loadToken(await sign(header, p, secret.current), "signed");
  };
  const rotate = () => {
    secret.current = newSecret();
    setSecretText(b64urlFromBytes(secret.current));
  };
  // First visit: make a secret and a token so there is something to read.
  useEffect(() => {
    rotate();
    if (!s.token) void signNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cs = checks(s.decoded, s.sig, s.now);
  const verdict = verdictOf(cs);
  return (
    <div className="grid gap-4 p-3 text-[14px] [&>*]:min-w-0">
      <section aria-label="Demo secret" className="flex flex-wrap items-center gap-2">
        <span className="fm-cap">Demo HS256 secret · 256 bits made in this tab, never sent anywhere</span>
        <code className="max-w-full truncate font-mono text-[12px]">{show ? secretText : "•".repeat(16)}</code>
        <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => setShow((v) => !v)}>{show ? "Hide" : "Show"}</button>
        <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => { rotate(); if (s.token) loadToken(s.token, s.source, s.sampleId); }}>New secret</button>
      </section>

      <Token s={s} onPaste={(t) => loadToken(t, "pasted")} onSign={() => void signNew()} />
      {s.decoded && !s.decoded.error && <Decoded key={s.token} s={s} onApply={(p, resign) => (resign ? void signNew(p, s.decoded!.header) : loadToken(`${s.decoded!.parts[0]}.${b64urlEncode(JSON.stringify(p))}.${s.decoded!.parts[2]}`, "edited"))} />}

      <section aria-label="Validation" className="fm-card grid gap-2 p-3" style={{ borderColor: verdict === "accept" ? "var(--status-ok)" : verdict === "reject" ? "var(--status-over)" : undefined, borderWidth: verdict === "pending" ? 1 : 2 }}>
        <h3 className="fm-cap !text-ink">orders-api checks · verdict: <span style={{ color: verdict === "accept" ? "var(--status-ok)" : verdict === "reject" ? "var(--status-over)" : undefined }}>{verdict.toUpperCase()}</span></h3>
        <ol className="grid gap-1">
          {cs.map((c) => (
            <li key={c.id} className="grid grid-cols-[3.5rem_1fr] gap-2">
              <span className="fm-cap font-semibold" style={{ color: MARK[c.mark].c }}>{MARK[c.mark].t}</span>
              <span><strong className="font-medium">{c.label}.</strong> {c.detail}</span>
            </li>
          ))}
        </ol>
        {s.tamper && s.source === "edited" && <p role="status" style={{ color: "var(--status-over)" }}>TAMPERED · {s.tamper.changed.join(", ")} changed after signing; the old signature no longer matches.</p>}
      </section>

      <AlgNone />
      <Gatekeeper s={s} act={act} onLoad={async (id) => { const x = SAMPLES.find((y) => y.id === id)!; if (secret.current) loadToken(await makeSample(x, secret.current, nowSec()), "sample", id); }} />
      <Timeline s={s} act={act} />
    </div>
  );
}

function Token({ s, onPaste, onSign }: { s: JwtState; onPaste(t: string): void; onSign(): void }) {
  const parts = s.decoded?.parts ?? [];
  return (
    <section aria-label="Token" className="grid gap-2">
      <label className="grid gap-1">
        <span className="fm-cap">Encoded token · paste your own (it stays in this tab)</span>
        <textarea className="fm-input min-h-[5.5rem] font-mono text-[12px] break-all" spellCheck={false} value={s.token} onChange={(e) => onPaste(e.target.value)} />
      </label>
      <p className="font-mono text-[12px] break-all" aria-label="Token parts">
        {parts.map((p, i) => <span key={i}>{i > 0 && <span>.</span>}<span style={{ color: PART[i] }}>{p || (i === 2 ? "(empty)" : "")}</span></span>)}
      </p>
      <p className="fm-cap"><span style={{ color: PART[0] }}>HEADER</span> . <span style={{ color: PART[1] }}>PAYLOAD</span> . <span style={{ color: PART[2] }}>SIGNATURE</span> · base64url, not encryption: anyone can decode the first two</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="fm-btn fm-btn--tool is-on !h-8" onClick={onSign}>Sign new token with demo secret</button>
      </div>
      {s.decoded?.error && <p role="status" style={{ color: "var(--status-over)" }}>MALFORMED · {s.decoded.error}</p>}
    </section>
  );
}

function Decoded({ s, onApply }: { s: JwtState; onApply(p: Json, resign: boolean): void }) {
  const d = s.decoded!;
  const [text, setText] = useState(() => JSON.stringify(d.payload, null, 2));
  let parsed: Json | undefined, err = "";
  try { const v = JSON.parse(text); if (v && typeof v === "object" && !Array.isArray(v)) parsed = v; else err = "Must be a JSON object."; } catch (e) { err = (e as Error).message; }
  const sigText = { none: "", pending: "VERIFYING…", valid: "VALID · signature matches", invalid: "INVALID · signature does not match", "rejected-alg": "NOT CHECKED · alg not allowed", malformed: "" }[s.sig];
  const sigColor = s.sig === "valid" ? "var(--status-ok)" : s.sig === "pending" ? "var(--ink-muted)" : "var(--status-over)";
  const rows = [...Object.entries(d.header!).map(([k, v]) => ["header", k, v] as const), ...Object.entries(d.payload!).map(([k, v]) => ["payload", k, v] as const)];
  return (
    <div className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0">
      <figure className="grid content-start gap-1">
        <figcaption className="fm-cap">Decoded claims</figcaption>
        <div className="overflow-x-auto border border-ink" style={{ borderRadius: 2 }}>
          <table className="w-full text-[13px]">
            <tbody>
              {rows.map(([where, k, v]) => (
                <tr key={`${where}${k}`} className="align-top">
                  <td className="whitespace-nowrap border-b border-line px-2 py-1 font-mono text-[12px]" style={{ color: where === "header" ? PART[0] : PART[1] }}>{k}</td>
                  <td className="border-b border-line px-2 py-1 font-mono text-[12px] break-all">{JSON.stringify(v)}{TIME.has(k) && typeof v === "number" && <span className="block opacity-70">{new Date(v * 1000).toISOString().replace(".000", "")} · {rel(v - s.now)}</span>}</td>
                  <td className="border-b border-line px-2 py-1">{DOCS[k] ?? "Private claim: readable by anyone holding the token."}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </figure>
      <div className="grid content-start gap-2">
        <label className="grid gap-1">
          <span className="fm-cap">Edit the payload</span>
          <textarea className="fm-input min-h-[11rem] font-mono text-[12px]" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} aria-invalid={!!err} />
        </label>
        {err && <p className="fm-cap" style={{ color: "var(--status-over)" }}>JSON ERROR · {err}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="fm-btn fm-btn--tool !h-8" disabled={!parsed} onClick={() => parsed && onApply(parsed, false)}>Apply without re-signing</button>
          <button type="button" className="fm-btn fm-btn--tool !h-8" disabled={!parsed || d.header?.alg !== "HS256"} onClick={() => parsed && onApply(parsed, true)}>Apply and re-sign</button>
        </div>
        <section aria-label="Signature" className="fm-card grid gap-1 p-2">
          <p className="font-mono text-[12px] break-all">HMAC-SHA256(secret, <span style={{ color: PART[0] }}>{d.parts[0].slice(0, 12)}…</span>.<span style={{ color: PART[1] }}>{d.parts[1].slice(0, 12)}…</span>) {s.sig === "valid" ? "=" : "≟"} <span style={{ color: PART[2] }}>{d.parts[2].slice(0, 16) || "(empty)"}…</span></p>
          {sigText && <p className="fm-cap font-semibold" style={{ color: sigColor }}>{sigText}</p>}
        </section>
      </div>
    </div>
  );
}

function AlgNone() {
  return (
    <details className="fm-card p-3">
      <summary className="fm-cap cursor-pointer !text-ink">Why &quot;alg&quot;: &quot;none&quot; is dangerous (explanation only)</summary>
      <div className="mt-2 grid gap-2">
        <p>RFC 7518 §3.6 defines <code>none</code> for unsecured JWTs: no signature, empty third part. In 2015 several libraries were found to take the algorithm from the token&apos;s own header, so a forged header with <code>alg: none</code> and an empty signature passed verification, and an attacker could write any claims they liked.</p>
        <p>A cousin of the same bug: a server holding an RSA public key accepts <code>alg: HS256</code>, and verifies an HMAC using the public key as the secret. The public key is public, so anyone can sign.</p>
        <p><strong>The fix (RFC 8725 §3.1):</strong> the server decides which algorithms it accepts, per key, and rejects everything else before verifying. This page&apos;s API allows only HS256, so the &quot;Header says alg: none&quot; sample below fails the allowlist check and is never verified.</p>
      </div>
    </details>
  );
}

function Gatekeeper({ s, act, onLoad }: { s: JwtState; act: Act; onLoad(id: SampleId): void }) {
  const all = SAMPLES.every((x) => s.judged[x.id]);
  return (
    <fieldset className="grid gap-2">
      <legend className="fm-cap mb-1">Gatekeeper · incoming tokens for {POLICY.aud}{all ? ` · ${SAMPLES.filter((x) => s.judged[x.id] === x.expected).length}/${SAMPLES.length} right` : ""}</legend>
      <ul className="grid gap-1.5">
        {SAMPLES.map((x) => {
          const j = s.judged[x.id];
          const on = s.sampleId === x.id && s.source === "sample";
          return (
            <li key={x.id} className="flex flex-wrap items-center gap-2 border border-line px-2 py-1" style={{ borderRadius: 2, borderColor: on ? "var(--cobalt)" : undefined }}>
              <button type="button" aria-pressed={on} className={`fm-btn fm-btn--tool !h-8 ${on ? "is-on" : ""}`} onClick={() => onLoad(x.id)}>Load</button>
              <span className="min-w-0 flex-1">{x.label}</span>
              {(["accept", "reject"] as const).map((v) => (
                <button key={v} type="button" aria-pressed={j === v} className={`fm-btn fm-btn--tool !h-8 ${j === v ? "is-on" : ""}`} onClick={() => act("judge", { id: x.id, verdict: v })}>{v === "accept" ? "Accept" : "Reject"}</button>
              ))}
              {all && j && <span className="fm-cap font-semibold" style={{ color: j === x.expected ? "var(--status-ok)" : "var(--status-over)" }}>{j === x.expected ? "RIGHT" : `WRONG · ${x.expected}`}</span>}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

const TX0 = 150, TX1 = 690, LH = 52;
function Timeline({ s, act }: { s: JwtState; act: Act }) {
  const r = s.rev;
  const x = (sec: number) => TX0 + ((TX1 - TX0) * Math.min(sec, TIMELINE_SEC)) / TIMELINE_SEC;
  return (
    <figure className="grid gap-2">
      <figcaption className="fm-cap">Revocation · the access token is copied at logout and replayed every 30 s · 0–60 min</figcaption>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="fm-btn fm-btn--tool !h-8" disabled={r.loggedOut} onClick={() => act("logoutNow")}>Log out now</button>
        <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => act("restart")}>Restart timeline</button>
        <span className="fm-cap">t = {fmt(r.sec)} · logout at {fmt(r.logoutAt)}{r.loggedOut ? " · LOGGED OUT" : ""} · Play runs it</span>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 700 ${24 + LANES.length * LH + 20}`} className="h-auto w-full max-sm:min-w-[600px]" role="img" aria-label={`Timeline at ${fmt(r.sec)}: stolen token worked ${LANES.map((l) => `${fmt(exposure(r, l.id))} with ${l.label}`).join(", ")}`}>
          {LANES.map((ln, k) => {
            const l = r.lanes[ln.id];
            const y = 20 + k * LH;
            return (
              <g key={ln.id}>
                <text x={4} y={y + 12} className="sim-sub" fill="var(--ink)">{ln.id === "long" ? "LONG JWT" : ln.id === "refresh" ? "SHORT + REFRESH" : "DENYLIST"}</text>
                <text x={4} y={y + 28} className="sim-sub" fill={exposure(r, ln.id) > 0 ? "var(--status-over)" : "var(--status-ok)"}>{r.loggedOut ? `OPEN ${fmt(exposure(r, ln.id))}` : `TTL ${l.ttl / 60} min`}</text>
                <text x={4} y={y + 42} className="sim-sub" fill="var(--ink-muted)">{callsPerHour(r, ln.id)} calls/h</text>
                <rect x={TX0} y={y} width={TX1 - TX0} height={18} fill="var(--surface-sunk)" stroke="var(--line)" />
                {l.tokens.map((t, i) => (
                  <rect key={t.jti} x={x(t.iat)} y={y + 2} width={Math.max(1, x(t.exp) - x(t.iat) - 1)} height={14} fill={t === l.stolen ? "var(--status-over-fill)" : i % 2 ? "var(--phase-5)" : "var(--surface)"} stroke={t === l.stolen ? "var(--status-over)" : "var(--ink)"} strokeWidth={0.8} />
                ))}
                {l.attempts.map((a) => <circle key={a.t} cx={x(a.t)} cy={y + 30} r={3} fill={a.ok ? "var(--status-over)" : "none"} stroke={a.ok ? "var(--status-over)" : "var(--status-ok)"} />)}
                {r.loggedOut && l.stolen && ln.id !== "denylist" && <text x={Math.min(x(l.stolen.exp) + 4, TX1 - 90)} y={y + 44} className="sim-sub" fill="var(--ink)">stolen token exp {fmt(l.stolen.exp)}</text>}
              </g>
            );
          })}
          <line x1={x(r.logoutAt)} x2={x(r.logoutAt)} y1={10} y2={20 + LANES.length * LH} stroke="var(--cobalt)" strokeWidth={1.5} strokeDasharray="4 3" />
          <text x={x(r.logoutAt) + 3} y={12} className="sim-sub" fill="var(--cobalt)">LOGOUT</text>
          <line x1={x(r.sec)} x2={x(r.sec)} y1={14} y2={20 + LANES.length * LH} stroke="var(--ink)" />
          {[0, 15, 30, 45, 60].map((m) => <text key={m} x={x(m * 60)} y={20 + LANES.length * LH + 14} textAnchor="middle" className="sim-sub" fill="var(--ink-muted)">{m}m</text>)}
        </svg>
      </div>
      <p className="fm-cap">● accepted replay (attacker in) · ○ rejected · red bar = the token copied at logout</p>
      <ul className="grid gap-1 text-[13px]">
        {LANES.map((ln) => <li key={ln.id}><strong className="font-medium">{ln.label}.</strong> {ln.how} Worst case open after logout: {ln.id === "denylist" ? "0 (one store lookup per request)" : `${worstExposure(r, ln.id) / 60} min`}.</li>)}
      </ul>
    </figure>
  );
}
