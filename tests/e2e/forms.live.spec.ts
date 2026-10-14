import { test, expect, signIn } from "../support/browser-auth.js";
test("HR creates, previews, publishes and reopens a form", async ({
  page,
  realUser,
}) => {
  await signIn(page, realUser);
  await page.getByRole("button", { name: "Create form", exact: true }).click();
  const title = `Browser form ${Date.now()}`;
  await page.getByLabel("Form title", { exact: true }).fill(title);
  await page.getByLabel("Completed by").selectOption("GUARANTOR");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Short answer", exact: true }).click();
  await page.getByLabel("Question label").fill("Full legal name");
  await page.getByLabel("Required field").check();
  await page.getByRole("button", { name: "Signature", exact: true }).click();
  await page.getByLabel("Signature method").selectOption("UPLOAD");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved to the database.")).toBeVisible();
  await page.screenshot({
    path: ".local/qa/form-builder-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Full legal name");
  await expect(page.getByRole("dialog")).toContainText("Attach your signature");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Publish form", exact: true }).click();
  await expect(page.getByRole("button", { name: "New version" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(page.getByLabel("Form title", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "New version" }).click();
  await expect(page.getByText("Draft · v2")).toBeVisible();
  await expect(page.getByLabel("Form title", { exact: true })).toBeEnabled();
});
test("builder and preview fit phone, tablet and wide screens", async ({
  page,
  realUser,
}) => {
  await signIn(page, realUser);
  await page.getByRole("button", { name: "Create form", exact: true }).click();
  await page
    .getByLabel("Form title", { exact: true })
    .fill(`Responsive ${Date.now()}`);
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.getByRole("button", { name: "Signature", exact: true }).click();
  for (const width of [320, 375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("heading", { name: "Add fields" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (width === 375)
      await page.screenshot({
        path: ".local/qa/form-builder-mobile.png",
        fullPage: true,
      });
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Close", exact: true }).click();
  }
});
