import { expect, test } from "@playwright/test";

// Prompt 24 production checks that no other spec covers: PGlite under the CSP, and the AI Settings error paths.
// (Python and JS labs: labs.spec.ts; a simulator challenge: simulator.spec.ts; offline reload: offline.spec.ts.)

test("SQL sandbox: PGlite boots under the CSP and a query returns rows", async ({ page }) => {
  test.setTimeout(120_000); // PGlite's first boot downloads and compiles about 10 MB of WASM
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/simulators/sql-sandbox");
  await page.getByRole("switch", { name: "Plain editor" }).click({ timeout: 60_000 });
  await page.getByLabel("SQL").fill("SELECT 6 * 7 AS answer, version() LIKE 'PostgreSQL%' AS pg;");
  await page.getByRole("button", { name: "Run all" }).click();
  await expect(page.getByText("1 row ·")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("td").first()).toHaveText("42");
  expect(errors).toEqual([]);
});

test("AI settings: a bad key and a blocked custom host give readable errors", async ({ page }) => {
  await page.route("https://api.anthropic.com/**", (r) => r.fulfill({ status: 401, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }) }));
  await page.goto("/settings");
  const ai = page.getByRole("region", { name: "AI" });
  await ai.getByLabel("API key").fill("sk-ant-wrong");
  await ai.getByRole("button", { name: "Test connection" }).click();
  await expect(ai.getByRole("alert")).toContainText("rejected the API key");

  await ai.getByLabel("Provider").selectOption("openai-compatible");
  await ai.getByLabel("Base URL").fill("https://llm.example.com/v1");
  await expect(ai.getByRole("alert").filter({ hasText: "security policy" })).toContainText("llm.example.com");
  await ai.getByLabel("Base URL").fill("http://127.0.0.1:8787/v1");
  await expect(ai.getByRole("alert").filter({ hasText: "security policy" })).toHaveCount(0);
});
