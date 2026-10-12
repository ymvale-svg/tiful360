export const AUDIT_ACTION_LABELS: Record<string, string> = {
  user_roles_insert: "הוספת תפקיד",
  user_roles_delete: "הסרת תפקיד",
  user_roles_update: "שינוי תפקיד",
  user_company_access_insert: "מתן גישה לחברה",
  user_company_access_delete: "ביטול גישה לחברה",
  user_company_access_update: "שינוי גישה לחברה",
  digital_access_insert: "הוספת גישה דיגיטלית",
  digital_access_update: "שינוי גישה דיגיטלית",
  digital_access_delete: "הסרת גישה דיגיטלית",
  user_invited: "הזמנת משתמש",
  user_banned: "חסימת משתמש",
  user_unbanned: "ביטול חסימה",
};

export const auditActionLabel = (a: string) => AUDIT_ACTION_LABELS[a] ?? a;

export function formatAuditDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
