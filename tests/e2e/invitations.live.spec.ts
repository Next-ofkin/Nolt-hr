import { randomUUID, randomBytes } from "node:crypto";
import { test, expect, signIn } from "../support/browser-auth.js";
import { admin, owner, totp } from "../support/real-auth.js";
test("HR replaces an invitation; real Supabase email proof, MFA and password activate only its employee", async ({
  page,
  realUser,
  browser,
}) => {
  test.setTimeout(360000);
  const email = `qa-${randomUUID()}@example.com`,
    name = `Invitation QA ${randomUUID()}`;
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3000",
  });
  let subject: string | undefined;
  try {
    await signIn(page, realUser);
    const session = await (
      await page.request.get("/api/v1/auth/session")
    ).json();
    const headers = {
      Origin: "http://127.0.0.1:3000",
      "x-csrf-token": session.csrfToken,
    };
    let r = await page.request.post("/api/v1/employees", {
      headers,
      data: {
        fullName: name,
        email,
        jobTitle: "Analyst",
        department: "Invitation QA",
        employmentType: "Permanent",
        startDate: "2026-10-14",
      },
    });
    expect(r.status()).toBe(201);
    const employee = (await r.json()).employee;
    r = await page.request.post(
      `/api/v1/employees/${employee.id}/onboarding-cases`,
      { headers, data: { expectedRevision: employee.revision } },
    );
    expect(r.status()).toBe(201);
    await page.goto("/employees");
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await page
      .getByRole("button", { name: "Send invitation", exact: true })
      .click();
    await expect(
      page.getByText("Invitation: queued", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    const old = (
      await (
        await page.request.get(`/api/v1/employees/${employee.id}/invitations`)
      ).json()
    ).items[0];
    await page
      .getByRole("button", { name: "Resend invitation", exact: true })
      .click();
    await expect(
      page.getByText(
        "Invitation queued. Refresh its status to check delivery.",
        { exact: true },
      ),
    ).toBeVisible({ timeout: 30000 });
    const items = (
      await (
        await page.request.get(`/api/v1/employees/${employee.id}/invitations`)
      ).json()
    ).items;
    const invitation = items[0];
    expect(invitation.id).not.toBe(old.id);
    expect(items.find((i: any) => i.id === old.id).state).toBe("REVOKED");
    // A generated provider link tests real one-time email proof without sending mail to a disposable address.
    // Only transport acknowledgement is a database fixture; SMTP is tested separately with the approved inbox.
    const provider = admin();
    const link = await provider.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        data: { name: "Automated QA" },
        redirectTo: `http://127.0.0.1:3000/invitations/accept?id=${invitation.id}`,
      },
    });
    expect(link.error?.code).toBeUndefined();
    subject = link.data.user!.id;
    const db = await owner();
    try {
      await db.query(
        'UPDATE public."EmployeeInvitation" SET state=\'SENT\',"sentAt"=now() WHERE id=$1',
        [invitation.id],
      );
      await db.query(
        'UPDATE public."InvitationDelivery" SET state=\'SENT\',attempts=1 WHERE "invitationId"=$1',
        [invitation.id],
      );
    } finally {
      await db.end();
    }
    const recipient = await context.newPage();
    expect(
      (
        await recipient.request.post("/api/v1/invitations/exchange", {
          headers: { Origin: "http://127.0.0.1:3000" },
          data: {
            invitationId: old.id,
            proof: {
              tokenHash: link.data.properties!.hashed_token,
              type: "invite",
            },
          },
        })
      ).status(),
    ).toBe(403);
    await recipient.goto(
      `/invitations/accept?id=${invitation.id}#token_hash=${encodeURIComponent(link.data.properties!.hashed_token)}&type=invite`,
    );
    await expect(
      recipient.getByRole("heading", { name: "Set up your authenticator" }),
    ).toBeVisible({ timeout: 30000 });
    expect((await recipient.request.get("/api/v1/auth/session")).status()).toBe(
      401,
    );
    await recipient
      .getByRole("button", { name: "Set up authenticator", exact: true })
      .click();
    await expect(
      recipient.getByText("Enter setup key manually", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await recipient
      .getByText("Enter setup key manually", { exact: true })
      .click();
    const secret = await recipient.locator("details p").textContent();
    await recipient.getByLabel("Authenticator code").fill(totp(secret!));
    await recipient
      .getByRole("button", { name: "Verify and continue", exact: true })
      .click();
    await expect(
      recipient.getByLabel("Choose a password", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    expect((await recipient.request.get("/api/v1/auth/session")).status()).toBe(
      401,
    );
    for (const width of [320, 375, 768, 1024, 1440, 1920]) {
      await recipient.setViewportSize({ width, height: 900 });
      expect(
        await recipient.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    const password = randomBytes(24).toString("base64url") + "aA1!";
    await recipient
      .getByLabel("Choose a password", { exact: true })
      .fill(password);
    await recipient
      .getByLabel("Confirm password", { exact: true })
      .fill(password);
    await recipient
      .getByRole("button", { name: "Activate employee account", exact: true })
      .click();
    await expect(
      recipient.getByRole("heading", { name: "My onboarding", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    const home = await (
      await recipient.request.get("/api/v1/me/onboarding")
    ).json();
    expect(home.employee.id).toBe(employee.id);
    expect(
      (
        await recipient.request.get(
          `/api/v1/employees/${employee.id}/invitations`,
        )
      ).status(),
    ).toBe(403);
    const final = (
      await (
        await page.request.get(`/api/v1/employees/${employee.id}/invitations`)
      ).json()
    ).items[0];
    expect(final.state).toBe("ACCEPTED");
    expect(
      (
        await page.request.post(`/api/v1/invitations/${invitation.id}/revoke`, {
          headers,
        })
      ).status(),
    ).toBe(409);
    const evidence = await owner();
    try {
      expect(
        (
          await evidence.query(
            'SELECT count(*)::int AS n FROM public."AuditEvent" WHERE action=\'INVITATION_ACCEPTED\' AND "targetId"=$1',
            [invitation.id],
          )
        ).rows[0].n,
      ).toBe(1);
    } finally {
      await evidence.end();
    }
  } finally {
    await context.close();
    if (subject) {
      const db = await owner();
      try {
        await db.query('UPDATE public."User" SET active=false WHERE id=$1', [
          subject,
        ]);
        await db.query(
          'UPDATE public."Session" SET "revokedAt"=now() WHERE "userId"=$1',
          [subject],
        );
      } finally {
        await db.end();
      }
      const result = await admin().auth.admin.deleteUser(subject);
      expect(result.error).toBeNull();
    }
  }
});
