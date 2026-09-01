import { useEffect, useState } from "react";
import { FileSignature, FileDown, Clock, Eye, ExternalLink, Images, Play } from "lucide-react";
import type { HandoverFormRow } from "@/hooks/useHandoverForms";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { buildProtocolPdf } from "@/lib/pdf/lazy";
import { isProtocolSnapshot, protocolDataFromSnapshot } from "@/lib/pdf/protocolSnapshot";
import type { ProtocolMedia } from "@/lib/pdf/types";
import { getHandoverSignedUrl, openHandoverFile, useHandoverSignedUrls } from "@/lib/handoverUrl";

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
  const [mediaPreview, setMediaPreview] = useState<{ items: ProtocolMedia[]; title: string } | null>(null);
  const [creatingPreview, setCreatingPreview] = useState(false);

  useEffect(() => () => {
    if (preview?.url.startsWith("blob:")) URL.revokeObjectURL(preview.url);
  }, [preview]);

  const openPreview = async (form: HandoverFormRow, title: string, fallbackUrl: string) => {
    const snapshot = (form.form_snapshot ?? {}) as Record<string, any>;
    if (!isProtocolSnapshot(snapshot)) {
      // fallbackUrl is a storage path in the private bucket — sign it first.
      setPreview({ url: await getHandoverSignedUrl(fallbackUrl), title });
      return;
    }
    setCreatingPreview(true);
    try {
      const blob = await buildProtocolPdf(protocolDataFromSnapshot(snapshot));
      setPreview({ url: URL.createObjectURL(blob), title });
    } finally {
      setCreatingPreview(false);
    }
  };

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
        const media = (Array.isArray(f.media) ? f.media : Array.isArray(snap.media) ? snap.media : []) as ProtocolMedia[];

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
            <div className="flex items-center gap-1 shrink-0">
              {media.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 px-2 text-xs"
                  onClick={() => setMediaPreview({ items: media, title: `${title} · ${subject}` })}
                >
                  <Images className="w-3.5 h-3.5" />
                  תיעוד ({media.length})
                </Button>
              )}
              {url && (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={creatingPreview}
                  onClick={() => void openPreview(f, `${title} · ${subject}`, url)}
                  className="h-8 gap-1 px-2 text-xs"
                >
                  <Eye className="w-3.5 h-3.5" />
                  צפייה
                </Button>
                <button
                  type="button"
                  onClick={() => void openHandoverFile(url)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">הורדה</span>
                </button>
              </div>
              )}
            </div>
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

      <Dialog open={!!mediaPreview} onOpenChange={(open) => !open && setMediaPreview(null)}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{mediaPreview?.title} · תיעוד מצולם</DialogTitle>
          </DialogHeader>
          <MediaGallery items={mediaPreview?.items ?? []} />
        </DialogContent>
      </Dialog>
    </div>
  );

}


/**
 * Protocol photos and video. The bucket is private, so each item is rendered
 * through a signed URL that refreshes while the dialog stays open.
 */
function MediaGallery({ items }: { items: ProtocolMedia[] }) {
  const { data: signed, isLoading } = useHandoverSignedUrls(items.map((i) => i.url));

  if (items.length === 0) return null;
  if (isLoading) {
    return <p className="py-6 text-center text-sm text-muted-foreground">טוען תיעוד…</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item, index) => {
        const src = signed?.[index] ?? null;
        return (
          <div key={`${item.url}-${index}`} className="overflow-hidden rounded-lg border bg-muted/20">
            {!src ? (
              <div className="flex aspect-video w-full items-center justify-center bg-muted/40 text-sm text-muted-foreground">
                הקובץ אינו זמין
              </div>
            ) : item.type === "video" ? (
              <video src={src} controls playsInline preload="metadata" className="aspect-video w-full bg-foreground/10 object-contain" />
            ) : (
              <a href={src} target="_blank" rel="noopener noreferrer">
                <img src={src} alt={item.label || `תיעוד ${index + 1}`} loading="lazy" className="aspect-video w-full object-contain" />
              </a>
            )}
            <div className="flex items-center gap-2 p-2 text-sm">
              {item.type === "video" && <Play className="h-4 w-4 text-primary" />}
              <span>{item.label || (item.type === "video" ? "סרטון מסירה" : `תמונה ${index + 1}`)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
