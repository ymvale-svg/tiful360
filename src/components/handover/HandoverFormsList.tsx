import { FileSignature, FileDown, Clock } from "lucide-react";
import type { HandoverFormRow } from "@/hooks/useHandoverForms";

interface Props {
  forms: HandoverFormRow[];
  /** "asset" — show the employee name; "employee" — show the item name. */
  context: "asset" | "employee";
  emptyText?: string;
}

const fmt = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("he-IL", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";

/** Shared list of handover / return protocols (item card + employee portal). */
export function HandoverFormsList({ forms, context, emptyText = "אין עדיין פרוטוקולים" }: Props) {
  if (forms.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="space-y-2">
      {forms.map((f) => {
        const snap = (f.form_snapshot ?? {}) as any;
        const isReturn = f.direction === "return";
        const title = snap.title || (isReturn ? "פרוטוקול הזדכות" : "פרוטוקול משיכה");
        const subject =
          context === "asset"
            ? f.employees?.full_name || snap.employee_name || "—"
            : f.assets?.asset_name || snap.employee_name || "פריט";
        const code = context === "employee" ? f.assets?.asset_code : null;
        const url = f.pdf_url || f.attached_document_url;
        const pending = f.status !== "signed";

        return (
          <div
            key={f.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <FileSignature className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                {title} · {subject}
                {code ? <span className="text-muted-foreground"> ({code})</span> : null}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {fmt(f.signed_at ?? f.created_at)}
                {pending && <span className="text-warning">· ממתין לחתימה</span>}
              </p>
            </div>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
              >
                <FileDown className="w-3.5 h-3.5" />
                הורדה
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
