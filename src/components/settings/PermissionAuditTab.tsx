import { useMemo, useState } from "react";
import { SearchInput } from "@/components/ui/search-input";
import { useQuery } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exportToExcel } from "@/lib/exportExcel";
import { toast } from "sonner";
import { StateView } from "@/components/feedback/StateView";
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
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a"); a.href = url; a.download = `${fileName}.pdf`; a.click();
  URL.revokeObjectURL(url);
}

export function PermissionAuditTab() {
  const { activeCompanyId } = useCompany();
  const [from, setFrom] = useState(monthAgoIso());
  const [to, setTo] = useState(todayIso());
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");

  const [pdfBusy, setPdfBusy] = useState<"log" | "snapshot" | null>(null);
  /** Building the Hebrew PDF loads fonts and can take a few seconds: show progress, report failures. */
  const makePdf = async (which: "log" | "snapshot", ...args: Parameters<typeof downloadPdf>) => {
    if (pdfBusy) return;
    setPdfBusy(which);
    try {
      await downloadPdf(...args);
    } catch (e) {
      toast.error("יצירת ה-PDF נכשלה", { description: e instanceof Error ? e.message : "נסו שוב." });
    } finally {
      setPdfBusy(null);
    }
  };
  const { data: log, isLoading, error, refetch } = useQuery({
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
          <div className="text-sm space-y-1"><label htmlFor="audit-from" className="block">מתאריך</label><Input id="audit-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="text-sm space-y-1"><label htmlFor="audit-to" className="block">עד תאריך</label><Input id="audit-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="text-sm space-y-1"><label htmlFor="audit-action" className="block">סוג פעולה</label>
            <select id="audit-action" className="flex h-10 rounded-md border border-input bg-background px-3 text-sm" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">הכל</option>
              {Object.entries(AUDIT_ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="text-sm space-y-1 flex-1 min-w-[180px]"><span className="block" aria-hidden="true">חיפוש (מבצע / משתמש)</span><SearchInput size="sm" label="חיפוש (מבצע / משתמש)" placeholder="שם מבצע או משתמש" value={search} onValueChange={setSearch} /></div>
          <Button variant="outline" disabled={!rows.length} onClick={() => exportToExcel(rows, logHeaders, `לוג הרשאות ${from} עד ${to}`)}><FileSpreadsheet className="w-4 h-4" aria-hidden="true" />אקסל</Button>
          <Button variant="outline" disabled={!rows.length || (!!pdfBusy && pdfBusy !== "log")} loading={pdfBusy === "log"} loadingText="מכין PDF…" onClick={() => makePdf("log", `לוג הרשאות ${from} – ${to}`, logHeaders.map((h) => h.label), rows.map((r) => logHeaders.map((h) => (r as any)[h.key])), `לוג הרשאות ${from} עד ${to}`)}><FileDown className="w-4 h-4" aria-hidden="true" />PDF</Button>
        </div>
        <StateView
          loading={isLoading}
          error={error}
          onRetry={() => { void refetch(); }}
          label="את לוג ההרשאות"
          isEmpty={rows.length === 0}
          empty={{
            title: (search || action) ? "אין רישומים שתואמים לסינון" : "אין רישומים בטווח שנבחר",
            description: "הרישום פעיל מ-12/10/2026.",
            action: (search || action) ? <Button variant="outline" onClick={() => { setSearch(""); setAction(""); }}>נקה סינון</Button> : undefined,
          }}
        >
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>{logHeaders.map((h) => <th key={h.key} className="text-start p-2 font-medium">{h.label}</th>)}</tr></thead>
              <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border">{logHeaders.map((h) => <td key={h.key} className="p-2">{(r as any)[h.key]}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </StateView>
      </div>

      <div className="bg-card rounded-xl border border-border/50 shadow-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">תמונת מצב הרשאות נוכחית</h2>
            <p className="text-sm text-muted-foreground">מי מחזיק איזה תפקיד בחברה ברגע זה ({snapRows.length} משתמשים).</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={!snapRows.length} onClick={() => exportToExcel(snapRows, snapHeaders, `תמונת מצב הרשאות ${todayIso()}`)}><FileSpreadsheet className="w-4 h-4" aria-hidden="true" />אקסל</Button>
            <Button variant="outline" disabled={!snapRows.length || (!!pdfBusy && pdfBusy !== "snapshot")} loading={pdfBusy === "snapshot"} loadingText="מכין PDF…" onClick={() => makePdf("snapshot", "תמונת מצב הרשאות", snapHeaders.map((h) => h.label), snapRows.map((r) => snapHeaders.map((h) => (r as any)[h.key])), `תמונת מצב הרשאות ${todayIso()}`)}><FileDown className="w-4 h-4" aria-hidden="true" />PDF</Button>
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
