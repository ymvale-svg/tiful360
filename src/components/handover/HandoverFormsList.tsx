import { useState } from "react";
import { FileSignature, FileDown, Clock, Eye, ExternalLink } from "lucide-react";
import type { HandoverFormRow } from "@/hooks/useHandoverForms";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);

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
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setPreview({ url, title: `${title} · ${subject}` })}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Eye className="w-3.5 h-3.5" />
                  צפייה
                </button>
                <a
                  href={url}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">הורדה</span>
                </a>
              </div>
            )}
          </div>
        );
      })}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-4xl w-[95vw] p-0 gap-0" dir="rtl">
          <DialogHeader className="p-4 pb-3 border-b">
            <DialogTitle className="text-base truncate pl-8">{preview?.title}</DialogTitle>
          </DialogHeader>
          <div className="h-[70vh] bg-muted/30">
            {preview && (
              <iframe
                src={preview.url}
                title={preview.title}
                className="w-full h-full border-0"
              />
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 p-3 border-t">
            <Button asChild variant="outline" size="sm">
              <a href={preview?.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 ml-1" />
                פתיחה בכרטיסייה חדשה
              </a>
            </Button>
            <Button asChild size="sm">
              <a href={preview?.url} download target="_blank" rel="noopener noreferrer">
                <FileDown className="w-4 h-4 ml-1" />
                הורדה
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

}
