import fs from "node:fs";
import path from "node:path";

/**
 * Golden-set eval: send every case in evals/golden.jsonl through the gateway at temperature 0, check the answers,
 * and exit non-zero if the pass rate falls below EVAL_MIN_PASS_RATE or any case marked critical fails.
 * Run it before every model, quantization, prompt or guardrail change (and in CI: .github/workflows/eval.yml).
 *
 *   EVAL_BASE_URL=http://localhost:8080 EVAL_API_KEY=sk-lab-acme-0001 npm run eval
 *
 * Checks are deterministic string rules, so they are cheap and repeatable but narrow. An LLM-as-judge can grade
 * open-ended answers, at a price: the judge has its own biases (position, length, preferring its own style),
 * costs a model call per case, and must itself be validated against human labels before you trust it as a gate.
 */
type Check =
  | { type: "contains" | "not_contains"; value: string }
  | { type: "contains_any"; value: string[] }
  | { type: "regex"; value: string }
  | { type: "max_chars"; value: number }
  | { type: "json_keys"; value: string[] };

interface Case {
  id: string;
  prompt: string;
  system?: string;
  checks: Check[];
  expectStatus?: number;
  critical?: boolean;
}

const baseUrl = process.env.EVAL_BASE_URL ?? "http://localhost:8080";
const apiKey = process.env.EVAL_API_KEY ?? "sk-lab-acme-0001";
const minPassRate = Number(process.env.EVAL_MIN_PASS_RATE ?? 0.8);
const file = process.env.EVAL_FILE ?? path.join(process.cwd(), "evals", "golden.jsonl");

function runCheck(c: Check, text: string): string | null {
  const lower = text.toLowerCase();
  switch (c.type) {
    case "contains":
      return lower.includes(c.value.toLowerCase()) ? null : `expected to contain "${c.value}"`;
    case "not_contains":
      return lower.includes(c.value.toLowerCase()) ? `must not contain "${c.value}"` : null;
    case "contains_any":
      return c.value.some((v) => lower.includes(v.toLowerCase())) ? null : `expected one of ${c.value.join(", ")}`;
    case "regex":
      return new RegExp(c.value, "i").test(text) ? null : `expected to match /${c.value}/`;
    case "max_chars":
      return text.length <= c.value ? null : `${text.length} characters, limit ${c.value}`;
    case "json_keys": {
      const m = /\{[\s\S]*\}/.exec(text);
      try {
        const obj = JSON.parse(m ? m[0] : text) as Record<string, unknown>;
        const missing = c.value.filter((k) => !(k in obj));
        return missing.length ? `JSON missing keys ${missing.join(", ")}` : null;
      } catch {
        return "not valid JSON";
      }
    }
  }
}

async function runCase(c: Case): Promise<{ id: string; pass: boolean; critical: boolean; detail: string }> {
  const messages = [...(c.system ? [{ role: "system", content: c.system }] : []), { role: "user", content: c.prompt }];
  const r = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, "x-allow-fallback": "false" },
    body: JSON.stringify({ messages, temperature: 0, max_tokens: 128, seed: 1 }),
  });
  const body = (await r.json()) as { choices?: { message?: { content?: string } }[]; error?: { message: string } };
  const critical = c.critical === true;
  if (c.expectStatus !== undefined) {
    const pass = r.status === c.expectStatus;
    return { id: c.id, pass, critical, detail: pass ? `status ${r.status}` : `expected status ${c.expectStatus}, got ${r.status}` };
  }
  if (!r.ok) return { id: c.id, pass: false, critical, detail: `HTTP ${r.status}: ${body.error?.message ?? ""}` };
  const text = body.choices?.[0]?.message?.content ?? "";
  const failures = c.checks.map((ch) => runCheck(ch, text)).filter((f): f is string => f !== null);
  return {
    id: c.id,
    pass: failures.length === 0,
    critical,
    detail: failures.length ? `${failures.join("; ")} | answer: ${JSON.stringify(text.slice(0, 120))}` : "ok",
  };
}

async function main(): Promise<void> {
  const cases = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Case);
  const results = [];
  for (const c of cases) results.push(await runCase(c)); // sequential: an eval should not load-test the system
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}${r.critical ? " [critical]" : ""}  ${r.id.padEnd(20)} ${r.detail}`);
  const passed = results.filter((r) => r.pass).length;
  const rate = passed / results.length;
  const criticalFailed = results.filter((r) => r.critical && !r.pass);
  console.log(
    `\n${passed}/${results.length} passed (${(rate * 100).toFixed(0)}%), gate ${(minPassRate * 100).toFixed(0)}%, critical failures ${criticalFailed.length}`,
  );
  if (rate < minPassRate || criticalFailed.length > 0) {
    console.log("EVAL GATE: FAIL");
    process.exit(1);
  }
  console.log("EVAL GATE: PASS");
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(2);
});
