import { expect, test, type Page } from "@playwright/test";

// Interview Mode end to end on the fixture case (tests/fixtures/case-studies, loaded because playwright.config.ts sets
// SDL_FIXTURE_CASES=1 for the web server).
const CASE = "/interview/fixture-kv-store";

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test("practice interview: clarify, hint, deep dive, submit, self-review, save, dashboard trend", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "desktop flow; mobile is covered by the smoke test");
  const errors = watchErrors(page);
  page.on("dialog", (d) => d.accept());
  await page.goto(CASE);

  // Start screen
  await expect(page.getByText("Design a key-value service that stores login sessions")).toBeVisible();
  await page.getByLabel("Practice").check();
  await page.getByText("30 min", { exact: true }).click();
  await page.getByRole("button", { name: "Start" }).click();

  const clock = page.getByTestId("interview-clock");
  await expect(clock).toHaveText(/^(30:00|29:5\d)$/);
  await expect(page.locator(".react-flow").first()).toBeVisible(); // the fixture has no Studio template, so the canvas starts blank

  // Requirements: reveal an interviewer answer, add a requirement, use a hint
  await page.getByRole("button", { name: "What is the read:write ratio?" }).click();
  await expect(page.getByTestId("clarifying-answer")).toContainText("About 10 reads for every write");
  await page.getByPlaceholder("Users can …").fill("Read a session by token on every API request");
  await page.getByRole("button", { name: "Add to Functional requirements" }).click();
  await page.getByRole("button", { name: /Show hint 1 of 2/ }).click();
  await expect(page.getByTestId("hint")).toHaveCount(1);

  // Practice can pause; the clock stops
  await page.getByRole("button", { name: "Pause" }).click();
  const paused = await clock.textContent();
  await page.waitForTimeout(1500);
  await expect(clock).toHaveText(paused!);
  await page.getByRole("button", { name: "Resume" }).click();

  // Deep dives: practice can ask for the next question early
  await page.getByRole("tab", { name: /Deep Dives/ }).click();
  await page.getByRole("button", { name: "Ask the next question now" }).click();
  await expect(page.getByTestId("deep-dive").first()).toBeVisible();

  // A reload resumes the same attempt
  await page.reload();
  await expect(page.getByTestId("interview-clock")).toBeVisible();
  await page.getByRole("tab", { name: /Requirements/ }).click();
  await expect(page.getByText("Read a session by token on every API request")).toBeVisible();

  // Submit → self-review
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("heading", { name: "Self-review" })).toBeVisible();
  await expect(page.getByTestId("run-compare")).toContainText("Run challenge");
  const save = page.getByRole("button", { name: /Save attempt/ });
  await expect(save).toBeDisabled();
  const groups = page.getByTestId("rubric").getByRole("radiogroup");
  const n = await groups.count();
  expect(n).toBeGreaterThanOrEqual(10);
  for (let i = 0; i < n; i++) await groups.nth(i).getByText("2 points").click();
  await expect(save).toHaveText(/100%/);
  await save.click();
  await expect(page.getByRole("heading", { name: "Saved · 100%" })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByRole("list", { name: "Score trend per case" })).toContainText("100%");
  expect(errors).toEqual([]);
});

test("mock interview has no pause and hints cost a point", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "desktop flow");
  await page.goto(CASE);
  await page.getByRole("button", { name: "Start" }).click(); // Mock and 45 min are the defaults
  await expect(page.getByTestId("interview-clock")).toHaveText(/^(45:00|44:5\d)$/);
  await expect(page.getByRole("button", { name: "Pause" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Show hint 1 of 2 · costs 1 point/ })).toBeVisible();
});
