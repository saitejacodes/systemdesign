import { expect, test, type Page } from "@playwright/test";

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

const node = (page: Page, text: string) => page.locator(".react-flow__node").filter({ hasText: text }).first();
const runPanel = (page: Page) => page.getByRole("complementary", { name: "Run panel" });

async function openThreeTierInRun(page: Page) {
  await page.goto("/studio/new?template=three-tier-web-app");
  await expect(page).toHaveURL(/\/studio\/d-/);
  await expect(node(page, "API 1")).toBeVisible();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByTestId("run-strip")).toBeVisible();
}

test("run the three-tier template: metrics, kill + reroute, traffic ×10, generic challenge", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "desktop flow; mobile has its own smoke test");
  const errors = watchErrors(page);
  await openThreeTierInRun(page);

  // Editing is frozen: palette gone, undo disabled
  await expect(page.getByRole("complementary", { name: "Component palette" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();

  await page.getByLabel("Speed").selectOption("4");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const metrics = page.getByTestId("run-metrics");
  await expect(metrics).toContainText("p99");
  await expect(node(page, "API 1")).toContainText("QPS");
  await expect(node(page, "API 1").locator("[data-status]")).toHaveAttribute("title", /OK/);

  // Kill a service: it shows ✕ DOWN and the load balancer sends its share to the others, so errors stay at 0
  await node(page, "API 1").click();
  const inspector = page.getByTestId("run-inspector");
  await expect(inspector).toContainText("API 1");
  await inspector.getByRole("button", { name: "Kill", exact: true }).click();
  await expect(node(page, "API 1").locator("[data-status]")).toHaveAttribute("data-status", "down");
  await expect(node(page, "API 1")).toContainText("✕ DOWN");
  await page.waitForTimeout(2500); // ~10 s of sim time at 4×
  await expect(metrics.getByText("0.0%")).toBeVisible();
  await expect(node(page, "API 2").locator("[data-status]")).not.toHaveAttribute("data-status", "down");

  // Traffic ×10 overloads something
  await runPanel(page).getByRole("tab", { name: "Faults" }).click();
  await runPanel(page).getByRole("button", { name: "Traffic ×10" }).click();
  await expect(page.locator('.react-flow__node [data-status="overloaded"]').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("run-log")).toContainText("Killed API 1");
  await expect(page.getByTestId("run-log")).toContainText("OVERLOADED");

  // A generic challenge runs headlessly and shows actual vs target
  await runPanel(page).getByRole("tab", { name: "Challenges" }).click();
  const spof = page.getByTestId("challenge-generic:zero-spof");
  await spof.getByRole("button", { name: "Check" }).click();
  await expect(spof.getByRole("status")).toContainText(/Passed|Not passed/);
  await expect(spof.getByRole("status")).toContainText("Goal");

  // Back to Edit restores the editable canvas
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Component palette" })).toBeVisible();
  await expect(node(page, "API 1")).toContainText("Instances 1");
  expect(errors).toEqual([]);
});

test("analysis lists a single point of failure on client → service → SQL DB", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "desktop flow; mobile has its own smoke test");
  const errors = watchErrors(page);
  await page.goto("/studio/new");
  await expect(page).toHaveURL(/\/studio\/d-/);
  for (const name of ["Service", "SQL DB", "Client"]) await page.getByRole("button", { name: `Add ${name}`, exact: true }).click();
  const props = page.getByRole("tabpanel");
  await props.getByLabel("Connect to").selectOption({ label: "Service · Service" });
  await props.getByRole("button", { name: "Connect", exact: true }).click();
  await node(page, "Service").click();
  await expect(props.getByRole("heading", { name: "Service" })).toBeVisible();
  await props.getByLabel("Instances").fill("1");
  await expect(props.getByRole("region", { name: "Run mode" })).toContainText("Availability");
  await props.getByLabel("Connect to").selectOption({ label: "SQL DB · SQL DB" });
  await props.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByTestId("canvas-summary")).toHaveText("3 components, 2 connections");

  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page.getByRole("button", { name: "Step 0.5 seconds" }).click();
  await runPanel(page).getByRole("tab", { name: "Analysis" }).click();
  const spofs = page.getByTestId("analysis-spofs");
  await expect(spofs).toContainText("Single points of failure · 1");
  await expect(spofs.getByRole("button", { name: /Service/ })).toBeVisible();
  await expect(page.getByTestId("analysis-availability")).toContainText("nines");

  // Lose an AZ is disabled with a reason on a design without an AZ frame
  await runPanel(page).getByRole("tab", { name: "Faults" }).click();
  await expect(runPanel(page).getByRole("button", { name: "Lose an AZ" })).toBeDisabled();
  await expect(runPanel(page)).toContainText("Needs a frame with Scope");
  expect(errors).toEqual([]);
});

test("run mode at 375 px: panel as a sheet, plays, no overflow", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "mobile only");
  const errors = watchErrors(page);
  await openThreeTierInRun(page);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("run-metrics")).toContainText("p99");
  await page.getByRole("button", { name: "Panel", exact: true }).click();
  await expect(runPanel(page).getByRole("tab", { name: "Traffic" })).toBeVisible();
  await expect(runPanel(page).getByLabel("Average QPS")).toBeVisible();
  await runPanel(page).getByRole("tab", { name: "Analysis" }).click();
  await expect(page.getByTestId("analysis-availability")).toBeVisible();
  await runPanel(page).getByRole("button", { name: "Close panel" }).click();
  await expect(runPanel(page)).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
