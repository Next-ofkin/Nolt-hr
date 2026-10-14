import { test, expect } from "@playwright/test";
test("real Auth screens fit all target widths and expose no synthetic shortcut", async ({
  page,
}) => {
  for (const width of [320, 375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/login", "/signup", "/recovery"]) {
      await page.goto(path);
      await expect(page.getByLabel("Email address")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(
        page.getByRole("button", { name: "Continue as local HR" }),
      ).toHaveCount(0);
    }
  }
  await page.setViewportSize({ width: 375, height: 850 });
  await page.goto("/signup");
  await expect(page.getByLabel("Full name")).toBeVisible();
  await page.screenshot({
    path: ".local/qa/real-signup-mobile.png",
    fullPage: true,
  });
});
