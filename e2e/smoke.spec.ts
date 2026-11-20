import { expect, test } from "@playwright/test";

async function waitForHome(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.locator("#home:not([hidden])")).toBeAttached({ timeout: 30_000 });
  await expect(page.locator("#home[data-phase='in']")).toBeAttached({ timeout: 15_000 });
}

async function clickHomeAction(page: import("@playwright/test").Page, label: string): Promise<void> {
  await waitForHome(page);
  const button = page.getByRole("navigation", { name: "Main menu" }).getByRole("button", { name: label });
  await expect(button).toBeAttached();
  await button.evaluate((el) => (el as HTMLButtonElement).click());
}

test("boots to home and opens free play", async ({ page }) => {
  page.on("pageerror", (err) => console.log("PAGEERROR", err.message));
  await page.goto("/");
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#viewport")).toBeVisible();

  await clickHomeAction(page, "Free play");
  await expect.poll(() => page.evaluate(() => location.hash), { timeout: 15_000 }).toBe("#play");
  await expect(page.locator("#play-hud")).toBeVisible();
});

test("settings screen opens from home", async ({ page }) => {
  page.on("pageerror", (err) => console.log("PAGEERROR", err.message));
  await page.goto("/#home");
  await clickHomeAction(page, "Settings");
  await expect.poll(() => page.evaluate(() => location.hash), { timeout: 15_000 }).toBe("#settings");
  await expect(page.locator("#sheet")).toBeVisible();
});
