import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exportToExcel } from "@/lib/exportExcel";
import { AUDIT_ACTION_LABELS, auditActionLabel, formatAuditDate } from "@/lib/permissionAudit";

const todayIso = () => new Date().toISOString().slice(0, 10);
const monthAgoIso = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); };

async function downloadPdf(title: string, headers: string[], rows: string[][], fileName: string) {
  const { createHebrewDoc, drawRtlText, drawFooterOnAllPages } = await import("@/lib/pdf/hebrewPdf");
  const { pdf, regular, bold } = await createHebrewDoc();
  const W = 842, H = 595, M = 30;
  const colW = (W - 2 * M) / headers.length;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const header = () => {
    drawRtlText({ page, text: title, font: bold, size: 14, rightX: W - M, y }); y -= 18;
    drawRtlText({ page, text: `הופק: ${formatAuditDate(new Date().toISOString())}`, font: regular, size: 9, rightX: W - M, y }); y -= 18;
    headers.forEach((h, i) => drawRtlText({ page, text: h, font: bold, size: 9, rightX: W - M - i * colW, y }));
    y -= 14;
  };
  header();
  for (const r of rows) {
    if (y < M + 20) { page = pdf.addPage([W, H]); y = H - M; header(); }
    r.forEach((c, i) => {
      let t = c ?? "";
      while (t && regular.widthOfTextAtSize(t, 8) > colW - 4) t = t.slice(0, -1);
      drawRtlText({ page, text: t, font: regular, size: 8, rightX: W - M - i * colW, y });
    });
    y -= 12;
  }
  drawFooterOnAllPages(pdf, regular);
  const bytes = await pdf.save();
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a"); a.href = url; a.download = `${fileName}.pdf`; a.click();
  URL.revokeObjectURL(url);
}

export function PermissionAuditTab() {
  const { activeCompanyId } = useCompany();
  const [from, setFrom] = useState(monthAgoIso());
  const [to, setTo] = useState(todayIso());
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");

  const { data: log, isLoading, error } = useQuery({
    queryKey: ["permission-audit", activeCompanyId, from, to],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const end = new Date(to); end.setDate(end.getDate() + 1);
      const { data, error } = await (supabase.rpc as any)("get_permission_audit", {
        _company_id: activeCompanyId, _from: new Date(from).toISOString(), _to: end.toISOString(),
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: snapshot } = useQuery({
    queryKey: ["permissions-snapshot", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_permissions_snapshot", { _company_id: activeCompanyId });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (log ?? []).filter((r) =>
      (!action || r.action === action) &&
      (!q || [r.actor_name, r.actor_email, r.target_name, r.target_email, r.details].some((v) => (v ?? "").toLowerCase().includes(q))),
    ).map((r) => ({
      when: formatAuditDate(r.created_at),
      actor: r.actor_name || r.actor_email || "מערכת",
      target: r.target_name || r.target_email || "",
      action: auditActionLabel(r.action),
      details: r.details ?? "",
    }));
  }, [log, search, action]);

  const logHeaders = [
    { key: "when", label: "תאריך ושעה" }, { key: "actor", label: "מבצע" }, { key: "target", label: "על מי" },
    { key: "action", label: "פעולה" }, { key: "details", label: "פרטים" },
  ];
  const snapRows = (snapshot ?? []).map((s) => ({
    name: s.full_name ?? "", email: s.email ?? "", roles: s.roles ?? "", company_role: s.company_role ?? "",
    status: s.banned ? "חסום" : "פעיל",
  }));
  const snapHeaders = [
    { key: "name", label: "שם" }, { key: "email", label: "מייל" }, { key: "roles", label: "תפקידים" },
    { key: "company_role", label: "תפקיד בחברה" }, { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-xl border border-border/50 shadow-card p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">לוג הרשאות</h2>
          <p className="text-sm text-muted-foreground">כל שינוי בתפקידים, בגישה לחברה, בחסימת משתמשים ובגישות דיגיטליות. הרישומים אינם ניתנים לעריכה או מחיקה.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs space-y-1">מתאריך<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-xs space-y-1">עד תאריך<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label className="text-xs space-y-1">סוג פעולה
            <select className="flex h-10 rounded-md border border-input bg-background px-3 text-sm" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">הכל</option>
              {Object.entries(AUDIT_ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-xs space-y-1 flex-1 min-w-[180px]">חיפוש (מבצע / משתמש)<Input value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          <Button variant="outline" disabled={!rows.length} onClick={() => exportToExcel(rows, logHeaders, `לוג הרשאות ${from} עד ${to}`)}><FileSpreadsheet className="w-4 h-4" />אקסל</Button>
          <Button variant="outline" disabled={!rows.length} onClick={() => downloadPdf(`לוג הרשאות ${from} – ${to}`, logHeaders.map((h) => h.label), rows.map((r) => logHeaders.map((h) => (r as any)[h.key])), `לוג הרשאות ${from} עד ${to}`)}><FileDown className="w-4 h-4" />PDF</Button>
        </div>
        {error ? <p className="text-sm text-destructive">שגיאה בטעינת הלוג</p> : isLoading ? <p className="text-sm text-muted-foreground">טוען...</p> : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין רישומים בטווח שנבחר. הרישום פעיל מ-12/10/2026.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>{logHeaders.map((h) => <th key={h.key} className="text-start p-2 font-medium">{h.label}</th>)}</tr></thead>
              <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border">{logHeaders.map((h) => <td key={h.key} className="p-2">{(r as any)[h.key]}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border/50 shadow-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">תמונת מצב הרשאות נוכחית</h2>
            <p className="text-sm text-muted-foreground">מי מחזיק איזה תפקיד בחברה ברגע זה ({snapRows.length} משתמשים).</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={!snapRows.length} onClick={() => exportToExcel(snapRows, snapHeaders, `תמונת מצב הרשאות ${todayIso()}`)}><FileSpreadsheet className="w-4 h-4" />אקסל</Button>
            <Button variant="outline" disabled={!snapRows.length} onClick={() => downloadPdf("תמונת מצב הרשאות", snapHeaders.map((h) => h.label), snapRows.map((r) => snapHeaders.map((h) => (r as any)[h.key])), `תמונת מצב הרשאות ${todayIso()}`)}><FileDown className="w-4 h-4" />PDF</Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border max-h-[420px]">
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr>{snapHeaders.map((h) => <th key={h.key} className="text-start p-2 font-medium">{h.label}</th>)}</tr></thead>
            <tbody>{snapRows.map((r, i) => <tr key={i} className="border-t border-border">{snapHeaders.map((h) => <td key={h.key} className="p-2">{(r as any)[h.key]}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
