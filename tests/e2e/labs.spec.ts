import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const LAB = "/simulators/code-labs/lru-cache";

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(LAB);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("failed test runs · autosaved")).toBeVisible(); // saved code loaded
  return errors;
}

async function loadSolution(page: Page) {
  await page.getByRole("button", { name: "Show reference solution" }).click();
  await page.getByRole("button", { name: "Show solution" }).click();
  await page.getByRole("button", { name: "Replace my code with it" }).click();
  await page.getByRole("button", { name: "Replace my code", exact: true }).click();
}

const summary = (page: Page) => page.getByTestId("lab-summary");

test("JavaScript: the reference solution passes every test", async ({ page }) => {
  const errors = await open(page);
  await page.getByRole("radio", { name: "JavaScript" }).click();
  await loadSolution(page);
  await page.getByRole("button", { name: /Run tests/ }).click();
  await expect(summary(page)).toHaveText(/All \d+ tests passed/, { timeout: 15_000 });
  await expect(page.getByText("PASS").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("JavaScript: an infinite loop stops after 5 s and the next run works", async ({ page }) => {
  await open(page);
  await page.getByRole("radio", { name: "JavaScript" }).click();
  await page.getByRole("switch", { name: /Plain editor/ }).click();
  const editor = page.getByRole("textbox", { name: "Your JavaScript code" });
  await editor.fill("while (true) {}");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(summary(page)).toHaveText(/Stopped after 5 s/, { timeout: 15_000 });
  await editor.fill('console.log("still alive")');
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(summary(page)).toHaveText("Program finished.", { timeout: 10_000 });
  await expect(page.getByText("still alive", { exact: true })).toBeVisible();
});

test("TypeScript: the reference solution compiles in the browser and passes", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "one compiler download is enough");
  test.setTimeout(90_000);
  await open(page);
  await page.getByRole("radio", { name: "TypeScript" }).click();
  await loadSolution(page);
  await page.getByRole("button", { name: /Run tests/ }).click();
  await expect(summary(page)).toHaveText(/All \d+ tests passed/, { timeout: 60_000 });
});

test("Python: the reference solution passes through Pyodide", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "one Pyodide download is enough");
  test.setTimeout(180_000);
  await open(page);
  await loadSolution(page);
  await page.getByRole("button", { name: /Run tests/ }).click();
  await expect(summary(page)).toHaveText(/All \d+ tests passed/, { timeout: 150_000 });
});

test("Java: downloads one runnable file with the tests", async ({ page }) => {
  await open(page);
  await page.getByRole("radio", { name: "Java", exact: true }).click();
  await expect(page.getByText("Java and C++ run on your machine.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run tests" })).toHaveCount(0);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download runnable file" }).click()]);
  expect(download.suggestedFilename()).toBe("LabTests.java");
  expect(fs.readFileSync(await download.path(), "utf8")).toContain("public class LabTests");
});
