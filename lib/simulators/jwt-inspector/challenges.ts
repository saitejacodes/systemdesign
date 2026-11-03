import type { Challenge } from "@/lib/sim/engine";
import { SAMPLES, callsPerHour, exposure, fmt, revDone, worstExposure, type JwtConfig, type JwtState } from "./model";

const MAX_EXPOSURE = 300;
const MAX_CALLS = 20;

export const challenges: Challenge<JwtConfig, JwtState>[] = [
  {
    id: "tamper",
    title: "Catch a tampered token",
    description: "Sign a token with the demo secret and watch it verify. Then change a payload claim (try role → admin) and apply it without re-signing: the signature must fail.",
    durationMs: 3_600_000,
    better: "higher",
    done: (s) => s.signedOk && !!s.tamper,
    winCondition(_h, s) {
      if (!s.signedOk) return { passed: false, value: 0, detail: "No token you signed has verified yet. Press Sign with demo secret." };
      if (!s.tamper) return { passed: false, value: 1, detail: "Signed and verified. Now edit the payload and apply it without re-signing." };
      return { passed: true, value: 2, detail: `Changed ${s.tamper.changed.join(", ") || "the payload"}, kept the old signature: HMAC over the new bytes doesn't match. Anyone can read a JWT; only the key holder can change one.` };
    },
    hint: "The signature covers the exact base64url bytes of header and payload. Change one character and it no longer matches.",
  },
  {
    id: "gatekeeper",
    title: "Be the gatekeeper",
    description: `Six tokens arrive at orders-api. Load each one, read its checks, and accept or reject it. All ${SAMPLES.length} must be right.`,
    durationMs: 3_600_000,
    better: "higher",
    done: (s) => SAMPLES.every((x) => s.judged[x.id]),
    winCondition(_h, s) {
      const right = SAMPLES.filter((x) => s.judged[x.id] === x.expected);
      const wrong = SAMPLES.filter((x) => s.judged[x.id] && s.judged[x.id] !== x.expected);
      if (right.length === SAMPLES.length) return { passed: true, value: right.length, detail: "All six right. Signature, algorithm allowlist, exp, nbf, iss and aud: a token is only as safe as the checks the server runs." };
      return { passed: false, value: right.length, detail: wrong.length ? `${right.length} of ${SAMPLES.length} right. Wrong: ${wrong.map((x) => `${x.label} (should ${x.expected})`).join("; ")}.` : `${right.length} of ${SAMPLES.length} judged.` };
    },
    hint: "Accept only when every check passes. A missing signature is not a valid signature.",
  },
  {
    id: "logout-sticks",
    title: "Make logout stick",
    description: `Tune the short-TTL lane so a token stolen at logout is useless within ${MAX_EXPOSURE / 60} minutes at worst, while the auth server handles at most ${MAX_CALLS} refreshes per user-hour. Run the timeline to the end.`,
    durationMs: 3_600_000,
    done: (s) => revDone(s.rev),
    winCondition(_h, s) {
      const r = s.rev;
      const seen = exposure(r, "refresh"), worst = worstExposure(r, "refresh"), calls = callsPerHour(r, "refresh");
      if (!revDone(r)) return { passed: false, value: worst / 60, detail: "Let the 60-minute timeline finish." };
      if (worst > MAX_EXPOSURE) return { passed: false, value: worst / 60, detail: `A ${worst / 60}-minute access token can be replayed for up to ${worst / 60} minutes after logout (this run: ${fmt(seen)}). Shorten it.` };
      if (calls > MAX_CALLS) return { passed: false, value: worst / 60, detail: `${calls} refreshes per user-hour: safe, but the auth server pays for it. Lengthen the TTL a little.` };
      return { passed: true, value: worst / 60, detail: `Worst case ${worst / 60} min, ${calls} refreshes per hour. The denylist closes the window to zero but costs ${callsPerHour(r, "denylist")} store lookups per user-hour, one per request.` };
    },
    hint: "Worst-case exposure is the access-token TTL. Refreshes per hour is 60 ÷ TTL in minutes. Find a TTL that satisfies both.",
  },
];
