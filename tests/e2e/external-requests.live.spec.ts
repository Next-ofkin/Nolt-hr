import { randomUUID } from "node:crypto";
import { createField } from "@nolt/form-schemas";
import { test, expect, signIn } from "../support/browser-auth.js";
import { account, admin, Browser, owner } from "../support/real-auth.js";

// A new external email address has no staff account, password or MFA factor.
async function emailRecipient() {
  const email = `qa-${randomUUID()}@example.com`;
  let id: string | undefined;
  return {
    email,
    get id() {
      return id;
    },
    setId(value: string) {
      id = value;
    },
    async capture() {
      const db = await owner();
      try {
        id =
          (
            await db.query('SELECT id FROM public."User" WHERE email=$1', [
              email,
            ])
          ).rows[0]?.id ?? id;
      } finally {
        await db.end();
      }
    },
    async cleanup() {
      await this.capture();
      if (!id) return;
      const db = await owner();
      try {
        await db.query('UPDATE public."User" SET active=false WHERE id=$1', [
          id,
        ]);
      } finally {
        await db.end();
      }
      const deleted = await admin().auth.admin.deleteUser(id);
      if (deleted.error) throw Error("External QA cleanup failed");
    },
  };
}

test("employee queues a request; independently verified recipient submits privately in one-request scope", async ({
  page,
  realUser,
  browser,
}) => {
  test.setTimeout(480000);
  const employee = await account(),
    recipient = await emailRecipient(),
    outsider = await account();
  const recipientContext = await browser.newContext(),
    recipientPage = await recipientContext.newPage();
  const consoleErrors: string[] = [];
  recipientPage.on("pageerror", (e) => consoleErrors.push(e.name));
  try {
    const hr = await new Browser().verified(realUser),
      csrf = (await (await hr.request("/auth/session")).json()).csrfToken;
    const question = {
      ...createField("text", randomUUID()),
      label: "Your independent statement",
      required: true,
    };
    let r = await hr.post(
      "/forms",
      { title: `External request QA ${randomUUID()}`, recipient: "GUARANTOR" },
      csrf,
    );
    expect(r.status).toBe(201);
    let f = await r.json();
    r = await hr.request(`/form-versions/${f.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({
        expectedRevision: f.revision,
        content: { title: f.title, recipient: "GUARANTOR", fields: [question] },
      }),
    });
    expect(r.status).toBe(200);
    f = await r.json();
    r = await hr.post(
      `/form-versions/${f.id}/publish`,
      { expectedRevision: f.revision },
      csrf,
    );
    expect(r.status).toBe(201);
    f = await r.json();
    r = await hr.post(
      "/employees",
      {
        fullName: "External workflow QA",
        email: employee.email,
        jobTitle: "QA",
        department: "Development QA",
        employmentType: "QA",
        startDate: "2026-10-15",
      },
      csrf,
    );
    expect(r.status).toBe(201);
    const profile = await r.json();
    r = await hr.post(
      `/employees/${profile.employee.id}/onboarding-cases`,
      { expectedRevision: 1 },
      csrf,
    );
    expect(r.status).toBe(201);
    const c = (await r.json()).onboardingCase;
    r = await hr.post(
      `/onboarding-cases/${c.id}/assignments`,
      { expectedRevision: c.revision, formVersionId: f.id, required: true },
      csrf,
    );
    expect(r.status).toBe(201);
    const a = (await r.json()).assignments[0];
    await signIn(page, employee, "My onboarding");
    const contact = page.getByRole("form", {
      name: "guarantor recipient details",
    });
    await expect(
      contact.getByRole("button", { name: "Save recipient details" }),
    ).toBeEnabled();
    await contact
      .getByLabel("Recipient full name")
      .fill("Independent QA Recipient");
    await contact.getByLabel("Recipient email").fill(recipient.email);
    await contact
      .getByRole("button", { name: "Save recipient details" })
      .click();
    await expect(
      contact.getByRole("button", { name: "Send request", exact: true }),
    ).toBeEnabled();
    await contact
      .getByRole("button", { name: "Send request", exact: true })
      .click();
    await expect(
      contact.getByText(
        "Request queued. Refresh status to check email delivery.",
      ),
    ).toBeVisible();
    const requestPath = `/api/v1/me/assignments/${a.id}/external-requests`;
    let queued = (await (await page.request.get(requestPath)).json()).items[0];
    expect(queued.state).toBe("QUEUED");
    const employeeCsrf = (
      await (await page.request.get("/api/v1/auth/session")).json()
    ).csrfToken;
    const employeeHeaders = {
      "x-csrf-token": employeeCsrf,
      Origin: "http://127.0.0.1:3000",
    };
    expect(
      (
        await page.request.put("/api/v1/external/request/draft", {
          headers: employeeHeaders,
          data: {
            expectedRevision: 0,
            answers: { [question.id]: "Employee impersonation" },
          },
        })
      ).status(),
    ).toBe(401);
    const db = await owner();
    try {
      // Explicit email transport fixture only. No email is sent to disposable QA addresses.
      await db.query(
        "UPDATE public.\"ExternalRequest\" SET state='SENDING' WHERE id=$1",
        [queued.id],
      );
      await db.query(
        'UPDATE public."ExternalRequest" SET state=\'SENT\',"sentAt"=now() WHERE id=$1',
        [queued.id],
      );
      await db.query(
        'UPDATE public."ExternalDelivery" SET state=\'SENT\',attempts=1 WHERE "requestId"=$1',
        [queued.id],
      );
    } finally {
      await db.end();
    }
    const generated = await admin().auth.admin.generateLink({
      type: "magiclink",
      email: recipient.email,
    });
    expect(Boolean(generated.error)).toBe(false);
    recipient.setId(generated.data.user.id);
    const hash = generated.data.properties?.hashed_token;
    expect(Boolean(hash)).toBe(true);
    await recipientPage.goto(
      `http://127.0.0.1:3000/external/accept?id=${queued.id}#token_hash=${hash}&type=${generated.data.properties.verification_type}`,
    );
    await expect(
      recipientPage.getByRole("heading", { name: "Your requested form" }),
    ).toBeVisible();
    await recipient.capture();
    expect(Boolean(recipient.id)).toBe(true);
    let scopedSession = await (
      await recipientPage.request.get(
        "http://127.0.0.1:3000/api/v1/external/session",
      )
    ).json();
    expect(scopedSession.requestId).toBe(queued.id);
    expect("permissions" in scopedSession).toBe(false);
    const scopeCookie = (await recipientContext.cookies()).find(
      (c) => c.name === "nolt_external",
    );
    expect(Boolean(scopeCookie?.httpOnly)).toBe(true);
    expect(
      (await recipientContext.cookies()).some((c) => c.name === "nolt_session"),
    ).toBe(false);
    await expect(recipientPage.getByLabel("Authenticator code")).toHaveCount(0);
    expect(new URL(recipientPage.url()).hash).toBe("");
    expect(
      (
        await recipientPage.request.get(
          "http://127.0.0.1:3000/api/v1/me/onboarding",
        )
      ).status(),
    ).toBe(401);
    expect(
      (await admin().auth.admin.getUserById(recipient.id!)).data.user
        ?.factors ?? [],
    ).toEqual([]);
    const previousId = queued.id;
    await contact
      .getByRole("button", { name: "Replace request and send new link" })
      .click();
    await expect(
      contact.getByText(
        "Request queued. Refresh status to check email delivery.",
      ),
    ).toBeVisible();
    queued = (await (await page.request.get(requestPath)).json()).items[0];
    expect(queued.id === previousId).toBe(false);
    expect(
      (
        await recipientPage.request.get(
          "http://127.0.0.1:3000/api/v1/external/request",
        )
      ).status(),
    ).toBe(403);
    const replacementDb = await owner();
    try {
      expect(
        (
          await replacementDb.query(
            'SELECT state FROM public."ExternalRequest" WHERE id=$1',
            [previousId],
          )
        ).rows[0].state,
      ).toBe("REVOKED");
      await replacementDb.query(
        "UPDATE public.\"ExternalRequest\" SET state='SENDING' WHERE id=$1",
        [queued.id],
      );
      await replacementDb.query(
        'UPDATE public."ExternalRequest" SET state=\'SENT\',"sentAt"=now() WHERE id=$1',
        [queued.id],
      );
      await replacementDb.query(
        'UPDATE public."ExternalDelivery" SET state=\'SENT\',attempts=1 WHERE "requestId"=$1',
        [queued.id],
      );
    } finally {
      await replacementDb.end();
    }
    const replacementProof = await admin().auth.admin.generateLink({
      type: "magiclink",
      email: recipient.email,
    });
    expect(Boolean(replacementProof.error)).toBe(false);
    await recipientPage.goto(
      `http://127.0.0.1:3000/external/accept?id=${queued.id}#token_hash=${replacementProof.data.properties.hashed_token}&type=${replacementProof.data.properties.verification_type}`,
    );
    await expect(
      recipientPage.getByRole("heading", { name: "Your requested form" }),
    ).toBeVisible();
    scopedSession = await (
      await recipientPage.request.get(
        "http://127.0.0.1:3000/api/v1/external/session",
      )
    ).json();
    expect(scopedSession.requestId).toBe(queued.id);
    expect("permissions" in scopedSession).toBe(false);
    await recipientPage
      .getByLabel("Your independent statement")
      .fill("My own private guarantor response");
    await recipientPage
      .getByRole("button", { name: "Save draft", exact: true })
      .click();
    await expect(recipientPage.getByRole("status")).toHaveText("Draft saved.");
    await recipientPage.reload();
    await expect(
      recipientPage.getByLabel("Your independent statement"),
    ).toHaveValue("My own private guarantor response");
    for (const width of [320, 375, 768, 1024, 1440, 1920]) {
      await recipientPage.setViewportSize({ width, height: 900 });
      await expect(
        recipientPage.getByRole("button", { name: "Submit to HR" }),
      ).toBeVisible();
      expect(
        await recipientPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await recipientPage.setViewportSize({ width: 768, height: 1000 });
    await recipientPage.evaluate(() => {
      document.documentElement.style.zoom = "2";
    });
    expect(
      await recipientPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await recipientPage.evaluate(() => {
      document.documentElement.style.zoom = "";
    });
    await recipientPage.getByLabel("Your independent statement").focus();
    await recipientPage.keyboard.press("Tab");
    await expect(
      recipientPage.getByRole("button", { name: "Save draft", exact: true }),
    ).toBeFocused();
    await recipientPage.setViewportSize({ width: 320, height: 900 });
    await recipientPage.screenshot({
      path: ".local/qa/external-recipient-mobile.png",
      fullPage: true,
    });
    const headers = {
      "x-csrf-token": scopedSession.csrfToken,
      Origin: "http://127.0.0.1:3000",
    };
    expect(
      (
        await recipientPage.request.put(
          "http://127.0.0.1:3000/api/v1/external/request/draft",
          { headers, data: { expectedRevision: 0, answers: {} } },
        )
      ).status(),
    ).toBe(409);
    await recipientPage.getByRole("button", { name: "Submit to HR" }).click();
    await expect(recipientPage.getByRole("status")).toHaveText(
      "Your form was submitted directly to HR.",
    );
    await expect(
      recipientPage.getByLabel("Your independent statement"),
    ).toBeDisabled();
    const tracked = (await (await page.request.get(requestPath)).json())
      .items[0];
    expect(tracked.state).toBe("SUBMITTED");
    expect("answers" in tracked).toBe(false);
    expect("respondentId" in tracked).toBe(false);
    const other = await new Browser().verified(outsider);
    expect((await other.request("/external/request")).status).toBe(401);
    expect((await page.request.get("/api/v1/external/request")).status()).toBe(
      401,
    );
    const evidence = await owner();
    try {
      const s = (
        await evidence.query(
          'SELECT answers,"submittedBy" FROM public."ExternalSubmission" WHERE "requestId"=$1',
          [queued.id],
        )
      ).rows[0];
      expect(s.answers).toEqual({
        [question.id]: "My own private guarantor response",
      });
      expect(s.submittedBy).toBe(recipient.id);
      expect(
        (
          await evidence.query(
            'SELECT count(*)::int AS n FROM public."AuditEvent" WHERE action=\'EXTERNAL_RESPONSE_SUBMITTED\' AND "targetId"=$1',
            [queued.id],
          )
        ).rows[0].n,
      ).toBe(1);
    } finally {
      await evidence.end();
    }
    expect(consoleErrors).toEqual([]);
  } finally {
    await recipientContext.close();
    await employee.cleanup();
    await recipient.cleanup();
    await outsider.cleanup();
  }
});
