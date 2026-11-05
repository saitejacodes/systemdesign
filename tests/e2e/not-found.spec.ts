import { expect, test } from "@playwright/test";

// Every dynamic route returns a real 404 (not a 200 with an error message) for an unknown param.
const UNKNOWN = [
  "/no-such-page",
  "/phase/9",
  "/phase/1/no-such-section",
  "/simulators/no-such-sim",
  "/simulators/code-labs/no-such-lab",
  "/case-studies/no-such-case",
  "/interview/no-such-case",
  "/reference/no-such-sheet",
  "/capstone/99",
];

for (const url of UNKNOWN) {
  test(`${url} is a 404 with the not-found page`, async ({ page }) => {
    const res = await page.goto(url);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: /This page is missing/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Back to the start/ })).toBeVisible();
  });
}

test("an unknown design id says the design is not on this device", async ({ page }) => {
  // Designs live in IndexedDB, so the server can't know; the client shows its own not-found state.
  await page.goto("/studio/no-such-design");
  await expect(page.getByRole("heading", { name: "Design not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: /All designs/ })).toBeVisible();
});
