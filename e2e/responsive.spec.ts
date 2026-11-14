import { expect, test } from "@playwright/test";

test("mobile layouts render without horizontal overflow", async ({ page }) => {
  for (const path of ["/", "/login"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows`).toBeLessThanOrEqual(1);
  }
  await page.getByRole("button", { name: /Ortiz Coffee Roasters/ }).click();
  await page.waitForURL(/\/app/);
  for (const path of ["/app", "/app/pools", "/app/demand/new", "/app/transactions"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows`).toBeLessThanOrEqual(1);
  }
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/09-mobile-dashboard.png`, fullPage: true });
});
