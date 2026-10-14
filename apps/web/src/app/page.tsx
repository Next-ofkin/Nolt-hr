import { WorkspaceShell } from "@/components/workspace-shell";
import { HomeWorkspace } from "@/components/onboarding-home";
export default function Page() {
  return (
    <WorkspaceShell>
      <HomeWorkspace />
    </WorkspaceShell>
  );
}
