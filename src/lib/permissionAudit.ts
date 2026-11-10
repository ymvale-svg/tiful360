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
  permission_groups_insert: "יצירת קבוצת הרשאות",
  permission_groups_update: "עדכון קבוצת הרשאות",
  permission_groups_delete: "מחיקת קבוצת הרשאות",
  permission_group_members_insert: "שיוך לקבוצת הרשאות",
  permission_group_members_delete: "הסרה מקבוצת הרשאות",
  user_invited: "הזמנת משתמש",
  user_banned: "חסימת משתמש",
  user_unbanned: "ביטול חסימה",
  system_access_legacy_import: "ייבוא הרשאות קיימות",
  system_access_legacy_import_undone: "ביטול ייבוא ההרשאות הקיימות",
  digital_access_domain_removed: "הסרת תחום גישות דיגיטליות",
};

export const auditActionLabel = (a: string) => AUDIT_ACTION_LABELS[a] ?? a;

export function formatAuditDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
