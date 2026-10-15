import { randomUUID } from "node:crypto";
import { createField } from "@nolt/form-schemas";
import { test, expect, signIn } from "../support/browser-auth.js";
import { account, Browser, owner } from "../support/real-auth.js";

test("employee prepares external recipient details without sending or answering their form", async ({
  page,
  realUser,
}) => {
  test.setTimeout(360000);
  const employee = await account(),
    outsider = await account();
  try {
    const hr = await new Browser().verified(realUser);
    const csrf = (await (await hr.request("/auth/session")).json()).csrfToken;
    let r = await hr.post(
      "/forms",
      { title: `Guarantor contact QA ${randomUUID()}`, recipient: "GUARANTOR" },
      csrf,
    );
    expect(r.status).toBe(201);
    let f = await r.json();
    r = await hr.request(`/form-versions/${f.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({
        expectedRevision: f.revision,
        content: {
          title: f.title,
          recipient: "GUARANTOR",
          fields: [
            {
              ...createField("text", randomUUID()),
              label: "Guarantor statement",
              required: true,
            },
          ],
        },
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
        fullName: "External contact QA",
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
    const panel = page.getByRole("form", {
      name: "guarantor recipient details",
    });
    await expect(
      panel.getByRole("button", { name: "Save recipient details" }),
    ).toBeEnabled();
    await panel.getByLabel("Recipient full name").fill("Independent Guarantor");
    await panel.getByLabel("Recipient email").fill("guarantor@example.invalid");
    await panel.getByRole("button", { name: "Save recipient details" }).click();
    await expect(panel.getByRole("status")).toHaveText(
      "Recipient details saved.",
    );
    await page.reload();
    await expect(panel.getByLabel("Recipient full name")).toHaveValue(
      "Independent Guarantor",
    );
    await expect(panel.getByLabel("Recipient email")).toHaveValue(
      "guarantor@example.invalid",
    );
    for (const width of [320, 375, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(
        panel.getByRole("button", { name: "Save recipient details" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    const employeeCsrf = (
      await (await page.request.get("/api/v1/auth/session")).json()
    ).csrfToken;
    const headers = {
      "x-csrf-token": employeeCsrf,
      Origin: "http://127.0.0.1:3000",
    };
    const path = `/api/v1/me/assignments/${a.id}/external-contact`;
    expect(
      (
        await page.request.put(path, {
          headers,
          data: {
            expectedRevision: 0,
            fullName: "Stale",
            email: "other@example.invalid",
          },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await page.request.put(path, {
          headers,
          data: {
            expectedRevision: 1,
            fullName: "Self",
            email: employee.email,
          },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.put(`/api/v1/me/assignments/${a.id}/response`, {
          headers,
          data: { expectedRevision: 0, answers: {} },
        })
      ).status(),
    ).toBe(403);
    const other = await new Browser().verified(outsider);
    expect(
      (await other.request(`/me/assignments/${a.id}/external-contact`)).status,
    ).toBe(404);
    const db = await owner();
    try {
      const saved = (
        await db.query(
          'SELECT email,revision FROM public."ExternalContactDraft" WHERE "assignmentId"=$1',
          [a.id],
        )
      ).rows[0];
      expect(saved).toEqual({
        email: "guarantor@example.invalid",
        revision: 1,
      });
      expect(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM public."AuditEvent" WHERE "targetId"=$1 AND action=\'EXTERNAL_CONTACT_SAVED\'',
            [a.id],
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM public."OutboxEvent" WHERE "targetId"=$1 AND type=\'EXTERNAL_CONTACT_SAVED\'',
            [a.id],
          )
        ).rows[0].n,
      ).toBe(1);
    } finally {
      await db.end();
    }
  } finally {
    await employee.cleanup();
    await outsider.cleanup();
  }
});
