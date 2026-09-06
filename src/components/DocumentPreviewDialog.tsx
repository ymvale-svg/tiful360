import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string | null;
  fileName: string;
}

function kind(name: string): "image" | "pdf" | "other" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "other";
}

export function DocumentPreviewDialog({ open, onOpenChange, url, fileName }: Props) {
  const type = kind(fileName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] p-4">
        <DialogHeader>
          <DialogTitle className="text-sm break-all text-right">{fileName}</DialogTitle>
        </DialogHeader>

        <div className="h-[70vh] rounded-lg border bg-muted/20 overflow-auto flex items-center justify-center">
          {!url ? (
            <p className="text-sm text-muted-foreground">טוען...</p>
          ) : type === "image" ? (
            <img src={url} alt={fileName} className="max-w-full max-h-full object-contain" />
          ) : type === "pdf" ? (
            <iframe src={url} title={fileName} className="w-full h-full" />
          ) : (
            <div className="text-center space-y-3 p-6">
              <p className="text-sm text-muted-foreground">לא ניתן להציג תצוגה מקדימה לסוג קובץ זה</p>
              <Button size="sm" onClick={() => window.open(url, "_blank")} className="gap-1.5">
                <Download className="w-4 h-4" /> הורד את הקובץ
              </Button>
            </div>
          )}
        </div>

        {url && (
          <div className="flex justify-end">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.open(url, "_blank")}>
              <ExternalLink className="w-4 h-4" /> פתח בלשונית חדשה
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
