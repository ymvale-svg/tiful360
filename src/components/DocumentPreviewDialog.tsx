import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string | null;
  /** Real stored file name — drives which preview renderer is used. */
  fileName: string;
  /** Optional display title (e.g. a document label). */
  title?: string;
}

function kind(name: string): "image" | "pdf" | "other" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "other";
}

/** Phones and tablets: most mobile browsers render an embedded PDF as a blank frame. */
const MOBILE_QUERY = "(max-width: 767px), (pointer: coarse)";
function useIsMobileViewer() {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(MOBILE_QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia?.(MOBILE_QUERY);
    if (!mql) return;
    const onChange = (e: MediaQueryListEvent) => setMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

export function DocumentPreviewDialog({ open, onOpenChange, url, fileName, title }: Props) {
  const type = kind(fileName);
  const heading = title || fileName;
  const mobile = useIsMobileViewer();
  const pdfOnMobile = type === "pdf" && mobile;

  const openInTab = () => { if (url) window.open(url, "_blank", "noopener,noreferrer"); };
  const download = (
    <Button asChild variant="outline" className="gap-1.5 min-h-11 sm:min-h-10">
      <a href={url ?? undefined} download={fileName || true} target="_blank" rel="noopener noreferrer">
        <Download className="w-4 h-4" aria-hidden="true" /> הורד
      </a>
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] p-4" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-sm break-all text-right">{heading}</DialogTitle>
          <DialogDescription className="sr-only">תצוגה מקדימה של {heading}</DialogDescription>
        </DialogHeader>

        <div className={pdfOnMobile ? "rounded-lg border bg-muted/20 p-6" : "h-[70vh] rounded-lg border bg-muted/20 overflow-auto flex items-center justify-center"}>
          {!url ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> טוען…
            </p>
          ) : type === "image" ? (
            <img src={url} alt={heading} className="max-w-full max-h-full object-contain" />
          ) : pdfOnMobile ? (
            <div className="text-center space-y-3">
              <FileText className="w-10 h-10 mx-auto text-primary" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">בטלפון קובץ PDF נפתח בצורה הטובה ביותר במציג של המכשיר.</p>
              <div className="flex flex-col gap-2">
                <Button onClick={openInTab} className="gap-1.5 min-h-11">
                  <ExternalLink className="w-4 h-4" aria-hidden="true" /> פתח את הקובץ
                </Button>
                {download}
              </div>
            </div>
          ) : type === "pdf" ? (
            <iframe src={url} title={heading} className="w-full h-full" />
          ) : (
            <div className="text-center space-y-3 p-6">
              <p className="text-sm text-muted-foreground">לא ניתן להציג תצוגה מקדימה לסוג קובץ זה</p>
              {download}
            </div>
          )}
        </div>

        {url && !pdfOnMobile && (
          <div className="flex flex-wrap justify-end gap-2">
            {download}
            <Button variant="outline" className="gap-1.5 min-h-11 sm:min-h-10" onClick={openInTab}>
              <ExternalLink className="w-4 h-4" aria-hidden="true" /> פתח בלשונית חדשה
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
