import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspaceAccess } from "@/components/workspace-access";
import { EmployeesWorkspace } from "@/components/employees-workspace";
export default function Page() {
  return (
    <WorkspaceShell active="employees">
      <WorkspaceAccess permission="employees.manage">
        <EmployeesWorkspace />
      </WorkspaceAccess>
    </WorkspaceShell>
  );
}
