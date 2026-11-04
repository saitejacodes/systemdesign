import { expect, test, type Page } from "@playwright/test";

// AI features (Prompt 21). No real provider is ever called: without a key every entry point shows the "add a key"
// message, and the streaming test answers Anthropic's endpoint from a route handler.

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

const openTutor = async (page: Page) => {
  await page.getByRole("button", { name: "Toggle right panel" }).click();
  await page.getByRole("tab", { name: "AI Tutor" }).click();
};

test("without a key every AI entry point says to add one, and nothing calls a provider", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "desktop flow");
  const errors = watchErrors(page);
  const calls: string[] = [];
  page.on("request", (r) => { if (/anthropic\.com|openai\.com/.test(r.url())) calls.push(r.url()); });

  await page.goto("/settings");
  const ai = page.getByRole("region", { name: "AI" });
  await expect(ai.getByText("Your key is stored in this browser (IndexedDB), not encrypted.")).toBeVisible();
  await expect(ai.getByRole("button", { name: "Test connection" })).toBeDisabled();
  await expect(ai.getByTestId("ai-usage")).toContainText("This month · 0 requests");
  await ai.getByLabel("Provider").selectOption("openai-compatible");
  await expect(ai.getByLabel("Base URL")).toBeVisible();
  await expect(ai.getByText("scripts/ai-proxy")).toBeVisible();

  await page.goto("/phase/1/dns");
  await openTutor(page);
  await expect(page.getByTestId("ai-no-key")).toContainText("Add an API key in Settings");

  await page.goto("/interview/fixture-kv-store");
  await expect(page.getByTestId("ai-no-key").filter({ hasText: "The AI interviewer" })).toContainText("Add an API key in Settings");

  await page.goto("/studio");
  await page.getByRole("button", { name: "New design", exact: true }).click();
  await page.getByRole("button", { name: "Explain" }).click();
  await expect(page.getByRole("dialog").getByTestId("ai-no-key")).toBeVisible();
  expect(calls).toEqual([]);
  expect(errors).toEqual([]);
});

/** An Anthropic Messages streaming response (server-sent events) that says `text`. */
function anthropicSse(text: string) {
  const ev = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  return [
    ev("message_start", { message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 1 } } }),
    ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
    ...text.match(/.{1,12}/g)!.map((t) => ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: t } })),
    ev("content_block_stop", { index: 0 }),
    ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 40 } }),
    ev("message_stop", {}),
  ].join("");
}

test("tutor streams a labelled answer with its cost, keeps the chat per page and counts usage", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "desktop flow");
  const errors = watchErrors(page);
  const bodies: { system: string; headers: Record<string, string> }[] = [];
  await page.route("https://api.anthropic.com/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } });
    bodies.push({ system: JSON.parse(req.postData() ?? "{}").system, headers: await req.allHeaders() });
    await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "access-control-allow-origin": "*" }, body: anthropicSse("A **resolver** walks from the root to the authoritative server.") });
  });

  await page.goto("/settings");
  await page.getByRole("region", { name: "AI" }).getByLabel("API key").fill("sk-ant-test-key");
  await page.goto("/phase/1/dns");
  await openTutor(page);
  await page.getByRole("button", { name: "Explain simpler" }).click();

  const tutor = page.getByTestId("tutor");
  await expect(tutor.getByTestId("ai-output").last()).toContainText("A resolver walks from the root");
  await expect(tutor.getByText("AI-generated: may contain mistakes").first()).toBeVisible();
  await expect(tutor.getByTestId("ai-cost")).toContainText("claude-opus-5-5 · 1,200 in · 40 out · ≈ $0.0056");
  expect(bodies).toHaveLength(1);
  expect(bodies[0].system).toContain('<page url="/phase/1/dns">');
  expect(bodies[0].headers.authorization).toBe("Bearer sk-ant-test-key"); // the SDK (1.x) sends the key as a bearer token
  expect(bodies[0].headers["anthropic-dangerous-direct-browser-access"]).toBe("true");

  await page.reload(); // the panel and its tab are remembered across reloads
  await expect(page.getByTestId("tutor").getByText("A resolver walks from the root")).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByTestId("ai-usage")).toContainText("This month · 1 requests · 1,200 in · 40 out");
  expect(errors).toEqual([]);
});

test("AI interviewer answers in character, asks a follow-up on the design, and grades beside the self-scores", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "desktop flow");
  const errors = watchErrors(page);
  page.on("dialog", (d) => d.accept());
  const ids = ["req-scope", "req-nfr", "est-qps", "est-storage", "api-endpoints", "dm-key", "dm-db", "hld-path", "hld-redundancy", "dd-cache", "dd-logout", "wrap-tradeoffs"];
  const grading = "```json\n" + JSON.stringify({ scores: ids.map((id) => ({ id, score: 1, justification: `Partly covered (${id}).` })), improvements: ["Add a replica for the session store.", "State the TTL policy.", "Size the cache."] }) + "\n```";
  await page.route("https://api.anthropic.com/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } });
    const body = JSON.parse(req.postData() ?? "{}");
    const user = String(body.messages.at(-1).content);
    const text = body.system.startsWith("You are a senior engineer grading") ? grading
      : user.includes("Ask ONE follow-up") ? "Your store has one node: what happens to logged-in users when it restarts?"
      : "Assume a single region for this interview.";
    await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "access-control-allow-origin": "*" }, body: anthropicSse(text) });
  });

  await page.goto("/settings");
  await page.getByRole("region", { name: "AI" }).getByLabel("API key").fill("sk-ant-test-key");
  await page.goto("/interview/fixture-kv-store");
  await page.getByLabel("Practice").check();
  await page.getByText("AI interviewer: ask it anything").click();
  await page.getByRole("button", { name: "Start" }).click();

  const asker = page.getByTestId("ai-interviewer");
  await asker.getByLabel("Your question for the interviewer").fill("How many regions?");
  await asker.getByRole("button", { name: "Ask" }).click();
  await expect(asker.getByText("Assume a single region for this interview.")).toBeVisible();
  await expect(asker.getByText(/AI-generated: may contain mistakes/)).toBeVisible();

  await page.getByRole("tab", { name: /Deep Dives/ }).click();
  await page.getByRole("button", { name: "Ask a follow-up about my design" }).click();
  await expect(page.getByTestId("ai-followups")).toContainText("what happens to logged-in users when it restarts?");
  await page.getByLabel("Your answer to follow-up 1").fill("Run a replica and fail over.");

  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByRole("button", { name: "Get AI feedback" }).click();
  await expect(page.getByTestId("ai-grader")).toContainText("Add a replica for the session store.");
  await expect(page.getByTestId("ai-score")).toHaveCount(ids.length);
  // The AI's score sits next to the learner's and never sets it
  const groups = page.getByTestId("rubric").getByRole("radiogroup");
  await groups.first().getByText("2 points").click();
  await expect(page.getByTestId("ai-score").first()).toContainText("AI · 1 point · you said 2");
  await expect(page.getByRole("button", { name: /Save attempt/ })).toBeDisabled();
  expect(errors).toEqual([]);
});
