import { expect, test } from "@playwright/test";

// Browser journey with entirely synthetic HTTP fixtures; never contacts a real provider.
// All HR invitation / MFA / password endpoints are intercepted in this test.
test("HR invitation handoff requires MFA then password setup and remains activation-pending", async ({ page }) => {
  const id = "e4b703d5-bf2c-4555-bfb1-6e63d452af3a";
  const csrf = "synthetic-csrf";
  const factorId = "cbfab129-8d44-4ed3-82a2-d026b09fe902";
  const calls: string[] = [];
  let verified = false;
  let passwordSaved = false;

  await page.route("**/api/v1/**", async route => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    // Never let a request escape to the live API.
    if (path === "/api/v1/auth/session")
      return route.fulfill({ status: 401, contentType: "application/json", body: '{"message":"Not signed in"}' });
    if (path === "/api/v1/hr-invitations/exchange") {
      calls.push("exchange");
      const body = JSON.parse(req.postData() ?? "{}");
      expect(body.invitationId).toBe(id);
      expect(body.proof).toEqual({ access_token: "synthetic", refresh_token: "synthetic" });
      return route.fulfill({ status: 201, contentType: "application/json", body: '{"next":"mfa"}' });
    }
    if (path === "/api/v1/auth/flow") {
      calls.push("flow");
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ stage: verified ? "hr_invitation" : "challenge", csrfToken: csrf,
          factorId, qrCode: "", secret: "" }) });
    }
    if (path === "/api/v1/auth/mfa/verify") {
      calls.push("mfa");
      const body = JSON.parse(req.postData() ?? "{}");
      expect(body).toEqual({ factorId, code: "123456" });
      expect(req.headers()["x-csrf-token"]).toBe(csrf);
      verified = true;
      return route.fulfill({ status: 201, contentType: "application/json", body: '{"next":"hr_invitation"}' });
    }
    if (path === "/api/v1/hr-invitations/verification") {
      calls.push("proof");
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ verified, activationAllowed: false }) });
    }
    if (path === "/api/v1/hr-invitations/password") {
      calls.push("password");
      expect(verified).toBe(true);
      expect(req.headers()["x-csrf-token"]).toBe(csrf);
      const body = JSON.parse(req.postData() ?? "{}");
      expect(body.password).toBe("SyntheticPassword-12345");
      passwordSaved = true;
      return route.fulfill({ status: 201, contentType: "application/json",
        body: '{"next":"awaiting_activation"}' });
    }
    throw Error("Unexpected API request in isolated HR onboarding test: " + path);
  });

  await page.goto(`/hr-invitations/accept?id=${id}#access_token=synthetic&refresh_token=synthetic`);
  await expect(page).toHaveURL(/\/auth\/mfa$/);
  await expect(page.getByText("Verify your sign-in")).toBeVisible();
  await page.getByLabel("Authenticator code").fill("123456");
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await expect(page).toHaveURL(/\/hr-invitations\/complete$/);
  await expect(page.getByRole("status")).toContainText("Account activation will remain pending");
  await page.getByLabel("Choose a password").fill("SyntheticPassword-12345");
  await page.getByLabel("Confirm password").fill("SyntheticPassword-12345");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("status")).toContainText("HR account activation remains pending");
  expect(passwordSaved).toBe(true);
  expect(calls).toEqual(["exchange", "flow", "mfa", "flow", "proof", "password"]);
  await expect(page.getByRole("button", { name: "Save password" })).toHaveCount(0);
});
