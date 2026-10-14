import { test, expect, signIn } from "../support/browser-auth.js";
test("real password and TOTP login shows verified account and global logout blocks another tab", async ({
  page,
  context,
  realUser,
}) => {
  await signIn(page, realUser);
  await page.getByRole("link", { name: "Automated QA", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your account" }),
  ).toBeVisible();
  await expect(
    page.getByText("Authenticator verified (MFA)", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Supabase Auth", { exact: true })).toBeVisible();
  const other = await context.newPage();
  await other.goto("/account");
  await expect(
    other.getByRole("heading", { name: "Your account" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sign out of all application sessions" })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  await other.reload();
  await expect(other).toHaveURL(/\/login$/);
});
