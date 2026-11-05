import { defineConfig, devices } from "@playwright/test";

// PLAYWRIGHT_BASE_URL runs the suite against a deployed site (no local server is started).
const remote = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: remote ?? "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } } },
  ],
  // SDL_FIXTURE_CASES adds tests/fixtures/case-studies so Interview Mode has a small, stable case to drive.
  webServer: remote ? undefined : { command: "pnpm build && pnpm start -p 3100", env: { SDL_FIXTURE_CASES: "1" }, url: "http://localhost:3100", reuseExistingServer: !process.env.CI, timeout: 300_000 },
});
