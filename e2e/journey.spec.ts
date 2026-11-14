import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };

async function asPersona(page: Page, business: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(business) }).click();
  await page.waitForURL(/\/app/);
}

test.describe.serial("COMMONS main journey", () => {
  test("landing explains the product", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Buy together.");
    await expect(page.getByRole("heading", { name: "Add your order." })).toBeAttached();
    await shot(page, "01-landing");
  });

  test("demo negotiation: Guardian rejects A, approves B; all three approve explicitly", async ({ page }) => {
    await asPersona(page, "Bloom Bakery");
    await expect(page.getByRole("heading", { name: /Hey Maya/ })).toBeVisible();
    await shot(page, "02-dashboard-empty");

    await page.getByRole("link", { name: "Discover Pools" }).first().click();
    await page.getByRole("link", { name: /Corrugated shipping cartons/ }).first().click();
    await page.getByRole("button", { name: "Run agent negotiation" }).click();
    await expect(page.getByText("Rejected by Financial Guardian").first()).toBeVisible();
    await expect(page.getByText("Guardian approved").first()).toBeVisible();
    await expect(page.getByText(/Rejected Proposal A: Participant B/)).toBeVisible();
    await shot(page, "03-negotiation-room");
    const poolUrl = page.url();

    for (const [business, first] of [["Bloom Bakery", true], ["Ortiz Coffee Roasters", false], ["Loom & Thread", false]] as const) {
      if (!first) await asPersona(page, business);
      await page.goto(poolUrl + "/approve");
      await expect(page.getByRole("heading", { name: "Approve Proposal B" })).toBeVisible();
      const approve = page.getByRole("button", { name: "Approve proposal" });
      await expect(approve).toBeDisabled(); // explicit acknowledgement required
      if (first) await shot(page, "04-approval");
      await page.getByRole("checkbox").check();
      await approve.click();
      await page.waitForURL(poolUrl);
    }
    await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/must explicitly approve|contract is not configured|Connect your NEAR/).first()).toBeVisible();
    await shot(page, "05-all-approved");

    await page.goto("/app/transactions");
    await expect(page.getByText("off-chain record").first()).toBeVisible();
    await expect(page.getByText("none (not on-chain)").first()).toBeVisible();
    await page.goto("/app/activity");
    await expect(page.getByText("Financial Guardian").first()).toBeVisible();
    await page.goto("/app");
    await shot(page, "06-dashboard");
  });

  test("new user: sign up, natural-language intent, match and join after demo reset", async ({ page }) => {
    await asPersona(page, "Bloom Bakery");
    await page.goto("/app/settings");
    await page.getByRole("button", { name: "Reset demo" }).click();
    await page.getByRole("button", { name: "Yes, reset demo data" }).click();
    await expect(page.getByText("Demo reset.")).toBeVisible();

    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByRole("button", { name: "Create account" }).first().click();
    await page.locator("input[name=fullName]").fill("Sam Rivera");
    await page.locator("input[name=businessName]").fill("Rivera Candles");
    await page.locator("input[name=location]").fill("Williamsburg, New York");
    await page.locator("input[name=email]").fill(`sam${Date.now()}@example.com`);
    await page.locator("input[name=password]").fill("correct-horse-42");
    await page.locator("form").getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/app$/);

    await page.goto("/app/demand/new");
    await page.getByPlaceholder(/I need 2,000 cartons/).fill("I need 800 cartons of packaging materials delivered to Williamsburg within two weeks. I want to pay no more than $2.05 per carton.");
    await page.getByRole("button", { name: "Extract fields" }).click();
    await expect(page.getByText("All essentials found")).toBeVisible();
    await shot(page, "07-create-demand");
    await page.getByRole("button", { name: "Save intent & find matches" }).click();
    await expect(page.getByText("Intent saved and matched")).toBeVisible();
    await expect(page.getByText("Pacific Pack Co. does not deliver to New York.")).toBeVisible();
    await shot(page, "08-matches");
    await page.getByRole("button", { name: "Join pool" }).first().click();
    await page.waitForURL(/\/app\/pools\/pool_/);
    await expect(page.getByText("you", { exact: true }).first()).toBeVisible();
  });
});
