import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspaceAccess } from "@/components/workspace-access";
import { FormsWorkspace } from "@/components/forms-workspace";

export default function Page() {
  return (
    <WorkspaceShell active="formlib">
      <WorkspaceAccess permission="templates.manage">
        <FormsWorkspace />
      </WorkspaceAccess>
    </WorkspaceShell>
  );
}
