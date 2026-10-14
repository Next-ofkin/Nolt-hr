import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createField } from "@nolt/form-schemas";
import { test, expect, signIn } from "../support/browser-auth.js";
import { account, Browser, owner } from "../support/real-auth.js";

test("real employee uploads, signs saved answers and submits private evidence", async ({
  page,
  realUser,
}) => {
  test.setTimeout(600000);
  const employee = await account(),
    outsider = await account();
  try {
    const hr = await new Browser().verified(realUser);
    const csrf = (await (await hr.request("/auth/session")).json()).csrfToken;
    const text = {
      ...createField("text", randomUUID()),
      label: "Upload QA name",
      required: true,
    };
    const file = {
      ...createField("file", randomUUID()),
      label: "Supporting evidence",
      required: true,
    };
    const signature = {
      ...createField("signature", randomUUID()),
      label: "Employee signature",
      required: true,
    };
    let r = await hr.post(
      "/forms",
      { title: `Upload QA ${randomUUID()}`, recipient: "EMPLOYEE" },
      csrf,
    );
    expect(r.status).toBe(201);
    let form = await r.json();
    r = await hr.request(`/form-versions/${form.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({
        expectedRevision: form.revision,
        content: {
          title: form.title,
          recipient: "EMPLOYEE",
          fields: [text, file, signature],
        },
      }),
    });
    expect(r.status).toBe(200);
    form = await r.json();
    r = await hr.post(
      `/form-versions/${form.id}/publish`,
      { expectedRevision: form.revision },
      csrf,
    );
    expect(r.status).toBe(201);
    form = await r.json();
    r = await hr.post(
      "/employees",
      {
        fullName: "Upload QA",
        email: employee.email,
        jobTitle: "QA",
        department: "Development QA",
        employmentType: "QA",
        startDate: "2026-10-14",
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
    let c = (await r.json()).onboardingCase;
    r = await hr.post(
      `/onboarding-cases/${c.id}/assignments`,
      { expectedRevision: c.revision, formVersionId: form.id, required: true },
      csrf,
    );
    expect(r.status).toBe(201);
    c = await r.json();
    const assignment = c.assignments[0];
    await signIn(page, employee, "My onboarding");
    await page.getByRole("button", { name: "Fill form", exact: true }).click();
    await page
      .getByLabel("Upload QA name", { exact: false })
      .fill("Saved before signing");
    const png = await sharp({
      create: { width: 80, height: 40, channels: 4, background: "navy" },
    })
      .png()
      .toBuffer();
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: "evidence.png",
        mimeType: "image/png",
        buffer: png,
      });
    await expect(page.getByText("evidence.png", { exact: true })).toBeVisible();
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + 20, box!.y + 50);
    await page.mouse.down();
    await page.mouse.move(box!.x + 100, box!.y + 80, { steps: 12 });
    await page.mouse.move(box!.x + 170, box!.y + 30, { steps: 12 });
    await page.mouse.up();
    await page
      .getByRole("checkbox", { name: /I confirm that I am providing/ })
      .check();
    await page
      .getByRole("button", { name: "Confirm & Apply Signature", exact: true })
      .click();
    await expect(
      page.getByText("Signature recorded and cryptographically bound", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Submit form", exact: true }),
    ).toBeEnabled();
    for (const width of [320, 375, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    }
    await page
      .getByRole("button", { name: "Submit form", exact: true })
      .click();
    await expect(
      page.getByText(
        "Form submitted. Your answers are locked; HR review follows separately.",
        { exact: true },
      ),
    ).toBeVisible();
    const db = await owner();
    try {
      const files = (
        await db.query(
          'SELECT id, bucket, "storageKey", "scanStatus", status FROM public."StoredFile" WHERE "assignmentId"=$1',
          [assignment.id],
        )
      ).rows;
      expect(files).toHaveLength(2);
      expect(
        files.every(
          (f) => f.status === "CONFIRMED" && f.scanStatus === "CLEAN",
        ),
      ).toBe(true);
      const submission = (
        await db.query(
          'SELECT answers FROM public."FormSubmission" WHERE "assignmentId"=$1',
          [assignment.id],
        )
      ).rows[0];
      expect(submission.answers[text.id]).toBe("Saved before signing");
      const downloaded = await page.request.get(
        `/api/v1/files/${submission.answers[file.id]}/download`,
      );
      expect(downloaded.status()).toBe(200);
      expect(downloaded.headers()["content-disposition"]).toMatch(
        /^attachment;/,
      );
      const stranger = await new Browser().verified(outsider);
      expect(
        (
          await stranger.request(
            `/files/${submission.answers[file.id]}/download`,
          )
        ).status,
      ).toBe(403);
      const publicLink = `${process.env.SUPABASE_URL}/storage/v1/object/public/${files[0].bucket}/${files[0].storageKey}`;
      expect((await fetch(publicLink)).ok).toBe(false);
    } finally {
      await db.end();
    }
  } finally {
    await employee.cleanup();
    await outsider.cleanup();
  }
});
