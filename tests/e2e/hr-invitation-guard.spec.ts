import { test, expect } from "@playwright/test";

// Browser-level fail-closed checks. No live token, account, email or database mutation.
test("incomplete HR invitation clears browser fragment and does not open MFA", async ({ page }) => {
  await page.goto("/hr-invitations/accept?id=invalid");
  await expect(page.locator("p[role=\"alert\"]")).toContainText("incomplete or expired");
  await expect(page).toHaveURL(/\/hr-invitations\/accept$/);
  await expect(page.getByRole("link", { name: "Back to sign in" })).toBeVisible();
});

test("disabled HR exchange cannot advance to MFA or expose credentials", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/v1/hr-invitations/exchange", async route => {
    attempts++;
    await route.fulfill({ status: 503, contentType: "application/json", body: '{"message":"Disabled"}' });
  });
  await page.goto("/hr-invitations/accept?id=synthetic-id#access_token=fake&refresh_token=fake");
  await expect(page.locator("p[role=\"alert\"]")).toContainText("activation is not available yet");
  expect(attempts).toBe(1);
  await expect(page).toHaveURL(/\/hr-invitations\/accept$/);
  await expect(page.getByLabel("Choose a password")).toHaveCount(0);
});

test("HR completion fails closed when activation flow is unavailable", async ({ page }) => {
  await page.route("**/api/v1/auth/flow", route =>
    route.fulfill({ status: 503, contentType: "application/json", body: '{"message":"Disabled"}' }));
  await page.goto("/hr-invitations/complete");
  await expect(page.getByRole("status")).toContainText("verification has expired");
  await expect(page.getByLabel("Choose a password")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save password" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to sign in" })).toBeVisible();
});
