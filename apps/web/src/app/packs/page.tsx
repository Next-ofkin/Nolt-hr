import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspaceAccess } from "@/components/workspace-access";
import { PacksWorkspace } from "@/components/packs-workspace";

export default function Page() {
  return (
    <WorkspaceShell active="packs">
      <WorkspaceAccess permission="templates.manage">
        <PacksWorkspace />
      </WorkspaceAccess>
    </WorkspaceShell>
  );
}
