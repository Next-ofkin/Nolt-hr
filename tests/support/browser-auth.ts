import { test as base, expect, type Page } from "@playwright/test";
import { account, totp } from "./real-auth.js";
export const test = base.extend<{
  realUser: Awaited<ReturnType<typeof account>>;
}>({
  realUser: async ({}, use) => {
    const user = await account("HR");
    try {
      await use(user);
    } finally {
      await user.cleanup();
    }
  },
});
export { expect };
export async function signIn(
  page: Page,
  user: { email: string; password: string },
  heading = "Form library",
) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled({ timeout: 15000 });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Set up your authenticator" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Set up authenticator", exact: true })
    .click();
  await expect(
    page.getByText("Enter setup key manually", { exact: true }),
  ).toBeVisible();
  await page.getByText("Enter setup key manually", { exact: true }).click();
  const secret = await page.locator("details p").textContent();
  expect(secret).toBeTruthy();
  await page.getByLabel("Authenticator code").fill(totp(secret!));
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(
    page.getByRole("heading", { name: heading, exact: true }),
  ).toBeVisible({ timeout: 45000 });
}
