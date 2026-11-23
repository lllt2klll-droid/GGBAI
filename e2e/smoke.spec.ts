import { expect, test } from "@playwright/test";

/**
 * Smoke E2E — verify app load + GeoGebra applet mount + toolbar.
 * Không phụ thuộc GEMINI_API_KEY (chỉ test UI tĩnh + demo actions).
 */

test.describe("Workspace smoke", () => {
  test("trang chủ load và link tới workspace", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/GeoGebra/i);
    const link = page.getByRole("link", { name: /workspace|mở/i }).first();
    await expect(link).toBeVisible();
  });

  test("workspace mount GeoGebra applet", async ({ page }) => {
    await page.goto("/workspace");
    // Applet inject div#ggb-* vào container — chờ tối đa 45s (deployggb.js CDN)
    const applet = page.locator("[id^='ggb-']");
    await expect(applet).toBeVisible({ timeout: 45_000 });
    // Toolbar demo actions hiển thị
    await expect(page.getByText("Dựng nhanh:")).toBeVisible();
  });

  test("projects page hiển thị", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByText(/dự án/i).first()).toBeVisible();
  });
});
