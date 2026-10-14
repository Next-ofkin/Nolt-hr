import { randomUUID } from "node:crypto";
import { createField } from "@nolt/form-schemas";
import { test, expect, signIn } from "../support/browser-auth.js";
import { account, Browser, owner } from "../support/real-auth.js";

test("HR reviews submission, requests changes with reason, employee resubmits and HR approves", async ({
  page,
  realUser,
  browser,
}) => {
  test.setTimeout(600000);
  const employee = await account();
  let outsideHr: Awaited<ReturnType<typeof account>> | undefined;
  const hrContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3000",
  });
  try {
    const hr = await new Browser().verified(realUser);
    const hrCsrf = (await (await hr.request("/auth/session")).json()).csrfToken;

    // 1. HR publishes a form
    const fieldId = randomUUID();
    const fields = [
      {
        ...createField("text", fieldId),
        label: "Official full name",
        required: true,
      },
    ];
    let r = await hr.post(
      "/forms",
      { title: `Review QA ${randomUUID()}`, recipient: "EMPLOYEE" },
      hrCsrf,
    );
    expect(r.status).toBe(201);
    let f = await r.json();

    r = await hr.request(`/form-versions/${f.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-csrf-token": hrCsrf },
      body: JSON.stringify({
        expectedRevision: f.revision,
        content: { title: f.title, recipient: "EMPLOYEE", fields },
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
    const publishedForm = await r.json();

    // 2. HR creates employee profile and opens case
    r = await hr.post(
      "/employees",
      {
        fullName: "Review Candidate",
        email: employee.email,
        jobTitle: "Associate",
        department: "HR Operations",
        employmentType: "Permanent",
        startDate: "2026-10-14",
      },
      hrCsrf,
    );
    expect(r.status).toBe(201);
    const empProfile = await r.json();

    r = await hr.post(
      `/employees/${empProfile.employee.id}/onboarding-cases`,
      { expectedRevision: 1 },
      hrCsrf,
    );
    expect(r.status).toBe(201);
    const onboardingCase = (await r.json()).onboardingCase;

    // 3. HR assigns published form
    r = await hr.post(
      `/onboarding-cases/${onboardingCase.id}/assignments`,
      {
        expectedRevision: onboardingCase.revision,
        formVersionId: publishedForm.id,
        required: true,
      },
      hrCsrf,
    );
    expect(r.status).toBe(201);
    const assignedCase = await r.json();
    const assignment = assignedCase.assignments[0];

    // 4. Employee logs in, fills initial answers and submits (Version 1)
    await signIn(page, employee, "My onboarding");
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "My onboarding" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Fill form" }).click();

    // Fill answers and submit v1
    const textInput = page.getByLabel("Official full name", { exact: false });
    await textInput.fill("Initial Name");
    await page.getByRole("button", { name: "Submit form" }).click();
    await expect(
      page.getByText("Form submitted. Your answers are locked"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close form" }).click();

    // Checklist reflects submitted state
    await expect(
      page.getByText("Submitted — awaiting HR review"),
    ).toBeVisible();

    // No unclassified assignment is readable, even by the case owner.
    expect(
      (await hr.request(`/assignments/${assignment.id}/review`)).status,
    ).toBe(404);
    // Transfer an actual MFA-authenticated opaque test session to a separate browser context.
    await hrContext.addCookies(
      [...hr.cookies].map(([name, value]) => ({
        name,
        value,
        url: "http://127.0.0.1:3000",
        httpOnly: true,
        sameSite: "Lax" as const,
      })),
    );
    const hrPage = await hrContext.newPage();
    await hrPage.goto("/employees");
    await hrPage
      .getByLabel("Name, email or employee number")
      .fill(employee.email);
    await hrPage
      .getByRole("button", { name: "Search employees", exact: true })
      .click();
    await hrPage.getByRole("button", { name: /Review Candidate/ }).click();
    await hrPage
      .getByRole("button", { name: "Review submission", exact: true })
      .click();
    const dialog = hrPage.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", {
        name: "Assign review access",
        exact: true,
      }),
    ).toBeVisible();
    await dialog.getByLabel("Reviewer email").fill(realUser.email);
    await dialog.getByLabel("Form sensitivity").selectOption("GENERAL");
    await dialog
      .getByRole("button", { name: "Save review access", exact: true })
      .click();
    await expect(
      dialog.getByText("Initial Name", { exact: true }),
    ).toBeVisible();
    // 5. HR inspects review details and requests changes through the actual dialog.
    const reviewRes = await hr.request(`/assignments/${assignment.id}/review`);
    expect(reviewRes.status).toBe(200);
    const reviewInfo = await reviewRes.json();
    expect(reviewInfo.status).toBe("SUBMITTED");
    expect(reviewInfo.submissions.length).toBe(1);
    const sub1 = reviewInfo.submissions[0];
    expect(sub1.version).toBe(1);

    // HR requests changes
    const changeReason = "Please provide your full middle name as well.";
    const invalid = await hr.post(
      `/submissions/${sub1.id}/decisions`,
      {
        decision: "CHANGES_REQUIRED",
        reason: " ",
        expectedSubmissionVersion: 1,
        expectedResponseRevision: reviewInfo.revision,
      },
      hrCsrf,
    );
    expect(invalid.status).toBe(400);
    await dialog
      .getByRole("button", { name: "Request changes", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", {
        name: "Send change request to employee",
        exact: true,
      }),
    ).toBeDisabled();
    await dialog
      .getByLabel("Reason for requested changes", { exact: false })
      .fill(changeReason);
    await dialog
      .getByRole("button", {
        name: "Send change request to employee",
        exact: true,
      })
      .click();
    await expect(
      dialog.getByText(
        "Changes requested. The employee can now edit and resubmit their form.",
        { exact: true },
      ),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Close review", exact: true })
      .click();

    // 6. Employee reloads and sees the changes required banner with HR's reason
    await page.reload();
    await expect(
      page.getByText("Changes requested — action required"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Update & resubmit" }).click();

    // Alert banner shows HR's exact reason
    await expect(page.getByRole("alert").getByText(changeReason)).toBeVisible();

    // Inputs are unlocked; employee updates answers and resubmits
    await textInput.fill("Initial Middle Name");
    await page.getByRole("button", { name: "Resubmit for review" }).click();
    await expect(page.getByText("Corrections resubmitted")).toBeVisible();
    await page.getByRole("button", { name: "Close form" }).click();

    // 7. HR inspects updated review details (now has 2 submissions)
    const review2Res = await hr.request(`/assignments/${assignment.id}/review`);
    expect(review2Res.status).toBe(200);
    const review2Info = await review2Res.json();
    expect(review2Info.status).toBe("SUBMITTED");
    expect(review2Info.submissions.length).toBe(2);
    const sub2 = review2Info.submissions[0];
    expect(sub2.version).toBe(2);
    expect(sub2.answers[fieldId]).toBe("Initial Middle Name");

    // Prior version 1 submission is preserved with its review reason
    const historicalSub1 = review2Info.submissions[1];
    expect(historicalSub1.version).toBe(1);
    expect(historicalSub1.review?.decision).toBe("CHANGES_REQUIRED");
    expect(historicalSub1.review?.reason).toBe(changeReason);

    // HR approves submission version 2
    await hrPage
      .getByRole("button", { name: "View submission", exact: true })
      .click();
    // Reload the dialog to select the latest resubmission rather than its historical version.
    await expect(
      dialog.getByRole("button", {
        name: "Version 2 (Latest) · Pending",
        exact: true,
      }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Version 1 · Changes Req.", exact: true })
      .click();
    await expect(
      dialog.getByText("Initial Name", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Approve submission", exact: true }),
    ).toHaveCount(0);
    await dialog
      .getByRole("button", {
        name: "Version 2 (Latest) · Pending",
        exact: true,
      })
      .click();
    await expect(
      dialog.getByText("Initial Middle Name", { exact: true }),
    ).toBeVisible();
    for (const width of [320, 375, 768, 1024, 1440, 1920]) {
      await hrPage.setViewportSize({ width, height: 900 });
      expect(
        await hrPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
        true,
      );
    }
    await hrPage.setViewportSize({ width: 375, height: 900 });
    await hrPage.screenshot({
      path: ".local/qa/hr-review-mobile.png",
      fullPage: true,
    });
    await dialog
      .getByRole("button", { name: "Approve submission", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Yes, approve submission", exact: true })
      .click();
    await expect(
      dialog.getByText(
        "Submission approved. The form answers are permanently locked.",
        { exact: true },
      ),
    ).toBeVisible();
    const duplicate = await hr.post(
      `/submissions/${sub2.id}/decisions`,
      {
        decision: "APPROVED",
        expectedSubmissionVersion: 2,
        expectedResponseRevision: review2Info.revision,
      },
      hrCsrf,
    );
    expect(duplicate.status).toBe(409);
    const approvedInfo = await (
      await hr.request(`/assignments/${assignment.id}/review`)
    ).json();
    expect(approvedInfo.status).toBe("APPROVED");

    // 8. Employee verifies approved state
    await page.reload();
    await expect(page.getByText("Approved").first()).toBeVisible();
    await page.getByRole("button", { name: "View approved form" }).click();
    await expect(page.getByText("Submission approved")).toBeVisible();
    // Form is locked (no submit or draft buttons visible)
    await expect(
      page.getByRole("button", { name: "Submit form" }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Resubmit for review" }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save draft" }),
    ).not.toBeVisible();
    const employeeSession = await (
      await page.request.get("/api/v1/auth/session")
    ).json();
    expect(
      (
        await page.request.get(`/api/v1/assignments/${assignment.id}/review`)
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post(`/api/v1/submissions/${sub2.id}/decisions`, {
          headers: {
            "x-csrf-token": employeeSession.csrfToken,
            Origin: "http://127.0.0.1:3000",
          },
          data: {
            decision: "APPROVED",
            expectedSubmissionVersion: 2,
            expectedResponseRevision: approvedInfo.revision,
          },
        })
      ).status(),
    ).toBe(403);
    outsideHr = await account("HR");
    const outsideBrowser = await new Browser().verified(outsideHr),
      outsideCsrf = (
        await (await outsideBrowser.request("/auth/session")).json()
      ).csrfToken;
    expect(
      (await outsideBrowser.request(`/assignments/${assignment.id}/review`))
        .status,
    ).toBe(404);
    expect(
      (
        await outsideBrowser.post(
          `/assignments/${assignment.id}/review-access`,
          { reviewerEmail: outsideHr.email, sensitivity: "GENERAL" },
          outsideCsrf,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await outsideBrowser.post(
          `/submissions/${sub2.id}/decisions`,
          {
            decision: "APPROVED",
            expectedSubmissionVersion: 2,
            expectedResponseRevision: approvedInfo.revision,
          },
          outsideCsrf,
        )
      ).status,
    ).toBe(404);
    const db = await owner();
    try {
      const evidence = await db.query(
        'SELECT count(*)::int n FROM public."SubmissionReview" WHERE "submissionId"=ANY($1::uuid[])',
        [[sub1.id, sub2.id]],
      );
      expect(evidence.rows[0].n).toBe(2);
      for (const table of ["SubmissionReview", "AssignmentReviewAccess"]) {
        const r = await fetch(
          `${process.env.SUPABASE_URL}/rest/v1/${table}?select=*`,
          { headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY! } },
        );
        expect([401, 403]).toContain(r.status);
      }
    } finally {
      await db.end();
    }
  } finally {
    await hrContext.close();
    await outsideHr?.cleanup();
    await employee.cleanup();
  }
});
