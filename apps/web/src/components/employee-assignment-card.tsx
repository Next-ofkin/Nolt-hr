"use client";
import type { components } from "@nolt/api-client/schema";
import { StatusChip } from "./status-chip";
import { Button } from "./ui/button";
import { Download, FileText } from "lucide-react";

export type EmployeeAssignment = NonNullable<
  components["schemas"]["EmployeeDetailDto"]["onboardingCase"]
>["assignments"][number];

export function EmployeeAssignmentCard({
  assignment,
  onReview,
  onExternalReview,
}: {
  assignment: EmployeeAssignment;
  onReview: (id: string) => void;
  onExternalReview: (id: string) => void;
}) {
  const external = assignment.recipient !== "EMPLOYEE";
  const submitted = !external && ["SUBMITTED", "APPROVED", "CHANGES_REQUIRED"].includes(assignment.status);
  const needsReview = ["SUBMITTED", "EXTERNAL_SUBMITTED"].includes(assignment.status);
  const statusLabel: Record<string, string> = {
    EXTERNAL_SUBMITTED: "Guarantor submitted — HR follow-up",
    SUBMITTED: "Submitted — review required",
    CHANGES_REQUIRED: "Changes requested",
    APPROVED: "Approved",
    DRAFT: "Draft saved",
  };
  return (
    <li className={`flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 sm:p-4 ${assignment.status === "APPROVED" ? "border-emerald-200 bg-emerald-50/50" : needsReview ? "border-indigo-200 bg-indigo-50/40" : "bg-white"}`}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border bg-white text-primary" aria-hidden="true">
          <FileText size={17} />
        </span>
        <div className="min-w-0 space-y-1.5">
          <p className="break-words text-sm font-semibold sm:text-base">{assignment.title}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="capitalize">{assignment.recipient.toLowerCase()}</span>
            <span aria-hidden="true">·</span>
            <span>{assignment.required ? "Required" : "Optional"}</span>
            {assignment.dueDate && <span>· Due {assignment.dueDate}</span>}
          </div>
          <StatusChip status={assignment.status} label={statusLabel[assignment.status]} />
        </div>
      </div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
        {external && ["EXTERNAL_SUBMITTED", "APPROVED", "CHANGES_REQUIRED"].includes(assignment.status) && (
          <Button type="button" size="sm" variant={assignment.status === "EXTERNAL_SUBMITTED" ? "default" : "outline"}
            onClick={() => onExternalReview(assignment.id)}>
            {assignment.status === "EXTERNAL_SUBMITTED" ? "Review external evidence" : "View external evidence"}
          </Button>
        )}
        {submitted && (
          <>
            <Button type="button" size="sm" variant={assignment.status === "SUBMITTED" ? "default" : "outline"}
              onClick={() => onReview(assignment.id)}>
              {assignment.status === "SUBMITTED" ? "Review submission" : "View submission"}
            </Button>
            <a href={`/api/v1/exports/forms/${assignment.id}.pdf`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border bg-white px-3 py-1 text-xs font-medium hover:bg-muted"
              download>
              <Download size={14} aria-hidden="true" /> Download PDF
            </a>
          </>
        )}
      </div>
    </li>
  );
}
