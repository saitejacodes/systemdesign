import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { jwtModel, type JwtConfig, type JwtState } from "./model";
import { JwtView } from "./view";

const open = (v: number) => (v > 5 ? "over" : v > 0 ? "hot" : "ok");

export const definition: SimDefinition<JwtConfig, JwtState> = {
  model: jwtModel,
  defaultConfig: { longTtlMin: 60, shortTtlMin: 15, logoutAt: 23, demoMinPerSec: 2 },
  controls: [
    { key: "shortTtlMin", label: "Short access-token TTL", type: "number", min: 1, max: 30, step: 1, unit: " min", help: "The refresh lane. Worst-case exposure after logout equals this; refreshes per hour are 60 ÷ TTL." },
    { key: "longTtlMin", label: "Long access-token TTL", type: "number", min: 15, max: 240, step: 15, unit: " min", help: "Used by the long-lived and denylist lanes." },
    { key: "logoutAt", label: "User logs out at", type: "number", min: 1, max: 55, step: 1, unit: " min", help: "The access token is copied at that moment (a shared computer, a log line, XSS)." },
    { key: "demoMinPerSec", label: "Timeline speed", type: "number", min: 0.5, max: 10, step: 0.5, unit: " min/s" },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "Three parts, two readable", body: "A JWT is header.payload.signature, each base64url. Decoding needs no key: never put secrets in a payload." },
    { target: "canvas", title: "Sign and verify", body: "The signature is HMAC-SHA256 over the first two parts, using a secret this tab generated. Edit a claim without re-signing and verification fails." },
    { target: "canvas", title: "The server's checks", body: "Verifying the signature is one of seven checks: the algorithm allowlist, exp, nbf, issuer and audience matter as much. alg: none is rejected before any crypto runs." },
    { target: "canvas", title: "Logout vs a stateless token", body: "Press Play. The token copied at logout keeps working until exp unless the server keeps some state: a short TTL with revocable refresh, or a denylist." },
    { target: "challenges", title: "Prove it", body: "Catch a tampered token, judge six incoming tokens, and tune the TTL so logout sticks without flooding the auth server." },
  ],
  View: JwtView,
  cards: [
    { key: "expLong", label: "Open after logout · long JWT", unit: "min", digits: 1, tone: open },
    { key: "expRefresh", label: "Open after logout · short + refresh", unit: "min", digits: 1, tone: open },
    { key: "expDeny", label: "Open after logout · denylist", unit: "min", digits: 1, tone: open },
    { key: "refreshPerHour", label: "Refreshes per user-hour", digits: 0 },
    { key: "lookupsPerHour", label: "Denylist lookups per user-hour", digits: 0 },
    { key: "judged", label: "Gatekeeper tokens judged", digits: 0 },
  ],
  charts: [
    { title: "Stolen token still accepted after logout", unit: "min", keys: [{ key: "expLong", label: "Long JWT", color: "var(--status-over)" }, { key: "expRefresh", label: "Short + refresh", color: "var(--phase-4)" }, { key: "expDeny", label: "Denylist", color: "var(--status-ok)" }] },
  ],
  hud: (m) => [
    { k: "T", v: `${(m.minute ?? 0).toFixed(1)} min` },
    { k: "SIG", v: m.sigValid ? "VALID" : "NOT VALID", tone: m.sigValid ? undefined : "hot" },
    { k: "JUDGED", v: `${m.judged ?? 0}/6` },
  ],
};
