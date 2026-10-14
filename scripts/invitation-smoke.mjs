// Sends at most one invitation to the explicitly approved development test inbox.
import "reflect-metadata";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { parse } from "dotenv";
import { randomUUID } from "node:crypto";
import { Database } from "../apps/api/dist/database.js";
import { EmployeesService } from "../apps/api/dist/employees.js";
import { InvitationsService } from "../apps/api/dist/invitations.js";
import { SupabaseAuth } from "../apps/api/dist/supabase-auth.js";
import { Sessions } from "../apps/api/dist/sessions.js";
Object.assign(
  process.env,
  parse(readFileSync(".env")),
  parse(readFileSync(".env.supabase")),
);
const email = process.env.INVITATION_SMOKE_EMAIL?.toLowerCase();
if (
  process.env.SUPABASE_PROJECT_REF !== "llslubzdkdnvhbatmfug" ||
  process.env.LOCAL_DEVELOPMENT !== "true" ||
  !email ||
  !(process.env.INVITATION_TEST_RECIPIENTS ?? "").split(",").includes(email)
)
  throw Error("Use an explicitly approved inbox on the development project.");
const db = new Database(),
  auth = new SupabaseAuth(db),
  employees = new EmployeesService(db),
  invites = new InvitationsService(db, auth, new Sessions(db, auth));
try {
  const actor = await db.user.findUnique({
    where: { email: process.env.BOOTSTRAP_HR_EMAIL },
  });
  if (!actor?.active || actor.role !== "HR")
    throw Error("The approved HR bootstrap must be active.");
  let employee = await db.employee.findUnique({ where: { email } });
  if (
    employee &&
    (employee.fullName !== "Invitation smoke test" ||
      employee.department !== "Development QA")
  )
    throw Error(
      "The test email already has another employment record; no changes made.",
    );
  if (!employee) {
    const detail = await employees.create(actor.id, {
      fullName: "Invitation smoke test",
      email,
      jobTitle: "Test account",
      department: "Development QA",
      employmentType: "QA",
      startDate: "2026-10-14",
    });
    employee = await db.employee.findUniqueOrThrow({
      where: { id: detail.employee.id },
    });
  }
  if (
    !(await db.onboardingCase.findFirst({
      where: { employeeId: employee.id, status: "ACTIVE" },
    }))
  )
    await employees.openCase(actor.id, employee.id, {
      expectedRevision: employee.revision,
    });
  const file = ".local/qa/invitation-smoke.json";
  mkdirSync(".local/qa", { recursive: true });
  let request = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : {
        employeeId: employee.id,
        requestKey: randomUUID(),
        expectedRevision: employee.revision,
      };
  if (request.employeeId !== employee.id)
    throw Error(
      "Smoke test target changed; inspect the previous evidence first.",
    );
  writeFileSync(file, JSON.stringify(request, null, 2));
  const existing = await db.employeeInvitation.findUnique({
    where: {
      employeeId_requestKey: {
        employeeId: employee.id,
        requestKey: request.requestKey,
      },
    },
  });
  const invitation =
    existing ??
    (await invites.enqueue(actor.id, employee.id, {
      expectedRevision: request.expectedRevision,
      requestKey: request.requestKey,
    }));
  for (let n = 0; n < 20; n++) {
    const row = await db.employeeInvitation.findUniqueOrThrow({
      where: { id: invitation.id },
    });
    if (["SENT", "ACCEPTED"].includes(row.state)) {
      console.log(
        "Approved invitation email accepted by Supabase SMTP; awaiting the recipient's activation.",
      );
      break;
    }
    if (row.state !== "QUEUED")
      throw Error("Invitation delivery requires attention: " + row.state);
    await invites.deliverNext();
    if (n === 19)
      throw Error(
        "Invitation remains queued; no additional email was requested.",
      );
  }
} finally {
  await db.$disconnect();
}
