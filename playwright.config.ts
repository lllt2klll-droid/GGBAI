import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests — chạy `npm run test:e2e` (cần `npx playwright install` lần đầu).
 * WebServer tự động start `next dev` trước khi test.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // GeoGebra applet nặng — chạy tuần tự
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
