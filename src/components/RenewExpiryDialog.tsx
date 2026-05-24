import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CalendarClock, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/hooks/useCompany";
import type { ExpiringAsset } from "@/hooks/useExpiringAssets";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ExpiringAsset | null;
}

export function RenewExpiryDialog({ open, onOpenChange, item }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  const [newDate, setNewDate] = useState("");
  const [notes, setNotes] = useState("");
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && item) {
      // Default new date: +1 year from current expiry
      const cur = new Date(item.expiry_date);
      cur.setFullYear(cur.getFullYear() + 1);
      setNewDate(cur.toISOString().slice(0, 10));
      setNotes("");
      setReplaceFile(null);
    }
  }, [open, item]);

  if (!item) return null;

  const handleRenew = async () => {
    if (!newDate) {
      toast({ title: "נא לבחור תאריך חדש", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      // 1. Update the source
      if (item.source_type === "asset") {
        const { error } = await supabase
          .from("assets")
          .update({ expiry_date: newDate })
          .eq("id", item.asset_id);
        if (error) throw error;
      } else if (
        item.source_type === "vehicle_test" ||
        item.source_type === "vehicle_insurance" ||
        item.source_type === "vehicle_license"
      ) {
        const col =
          item.source_type === "vehicle_test"
            ? "test_expiry"
            : item.source_type === "vehicle_insurance"
              ? "insurance_expiry"
              : "license_expiry";
        const { error } = await supabase
          .from("assets")
          .update({ [col]: newDate } as any)
          .eq("id", item.asset_id);
        if (error) throw error;
      } else if (item.source_type === "digital_access") {
        const col = item.field_key === "license" ? "license_expires_at" : "password_expires_at";
        const { error } = await supabase
          .from("digital_access")
          .update({ [col]: newDate } as any)
          .eq("id", item.source_id);
        if (error) throw error;
      } else if (item.source_type === "custom_field") {
        const fieldName = item.field_label;
        const { data: a, error: aErr } = await supabase
          .from("assets")
          .select("custom_fields")
          .eq("id", item.asset_id)
          .single();
        if (aErr) throw aErr;
        const updated = { ...((a?.custom_fields as any) ?? {}), [fieldName]: newDate };
        const { error } = await supabase
          .from("assets")
          .update({ custom_fields: updated })
          .eq("id", item.asset_id);
        if (error) throw error;
      } else if (item.source_type === "document") {
        let updates: any = { expiry_date: newDate };
        // Optional file replacement
        if (replaceFile && activeCompanyId) {
          const safeName = replaceFile.name.replace(/[^\w.\-א-ת]+/g, "_");
          const path = `${activeCompanyId}/${item.asset_id}/${Date.now()}_${safeName}`;
          const up = await supabase.storage.from("asset-documents").upload(path, replaceFile);
          if (up.error) throw up.error;
          updates.file_url = path;
          updates.file_name = replaceFile.name;
          updates.file_size_bytes = replaceFile.size;
        }
        const { error } = await supabase
          .from("asset_documents" as any)
          .update(updates)
          .eq("id", item.source_id);
        if (error) throw error;
      }

      // 2. Activity log
      await supabase.from("activity_log").insert({
        company_id: activeCompanyId,
        entity_type: "asset",
        entity_id: item.asset_id,
        action: "חידוש תוקף",
        details: `${item.asset_name} (${item.asset_code}) — ${item.field_label}: ${item.expiry_date} → ${newDate}${notes ? ` · ${notes}` : ""}`,
      });

      toast({ title: "התוקף עודכן בהצלחה" });
      qc.invalidateQueries({ queryKey: ["expiring-assets"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["employee-assets"] });
      qc.invalidateQueries({ queryKey: ["my_digital_access"] });
      qc.invalidateQueries({ queryKey: ["asset-documents", item.asset_id] });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "שגיאה בעדכון", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const sourceLabel = item.source_type === "document" ? `מסמך: ${item.field_label}` : item.field_label;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-primary" />
            חידוש תוקף
          </DialogTitle>
          <DialogDescription>עדכון תאריך תפוגה לאחר טיפול/חידוש</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div className="rounded-lg border bg-muted/20 p-3 text-sm space-y-1">
            <div className="font-medium">{item.asset_name}</div>
            <div className="text-xs text-muted-foreground font-mono">{item.asset_code}</div>
            <div className="text-xs text-muted-foreground">קטגוריה: {item.category_name}</div>
            <div className="text-xs">
              <span className="text-muted-foreground">סוג תוקף: </span>
              <span className="font-medium">{sourceLabel}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">תאריך נוכחי: </span>
              <span className="font-medium">{new Date(item.expiry_date).toLocaleDateString("en-GB").replace(/\//g, "-")}</span>
            </div>
            {item.is_assignable && item.owner_name && (
              <div className="text-xs">
                <span className="text-muted-foreground">מחזיק: </span>
                <span className="font-medium">{item.owner_name}</span>
              </div>
            )}
            {!item.is_assignable && (
              <div className="text-xs">
                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">נכס מוסדי</span>
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">תאריך תוקף חדש</label>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
              dir="ltr"
            />
          </div>

          {item.source_type === "document" && (
            <div>
              <label className="text-sm font-medium mb-1 block flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                החלף קובץ (אופציונלי)
              </label>
              <input
                type="file"
                onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)}
                className="w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground"
              />
              <p className="text-xs text-muted-foreground mt-1">השאר ריק כדי לעדכן רק את התאריך</p>
            </div>
          )}

          <div>
            <label className="text-sm font-medium mb-1 block">הערות (אופציונלי)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="פרטי הטיפול / חידוש..."
              className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>ביטול</Button>
            <Button className="flex-1" onClick={handleRenew} disabled={submitting}>
              {submitting ? "מעדכן..." : "עדכן תוקף"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
