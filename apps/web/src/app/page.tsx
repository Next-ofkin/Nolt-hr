import { Suspense } from "react";
import { WorkspaceShell } from "@/components/workspace-shell";
import { HomeWorkspace } from "@/components/onboarding-home";
export default function Page() {
  return (
    <WorkspaceShell>
      <Suspense fallback={null}><HomeWorkspace /></Suspense>
    </WorkspaceShell>
  );
}
