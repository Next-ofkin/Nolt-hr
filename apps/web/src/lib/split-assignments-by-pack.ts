// Keep form identity based on assignment IDs, not titles: the same form
// title can appear in different pack versions or as an individual assignment.
export function splitAssignmentsByPack<
  T extends { id: string },
  P extends { forms: { assignmentId: string }[] },
>(assignments: T[], packs: P[]) {
  const assignmentsById = new Map(assignments.map(assignment => [assignment.id, assignment]));
  const packAssignmentIds = new Set(packs.flatMap(pack => pack.forms.map(form => form.assignmentId)));
  const standalone = assignments.filter(assignment => !packAssignmentIds.has(assignment.id));
  return { assignmentsById, standalone };
}
