import { HttpError } from "./http";
import type { ChatMessage } from "./openai";

/**
 * Guardrails: cheap, deterministic checks around the model. They are a seatbelt, not a guarantee: pattern lists
 * catch known shapes and miss paraphrases. Production systems layer them with a classifier model and evals.
 */

// Input: phrases typical of direct prompt-injection attempts against the system prompt.
const INJECTION_PATTERNS = [
  /ignore (all |any )?(previous|prior|above) (instructions|rules)/i,
  /disregard (the |your )?(system prompt|instructions)/i,
  /(reveal|print|repeat|show) (your|the) (system prompt|hidden instructions)/i,
  /you are now (in )?(developer|dan|jailbreak) mode/i,
];

export type InputVerdict = { action: "allow" } | { action: "flag" | "block"; reason: string };

export function checkInput(messages: ChatMessage[], mode: "off" | "flag" | "block"): InputVerdict {
  if (mode === "off") return { action: "allow" };
  for (const m of messages) {
    if (m.role !== "user") continue;
    const hit = INJECTION_PATTERNS.find((re) => re.test(m.content));
    if (hit) {
      const reason = `possible prompt injection (${hit.source.slice(0, 40)})`;
      if (mode === "block") throw new HttpError(400, `request blocked by input guardrail: ${reason}`, "content_policy_violation");
      return { action: "flag", reason };
    }
  }
  return { action: "allow" };
}

// PII: mask before text reaches logs or the semantic cache. Emails and card-like digit runs that pass Luhn.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CARDLIKE = /\b(?:\d[ -]?){13,19}\b/g;

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function containsPii(text: string): boolean {
  if (new RegExp(EMAIL.source).test(text)) return true;
  return (text.match(CARDLIKE) ?? []).some((m) => luhn(m.replace(/\D/g, "")));
}

export function redactPii(text: string): string {
  return text.replace(EMAIL, "[email]").replace(CARDLIKE, (m) => (luhn(m.replace(/\D/g, "")) ? "[card]" : m));
}

// Output: never let a credential-shaped string leave the gateway (the lab's own API key format, plus the
// shape of common provider keys).
const SECRET_PATTERNS = [/sk-lab-[a-z]+-\d{4}/, /\bsk-[A-Za-z0-9_-]{20,}\b/, /AKIA[0-9A-Z]{16}/];

/**
 * Streaming makes output checks hard: by the time a pattern is complete, its first characters were already sent.
 * So the gateway holds back the last HOLDBACK characters of the stream and releases them only once more text
 * has arrived. A secret shorter than the holdback is caught before any of it is sent. The cost is that the client
 * sees text that many characters later than the model produced it.
 */
export const HOLDBACK = 48;

export function outputViolation(text: string): string | null {
  const hit = SECRET_PATTERNS.find((re) => re.test(text));
  return hit ? "credential-like string in output" : null;
}
