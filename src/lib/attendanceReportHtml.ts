/** Escapes text before it goes into HTML that is written with document.write (print / PDF export). */
export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

type ReportEmployee = { full_name?: string | null; employee_code?: string | null; department?: string | null };

/** Employee line at the top of a monthly attendance report page. Every value is escaped. */
export function attendanceReportMeta(e: ReportEmployee): string {
  const or = (v?: string | null) => (v ? escapeHtml(v) : "—");
  return `<b>${escapeHtml(e.full_name)}</b> · מספר עובד: ${or(e.employee_code)} · מחלקה: ${or(e.department)}`;
}
