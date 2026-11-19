// Who receives the "payslip data was viewed" audit email.
// Roles in user_roles are global, while tenant membership lives in
// user_company_access. A super_admin sees every company; an admin is notified
// only about employees of a company they have access to.
export type RoleRow = { user_id: string; role: string };

export function payslipAuditRecipientIds(
  roleRows: RoleRow[],
  companyMemberIds: Iterable<string>,
  viewerId: string,
): string[] {
  const members = new Set(companyMemberIds);
  const out: string[] = [];
  for (const row of roleRows) {
    if (!row?.user_id || row.user_id === viewerId) continue;
    const allowed = row.role === "super_admin" || (row.role === "admin" && members.has(row.user_id));
    if (allowed && !out.includes(row.user_id)) out.push(row.user_id);
  }
  return out;
}
