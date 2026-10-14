import { randomUUID } from "node:crypto";
import { createField } from "@nolt/form-schemas";
import { test, expect, signIn } from "../support/browser-auth.js";
import { account, Browser, owner } from "../support/real-auth.js";

test("real HR creates a case and assigns fixed versions; employee has only their own responsive checklist", async ({
  page,
  realUser,
  browser,
}) => {
  test.setTimeout(360000);
  const email = `qa-${randomUUID()}@example.com`,
    name = `Onboarding QA ${randomUUID()}`;
  let employee: Awaited<ReturnType<typeof account>> | undefined;
  let outsider: Awaited<ReturnType<typeof account>> | undefined;
  const employeeContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3000",
  });
  try {
    await signIn(page, realUser);
    const session = await (
      await page.request.get("/api/v1/auth/session")
    ).json();
    const headers = {
      "x-csrf-token": session.csrfToken,
      Origin: "http://127.0.0.1:3000",
    };
    async function publish(recipient: string) {
      const title = `${recipient} ${randomUUID()}`;
      let r = await page.request.post("/api/v1/forms", {
        headers,
        data: { title, recipient },
      });
      expect(r.status()).toBe(201);
      let form = await r.json();
      r = await page.request.put(`/api/v1/form-versions/${form.id}`, {
        headers,
        data: {
          expectedRevision: form.revision,
          content: {
            title,
            description: "Onboarding acceptance",
            recipient,
            fields: [
              {
                ...createField("text", randomUUID()),
                label: "Legal name",
                required: true,
              },
            ],
          },
        },
      });
      expect(r.status()).toBe(200);
      form = await r.json();
      r = await page.request.post(`/api/v1/form-versions/${form.id}/publish`, {
        headers,
        data: { expectedRevision: form.revision },
      });
      expect(r.status()).toBe(201);
      return r.json();
    }
    const ownForm = await publish("EMPLOYEE"),
      thirdForm = await publish("GUARANTOR");
    const draftResponse = await page.request.post(
      `/api/v1/forms/${ownForm.formId}/versions`,
      { headers },
    );
    expect(draftResponse.status()).toBe(201);
    const draft = await draftResponse.json();
    await page.goto("/employees");
    await page
      .getByRole("button", { name: "New employee", exact: true })
      .click();
    await page.getByLabel("Full name", { exact: true }).fill(name);
    await page.getByLabel("Work email", { exact: true }).fill(email);
    await page.getByLabel("Job title", { exact: true }).fill("Analyst");
    await page.locator("#profile-department").fill("QA Finance");
    await page.locator("#profile-employmentType").fill("Permanent");
    await page.getByLabel("Start date", { exact: true }).fill("2026-10-14");
    await page
      .getByRole("button", { name: "Save employee", exact: true })
      .click();
    await expect(
      page.getByText("Employee record saved.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Awaiting verified account", { exact: true }),
    ).toBeVisible();
    employee = await account("EMPLOYEE", email);
    // Refresh by selecting the persisted record: the actual Auth insert trigger must have linked it.
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await expect(
      page.getByText("Verified account linked", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Edit employment details", exact: true })
      .click();
    await page.getByLabel("Job title", { exact: true }).fill("Senior analyst");
    await page
      .getByRole("button", { name: "Save employee", exact: true })
      .click();
    await expect(
      page.getByText("QA Finance · Senior analyst", { exact: true }).last(),
    ).toBeVisible();
    const opening = page.waitForResponse(
      (r) =>
        r.url().endsWith("/onboarding-cases") &&
        r.request().method() === "POST",
      { timeout: 60000 },
    );
    await page
      .getByRole("button", { name: "Open onboarding case", exact: true })
      .click();
    expect((await opening).status()).toBe(201);
    await expect(
      page.getByText("Onboarding case opened.", { exact: true }),
    ).toBeVisible();
    for (const form of [ownForm, thirdForm]) {
      await page
        .getByLabel("Published form title", { exact: true })
        .fill(form.title);
      await page
        .getByRole("button", { name: "Find forms", exact: true })
        .click();
      await expect(
        page.locator(`#published-version option[value="${form.id}"]`),
      ).toHaveCount(1);
      await page
        .getByLabel("Exact published version", { exact: true })
        .selectOption(form.id);
      if (form.id === thirdForm.id)
        await page.getByLabel("Required item", { exact: true }).uncheck();
      await page
        .getByRole("button", { name: "Assign published form", exact: true })
        .click();
      await expect(
        page.getByText(
          "Published version assigned. Future form edits will not change it.",
          { exact: true },
        ),
      ).toBeVisible();
    }
    const record = await (
      await page.request.get(`/api/v1/employees?q=${encodeURIComponent(email)}`)
    ).json();
    expect(record.items).toHaveLength(1);
    const detail = await (
        await page.request.get(`/api/v1/employees/${record.items[0].id}`)
      ).json(),
      c = detail.onboardingCase;
    const own = c.assignments.find((a: any) => a.recipient === "EMPLOYEE"),
      third = c.assignments.find((a: any) => a.recipient === "GUARANTOR");
    expect(own.formVersionId).toBe(ownForm.id);
    expect(own.version).toBe(1);
    const employment = {
      fullName: name,
      jobTitle: "Senior analyst",
      department: "QA Finance",
      employmentType: "Permanent",
      startDate: "2026-10-14",
      employeeNumber: null,
    };
    const concurrent = await Promise.all(
      [1, 2].map(() =>
        page.request.put(`/api/v1/employees/${record.items[0].id}`, {
          headers,
          data: {
            expectedRevision: record.items[0].revision,
            profile: employment,
          },
        }),
      ),
    );
    expect(concurrent.map((r) => r.status()).sort()).toEqual([200, 409]);
    expect(
      (
        await page.request.post(
          `/api/v1/onboarding-cases/${c.id}/assignments`,
          {
            headers,
            data: {
              expectedRevision: c.revision,
              formVersionId: draft.id,
              required: true,
            },
          },
        )
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.post(
          `/api/v1/employees/${record.items[0].id}/onboarding-cases`,
          { headers, data: { expectedRevision: record.items[0].revision + 1 } },
        )
      ).status(),
    ).toBe(409);
    for (const width of [320, 375, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 375)
        await page.screenshot({
          path: ".local/qa/employee-directory-mobile.png",
          fullPage: true,
        });
    }
    const employeePage = await employeeContext.newPage();
    await signIn(employeePage, employee, "My onboarding");
    await expect(
      employeePage.getByText("1 required items · 1 optional items", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      employeePage.getByRole("link", { name: "Employees", exact: true }),
    ).toHaveCount(0);
    await expect(
      employeePage.getByText(/Your guarantor must complete and sign/),
    ).toBeVisible();
    await employeePage
      .getByRole("button", { name: "Preview assigned form", exact: true })
      .click();
    await expect(
      employeePage.getByLabel("Legal name", { exact: false }),
    ).toBeDisabled();
    expect(
      (
        await employeePage.request.get(`/api/v1/me/assignments/${third.id}`)
      ).status(),
    ).toBe(403);
    expect((await employeePage.request.get("/api/v1/employees")).status()).toBe(
      403,
    );
    expect(
      (
        await employeePage.request.get(
          `/api/v1/employees/${record.items[0].id}`,
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await employeePage.request.get(`/api/v1/form-versions/${ownForm.id}`)
      ).status(),
    ).toBe(403);
    for (const width of [320, 375, 768, 1024, 1440, 1920]) {
      await employeePage.setViewportSize({ width, height: 900 });
      expect(
        await employeePage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 375)
        await employeePage.screenshot({
          path: ".local/qa/employee-checklist-mobile.png",
          fullPage: true,
        });
    }
    outsider = await account();
    const otherBrowser = await new Browser().verified(outsider);
    expect(
      (await otherBrowser.request(`/me/assignments/${own.id}`)).status,
    ).toBe(404);
    const otherHome = await (
      await otherBrowser.request("/me/onboarding")
    ).json();
    expect(otherHome.employee).toBeNull();
    const db = await owner();
    try {
      const evidence = await db.query(
        'SELECT action FROM public."AuditEvent" WHERE "targetId"=ANY($1::uuid[])',
        [[record.items[0].id, c.id, own.id, third.id]],
      );
      expect(evidence.rows.map((r) => r.action)).toEqual(
        expect.arrayContaining([
          "EMPLOYEE_CREATED",
          "EMPLOYEE_UPDATED",
          "EMPLOYEE_ACCOUNT_LINKED",
          "ONBOARDING_CASE_OPENED",
          "FORM_ASSIGNED",
        ]),
      );
      const outbox = await db.query(
        'SELECT count(*)::int AS n FROM public."OutboxEvent" WHERE "targetId"=ANY($1::uuid[])',
        [[record.items[0].id, c.id, own.id, third.id]],
      );
      expect(outbox.rows[0].n).toBe(7);
      await expect(
        db.query(
          'UPDATE public."FormAssignment" SET required=false WHERE id=$1',
          [own.id],
        ),
      ).rejects.toThrow(/immutable/);
    } finally {
      await db.end();
    }
  } finally {
    await employeeContext.close();
    await outsider?.cleanup();
    await employee?.cleanup();
  }
});
