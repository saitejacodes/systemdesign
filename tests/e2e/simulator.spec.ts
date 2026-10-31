import { expect, test } from "@playwright/test";

test("single-server queue: tour, play, break it, pass the challenge", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/simulators/single-server-queue");

  // First visit opens the guided tour.
  const tour = page.getByRole("dialog", { name: "One server, one line" });
  await expect(tour).toBeVisible();
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("dialog", { name: "Change the rates" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(page.locator("[data-tour=log]")).toBeVisible();
  await expect.poll(async () => Number((await page.locator("dd").filter({ hasText: "/s" }).first().innerText()).replace(/\D/g, "")), { timeout: 10_000 }).toBeGreaterThan(0);

  await page.getByRole("button", { name: /Break it/ }).click();
  await page.getByRole("menuitemcheckbox", { name: /Slow server/ }).click();
  await expect(page.getByRole("button", { name: "Remove fault: Slow server (μ/3)" })).toBeVisible();
  await expect(page.getByText(/Fault injected/)).toBeVisible();
  await page.getByRole("button", { name: "Remove fault: Slow server (μ/3)" }).click();

  await page.getByRole("button", { name: "What this models" }).click();
  await expect(page.getByRole("dialog").getByText("What it simplifies")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByLabel("Service rate μ").fill("150");
  await page.getByLabel("Speed").selectOption("4");
  await page.locator("[data-tour=challenges]").getByRole("button", { name: /^Start/ }).click();
  await expect(page.getByLabel("Arrival rate λ")).toBeDisabled();
  await expect(page.locator("[data-tour=challenges]").getByText(/Worst p99 was/)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-tour=challenges]").getByText(/Passed · best/)).toBeVisible();

  await page.goto("/simulators");
  await expect(page.getByText("1/1 challenges")).toBeVisible();
  expect(errors).toEqual([]);
});
