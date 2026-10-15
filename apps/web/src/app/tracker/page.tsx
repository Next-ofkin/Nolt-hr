import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CheckCircle2, Circle } from "lucide-react";
import { WorkspaceShell } from "@/components/workspace-shell";
import trackerSnapshot from "../../../.generated/tracker.json";
export const dynamic = "force-dynamic";
export default async function TrackerPage() {
  const markdown =
    process.env.NODE_ENV === "production"
      ? trackerSnapshot
      : await readFile(resolve(process.cwd(), "../../docs/TRACKER.md"), "utf8");
  const lines = markdown.split("\n");
  const tasks = lines.filter((line) => /^- \[[ x]\]/.test(line));
  const done = tasks.filter((line) => line.startsWith("- [x]")).length;
  return (
    <WorkspaceShell active="tracker">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-semibold tracking-widest text-primary">
          PROJECT DELIVERY
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          One checklist. Visible progress.
        </h1>
        <p className="mt-3 text-muted-foreground">
          Completed items are backed by implementation and verification. This
          view reads the project tracker.
        </p>
        <div className="my-7 rounded-xl border bg-white p-5">
          <p className="text-sm font-medium">
            {done} of {tasks.length} tasks verified
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(done / tasks.length) * 100}%` }}
            />
          </div>
        </div>
        {lines.map((line, index) =>
          line.startsWith("## ") ? (
            <h2 key={index} className="mb-3 mt-8 text-lg font-semibold">
              {line.slice(3)}
            </h2>
          ) : /^- \[[ x]\]/.test(line) ? (
            <div
              key={index}
              className="flex gap-3 border-b py-3 text-sm leading-6"
            >
              {line.startsWith("- [x]") ? (
                <CheckCircle2
                  className="mt-1 shrink-0 text-primary"
                  size={17}
                />
              ) : (
                <Circle
                  className="mt-1 shrink-0 text-muted-foreground"
                  size={17}
                />
              )}
              <span>{line.slice(6)}</span>
            </div>
          ) : null,
        )}
      </div>
    </WorkspaceShell>
  );
}
