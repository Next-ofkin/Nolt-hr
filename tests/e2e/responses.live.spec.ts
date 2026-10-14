import { randomUUID } from "node:crypto";
import { createField } from "@nolt/form-schemas";
import { test, expect, signIn } from "../support/browser-auth.js";
import { account, Browser, owner } from "../support/real-auth.js";
import { Client } from "pg";

test("employee saves, reopens and submits exact assigned answers; access and evidence remain protected", async ({
  page,
  realUser,
}) => {
  test.setTimeout(420000);
  const employee = await account(),
    outsider = await account();
  try {
    const hr = await new Browser().verified(realUser);
    const hrCsrf = (await (await hr.request("/auth/session")).json()).csrfToken;
    const fields = [
      {
        ...createField("text", randomUUID()),
        label: "Legal name",
        required: true,
      },
      {
        ...createField("email", randomUUID()),
        label: "Contact email",
        required: true,
      },
      { ...createField("number", randomUUID()), label: "Reference number" },
      { ...createField("select", randomUUID()), label: "Preferred option" },
      {
        ...createField("checkbox", randomUUID()),
        label: "Confirm accuracy",
        required: true,
      },
    ];
    async function published(recipient: string, questions = fields) {
      let r = await hr.post(
        "/forms",
        { title: `Response QA ${randomUUID()}`, recipient },
        hrCsrf,
      );
      expect(r.status).toBe(201);
      let f = await r.json();
      r = await hr.request(`/form-versions/${f.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-csrf-token": hrCsrf },
        body: JSON.stringify({
          expectedRevision: f.revision,
          content: { title: f.title, recipient, fields: questions },
        }),
      });
      expect(r.status).toBe(200);
      f = await r.json();
      r = await hr.post(
        `/form-versions/${f.id}/publish`,
        { expectedRevision: f.revision },
        hrCsrf,
      );
      expect(r.status).toBe(201);
      return r.json();
    }
    const form = await published("EMPLOYEE"),
      third = await published("GUARANTOR"),
      signed = await published("EMPLOYEE", [
        {
          ...createField("signature", randomUUID()),
          required: true,
          label: "Required signature",
        },
      ]);
    let r = await hr.post(
      "/employees",
      {
        fullName: "Response QA",
        email: employee.email,
        jobTitle: "QA tester",
        department: "Development QA",
        employmentType: "QA",
        startDate: "2026-10-14",
      },
      hrCsrf,
    );
    expect(r.status).toBe(201);
    const profile = await r.json();
    r = await hr.post(
      `/employees/${profile.employee.id}/onboarding-cases`,
      { expectedRevision: 1 },
      hrCsrf,
    );
    expect(r.status).toBe(201);
    let c = (await r.json()).onboardingCase;
    for (const f of [form, third, signed]) {
      r = await hr.post(
        `/onboarding-cases/${c.id}/assignments`,
        { expectedRevision: c.revision, formVersionId: f.id, required: true },
        hrCsrf,
      );
      expect(r.status).toBe(201);
      c = await r.json();
    }
    const a = c.assignments.find(
        (v: { formVersionId: string }) => v.formVersionId === form.id,
      ),
      external = c.assignments.find(
        (v: { formVersionId: string }) => v.formVersionId === third.id,
      ),
      signature = c.assignments.find(
        (v: { formVersionId: string }) => v.formVersionId === signed.id,
      );
    // Editing the source form cannot change the employee's assigned definition.
    r = await hr.post(`/forms/${form.formId}/versions`, {}, hrCsrf);
    expect(r.status).toBe(201);
    const next = await r.json();
    r = await hr.request(`/form-versions/${next.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-csrf-token": hrCsrf },
      body: JSON.stringify({
        expectedRevision: next.revision,
        content: {
          title: "New definition",
          recipient: "EMPLOYEE",
          fields: [
            {
              ...createField("text", randomUUID()),
              label: "Different question",
              required: true,
            },
          ],
        },
      }),
    });
    expect(r.status).toBe(200);
    await signIn(page, employee, "My onboarding");
    const csrf = (await (await page.request.get("/api/v1/auth/session")).json())
        .csrfToken,
      headers = { "x-csrf-token": csrf, Origin: "http://127.0.0.1:3000" };
    const path = `/api/v1/me/assignments/${a.id}/response`;
    expect(
      (
        await page.request.post(path + "/submit", {
          headers,
          data: { expectedRevision: 0, requestKey: randomUUID() },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.put(path, {
          headers,
          data: { expectedRevision: 0, answers: { [randomUUID()]: "unknown" } },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.put(path, {
          headers,
          data: { expectedRevision: 0, answers: {}, actorId: outsider.id },
        })
      ).status(),
    ).toBe(400);
    const competing = await Promise.all(
      [1, 2].map(() =>
        page.request.put(path, {
          headers,
          data: {
            expectedRevision: 0,
            answers: { [fields[0].id]: "Incomplete draft" },
          },
        }),
      ),
    );
    expect(competing.map((v) => v.status()).sort()).toEqual([200, 409]);
    const card = page.getByRole("listitem").filter({
      has: page.getByRole("heading", {
        name: `${form.title} · v1`,
        exact: true,
      }),
    });
    await card
      .getByRole("button", { name: /^(Fill form|Continue form)$/ })
      .click();
    await expect(page.getByLabel("Legal name", { exact: false })).toHaveValue(
      "Incomplete draft",
    );
    await page.getByLabel("Contact email", { exact: false }).fill("unfinished");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(
      page.getByText("Draft saved. You can return and continue later.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close form", exact: true }).click();
    await page.reload();
    await card
      .getByRole("button", { name: "Continue form", exact: true })
      .click();
    await expect(
      page.getByLabel("Contact email", { exact: false }),
    ).toHaveValue("unfinished");
    await page
      .getByRole("button", { name: "Submit form", exact: true })
      .click();
    await expect(
      page.getByText("Complete the highlighted questions before submitting.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Enter a valid email address.", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Legal name", { exact: false }).fill("QA Employee");
    await page
      .getByLabel("Contact email", { exact: false })
      .fill(employee.email);
    await page
      .getByLabel("Reference number", { exact: true })
      .fill("12345678901234567890.123456789");
    await page
      .getByLabel("Preferred option", { exact: true })
      .selectOption("Option 2");
    await page.getByLabel("Confirm accuracy", { exact: false }).check();
    for (const width of [320, 375, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 375, height: 900 });
    await page.screenshot({
      path: ".local/qa/employee-response-mobile.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(
      page.getByText("Draft saved. You can return and continue later.", {
        exact: true,
      }),
    ).toBeVisible();
    const completing = page.waitForRequest(
      (r) => r.url().endsWith(path + "/submit") && r.method() === "POST",
    );
    await page
      .getByRole("button", { name: "Submit form", exact: true })
      .click();
    const submissionRequest = (await completing).postDataJSON();
    await expect(
      page.getByRole("heading", { name: "Submission history", exact: true }),
    ).toBeVisible();
    const submitted = await (await page.request.get(path)).json();
    // Retrying the exact committed UI request must preserve its one immutable snapshot.
    const replay = await page.request.post(path + "/submit", {
      headers,
      data: submissionRequest,
    });
    expect(replay.status()).toBe(201);
    expect((await replay.json()).submissions[0].id).toBe(
      submitted.submissions[0].id,
    );
    expect(
      (
        await page.request.put(path, {
          headers,
          data: { expectedRevision: submitted.revision, answers: {} },
        })
      ).status(),
    ).toBe(409);
    await page.reload();
    await card
      .getByRole("button", { name: "View submitted form", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Submission history", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Legal name", { exact: false }),
    ).toBeDisabled();
    await expect(page.getByLabel("Legal name", { exact: false })).toHaveValue(
      "QA Employee",
    );
    await page.screenshot({
      path: ".local/qa/employee-response-submitted-mobile.png",
      fullPage: true,
    });
    expect(submitted.form.id).toBe(form.id);
    expect(submitted.submissions[0].answers[fields[2].id]).toBe(
      "12345678901234567890.123456789",
    );
    for (const method of ["get", "put", "post"] as const) {
      const target = `/api/v1/me/assignments/${external.id}/response${method === "post" ? "/submit" : ""}`;
      const result = await page.request[method](target, {
        headers,
        ...(method === "put"
          ? { data: { expectedRevision: 0, answers: {} } }
          : method === "post"
            ? { data: { expectedRevision: 0, requestKey: randomUUID() } }
            : {}),
      });
      expect(result.status()).toBe(403);
    }
    expect(
      (
        await page.request.post(
          `/api/v1/me/assignments/${signature.id}/response/submit`,
          { headers, data: { expectedRevision: 0, requestKey: randomUUID() } },
        )
      ).status(),
    ).toBe(400);
    const other = await new Browser().verified(outsider),
      otherCsrf = (await (await other.request("/auth/session")).json())
        .csrfToken;
    expect(
      (await other.request(`/me/assignments/${a.id}/response`)).status,
    ).toBe(404);
    expect(
      (
        await other.post(
          `/me/assignments/${a.id}/response/submit`,
          { expectedRevision: 0, requestKey: randomUUID() },
          otherCsrf,
        )
      ).status,
    ).toBe(404);
    const db = await owner(),
      runtime = new Client({ connectionString: process.env.DATABASE_URL });
    try {
      await runtime.connect();
      await expect(
        runtime.query(
          "UPDATE public.\"FormSubmission\" SET answers='{}' WHERE id=$1",
          [submitted.submissions[0].id],
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.query(
          "UPDATE public.\"FormSubmission\" SET answers='{}' WHERE id=$1",
          [submitted.submissions[0].id],
        ),
      ).rejects.toThrow(/immutable/);
      const evidence = await db.query(
        'SELECT count(*)::int AS n FROM public."AuditEvent" WHERE "targetId"=$1 AND action=\'RESPONSE_SUBMITTED\'',
        [submitted.submissions[0].id],
      );
      expect(evidence.rows[0].n).toBe(1);
      const outbox = await db.query(
        'SELECT count(*)::int AS n FROM public."OutboxEvent" WHERE "targetId"=$1 AND type=\'RESPONSE_SUBMITTED\'',
        [submitted.submissions[0].id],
      );
      expect(outbox.rows[0].n).toBe(1);
      for (const table of ["EmployeeResponse", "FormSubmission"]) {
        const denied = await fetch(
          `${process.env.SUPABASE_URL}/rest/v1/${table}?select=*`,
          { headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY! } },
        );
        expect([401, 403]).toContain(denied.status);
      }
      await db.query(
        "UPDATE public.\"OnboardingCase\" SET status='CLOSED' WHERE id=$1",
        [c.id],
      );
      expect(
        (
          await page.request.put(
            `/api/v1/me/assignments/${signature.id}/response`,
            { headers, data: { expectedRevision: 0, answers: {} } },
          )
        ).status(),
      ).toBe(409);
    } finally {
      await runtime.end();
      await db.end();
    }
  } finally {
    await employee.cleanup();
    await outsider.cleanup();
  }
});
