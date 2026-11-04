import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

const summary = (page: Page) => page.getByTestId("canvas-summary");
const node = (page: Page, text: string) => page.locator(".react-flow__node").filter({ hasText: text }).first();

test("build a design, validate, undo/redo, persist, export and re-import", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "the full editing flow runs on desktop; mobile has its own smoke test");
  const errors = watchErrors(page);
  await page.goto("/studio");
  await expect(page.getByTestId("studio-empty")).toBeVisible();
  await page.getByRole("button", { name: "New design", exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/d-/);
  await expect(page.getByRole("heading", { level: 1, name: "Untitled design" })).toBeVisible();

  // Three components from the palette (click = keyboard path: adds at the centre of the view)
  for (const name of ["Client", "Load Balancer", "Service"]) await page.getByRole("button", { name: `Add ${name}`, exact: true }).click();
  await expect(summary(page)).toHaveText("3 components, 0 connections");
  await expect(page.locator(".react-flow__node")).toHaveCount(3);

  // Service is selected (last added): connect it to the load balancer from the Properties panel
  const props = page.getByRole("tabpanel");
  await expect(props.getByRole("heading", { name: "Service" })).toBeVisible();
  await props.getByLabel("Connect to").selectOption({ label: "Load Balancer · Load Balancer" });
  await props.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(summary(page)).toHaveText("3 components, 1 connection");
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  // An invalid value shows an error and is not applied; a valid one is
  const instances = props.getByLabel("Instances");
  await instances.fill("0");
  await expect(props.getByText("■ Instances must be at least 1 · not applied")).toBeVisible();
  await expect(instances).toHaveAttribute("aria-invalid", "true");
  await expect(node(page, "Service")).toContainText("Instances 3");
  await instances.fill("4");
  await expect(instances).toHaveAttribute("aria-invalid", "false");
  await expect(node(page, "Service")).toContainText("Instances 4");

  // Undo / redo (toolbar, then keyboard with nothing focused)
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(node(page, "Service")).toContainText("Instances 3");
  await expect(instances).toHaveValue("3");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(node(page, "Service")).toContainText("Instances 4");
  await page.locator(".react-flow__pane").click({ position: { x: 20, y: 300 } });
  await page.keyboard.press("ControlOrMeta+z");
  await expect(node(page, "Service")).toContainText("Instances 3");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(node(page, "Service")).toContainText("Instances 4");

  // Copy/paste and delete by keyboard
  await node(page, "Client").click();
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(summary(page)).toHaveText("4 components, 1 connection");
  await page.keyboard.press("Delete");
  await expect(summary(page)).toHaveText("3 components, 1 connection");

  // Rename, then autosave → reload → still there
  await page.getByRole("button", { name: "Rename design" }).click();
  await page.getByLabel("Design title").fill("Checkout API");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Checkout API" })).toBeVisible();
  await expect(page.getByTestId("save-status")).toHaveText(/^Saved \d/, { timeout: 5_000 });
  await page.reload();
  await expect(summary(page)).toHaveText("3 components, 1 connection");
  await expect(page.getByRole("heading", { level: 1, name: "Checkout API" })).toBeVisible();
  await expect(node(page, "Service")).toContainText("Instances 4");

  // History holds a snapshot
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByRole("list", { name: "Saved versions" }).getByRole("listitem").first()).toBeVisible();

  // Export JSON, then import it on /studio
  await page.getByRole("button", { name: "Export" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /JSON/ }).click()]);
  expect(download.suggestedFilename()).toBe("checkout-api.json");
  const file = await download.path();
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  expect(json).toMatchObject({ title: "Checkout API", version: 1 });
  expect(json.graph.nodes).toHaveLength(3);

  // SVG export downloads too
  await page.getByRole("button", { name: "Export" }).click();
  const [svg] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /SVG · Blueprint/ }).click()]);
  expect(svg.suggestedFilename()).toBe("checkout-api-blueprint.svg");
  await page.getByRole("button", { name: "Export" }).click();
  const [png] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /PNG · Paper/ }).click()]);
  expect(fs.readFileSync(await png.path()).subarray(1, 4).toString()).toBe("PNG");

  await page.goto("/studio");
  await expect(page.getByRole("link", { name: "Checkout API" })).toHaveCount(1);
  await page.getByLabel("Import a design JSON file").setInputFiles(file);
  await expect(page.getByText("Imported “Checkout API”.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Checkout API" })).toHaveCount(2);

  // A broken file shows readable errors
  json.graph.nodes[0].x = "left";
  await page.getByLabel("Import a design JSON file").setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(json)) });
  await expect(page.getByRole("alert").filter({ hasText: "Could not import broken.json" })).toContainText("graph.nodes.0.x:");
  expect(errors).toEqual([]);
});

test("a template creates a design with the framework notes", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/studio");
  await page.getByRole("button", { name: "New from template" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Three-tier web app/ }).click();
  await expect(page).toHaveURL(/\/studio\/d-/);
  await expect(page.getByRole("heading", { level: 1, name: "Three-tier web app" })).toBeVisible();
  await expect(summary(page)).toHaveText(/^\d+ components, \d+ connections/);
  if ((page.viewportSize()?.width ?? 0) < 1024) await page.getByRole("button", { name: "Panel", exact: true }).click();
  await page.getByRole("tab", { name: "Notes" }).click();
  await expect(page.getByLabel("Design notes (Markdown)")).toHaveValue(/## Requirements/);
  expect(errors).toEqual([]);
});

test("an unknown design id says so and links back", async ({ page }) => {
  await page.goto("/studio/d-doesnotexist");
  await expect(page.getByRole("heading", { level: 1, name: "Design not found" })).toBeVisible();
  await page.getByRole("link", { name: "← All designs" }).click();
  await expect(page).toHaveURL(/\/studio$/);
});

test("375px: drawers for palette and panel, no horizontal scroll", async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/studio/new");
  await expect(page).toHaveURL(/\/studio\/d-/);
  await expect(summary(page)).toHaveText("0 components, 0 connections");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Add Cache", exact: true }).click();
  await expect(summary(page)).toHaveText("1 component, 0 connections");
  await expect(page.getByRole("button", { name: "Add Cache", exact: true })).toBeHidden(); // drawer closed
  await page.getByRole("button", { name: "Panel", exact: true }).click();
  await expect(page.getByRole("tabpanel").getByRole("heading", { name: "Cache" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
