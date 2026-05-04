import { useState } from "react";
import { FileText, Upload, Trash2, Download, AlertCircle, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  useAssetDocuments,
  useUploadAssetDocument,
  useDeleteAssetDocument,
  getAssetDocumentSignedUrl,
  DOCUMENT_TYPES,
  type AssetDocument,
} from "@/hooks/useAssetDocuments";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  assetId: string;
}

export function AssetDocumentsSection({ assetId }: Props) {
  const { data: documents, isLoading } = useAssetDocuments(assetId);
  const upload = useUploadAssetDocument();
  const del = useDeleteAssetDocument();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("other");
  const [label, setLabel] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setFile(null); setDocType("other"); setLabel(""); setExpiryDate(""); setNotes(""); setShowForm(false);
  };

  const handleUpload = async () => {
    if (!file) {
      toast({ title: "נא לבחור קובץ", variant: "destructive" });
      return;
    }
    try {
      await upload.mutateAsync({
        asset_id: assetId,
        file,
        document_type: docType,
        document_label: label || undefined,
        expiry_date: expiryDate || undefined,
        notes: notes || undefined,
      });
      toast({ title: "המסמך הועלה בהצלחה" });
      reset();
    } catch (err: any) {
      toast({ title: "שגיאה בהעלאה", description: err.message, variant: "destructive" });
    }
  };

  const handleDownload = async (doc: AssetDocument) => {
    const url = await getAssetDocumentSignedUrl(doc.file_url);
    if (!url) {
      toast({ title: "שגיאה ביצירת קישור הורדה", variant: "destructive" });
      return;
    }
    window.open(url, "_blank");
  };

  const handleDelete = async (doc: AssetDocument) => {
    if (!confirm(`למחוק את "${doc.document_label || doc.file_name}"?`)) return;
    try {
      await del.mutateAsync(doc);
      toast({ title: "המסמך נמחק" });
    } catch (err: any) {
      toast({ title: "שגיאה במחיקה", description: err.message, variant: "destructive" });
    }
  };

  const fmtSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const typeLabel = (t: string) => DOCUMENT_TYPES.find(d => d.value === t)?.label ?? t;

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          מסמכים מצורפים
          {documents && documents.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal">({documents.length})</span>
          )}
        </div>
        {!showForm && (
          <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => setShowForm(true)}>
            <Upload className="w-3.5 h-3.5" />
            העלה מסמך
          </Button>
        )}
      </div>

      {showForm && (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium mb-1 block">סוג מסמך</label>
              <SearchableSelect
                value={docType}
                onChange={setDocType}
                options={DOCUMENT_TYPES.map(d => ({ value: d.value, label: d.label }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">תאריך תפוגה (אופציונלי)</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-background rounded-md text-sm outline-none focus:ring-2 focus:ring-primary/30 border"
                dir="ltr"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">תווית/תיאור</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="למשל: אישור ביטוח חובה 2026"
              className="w-full px-2.5 py-1.5 bg-background rounded-md text-sm outline-none focus:ring-2 focus:ring-primary/30 border"
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">קובץ</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="flex-1" onClick={reset}>ביטול</Button>
            <Button size="sm" className="flex-1" onClick={handleUpload} disabled={upload.isPending || !file}>
              {upload.isPending ? "מעלה..." : "העלה"}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground text-center py-2">טוען...</p>
      ) : !documents || documents.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">אין מסמכים מצורפים</p>
      ) : (
        <ul className="space-y-1.5 max-h-56 overflow-y-auto">
          {documents.map((doc) => {
            const expiringSoon = doc.expiry_date
              ? Math.ceil((new Date(doc.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              : null;
            const isExpired = expiringSoon !== null && expiringSoon <= 0;
            const isWarning = expiringSoon !== null && expiringSoon > 0 && expiringSoon <= 14;
            return (
              <li
                key={doc.id}
                className="flex items-start justify-between gap-2 text-xs border-b border-border/50 last:border-0 pb-1.5 last:pb-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground truncate">
                      {doc.document_label || doc.file_name}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">
                      {typeLabel(doc.document_type)}
                    </span>
                    {isExpired && (
                      <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[10px] flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> פג תוקף
                      </span>
                    )}
                    {isWarning && (
                      <span className="px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 text-[10px] flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {expiringSoon} ימים
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-0.5 flex items-center gap-2">
                    <span>{new Date(doc.uploaded_at).toLocaleDateString("he-IL")}</span>
                    {doc.file_size_bytes && <span>· {fmtSize(doc.file_size_bytes)}</span>}
                    {doc.expiry_date && <span>· תפוגה: {new Date(doc.expiry_date).toLocaleDateString("he-IL")}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleDownload(doc)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="הורד"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(doc)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                    title="מחק"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
