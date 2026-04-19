import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useEmployeeAssets } from "@/hooks/useData";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
}

export function UploadSignedFormDialog({ open, onOpenChange, employeeId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  const { data: assets } = useEmployeeAssets(employeeId);
  const [assetId, setAssetId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setAssetId(""); setFile(null); };

  const handleSave = async () => {
    if (!assetId || !file || !activeCompanyId) {
      toast({ title: "יש לבחור פריט ציוד וקובץ", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${activeCompanyId}/${employeeId}/${assetId}-manual-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("handover-forms").upload(path, file);
      if (up.error) throw up.error;
      const url = supabase.storage.from("handover-forms").getPublicUrl(path).data.publicUrl;

      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("asset_handover_forms").insert({
        company_id: activeCompanyId,
        asset_id: assetId,
        employee_id: employeeId,
        delivery_method: "manual_upload",
        status: "signed",
        attached_document_url: url,
        pdf_url: file.type === "application/pdf" ? url : null,
        signed_at: new Date().toISOString(),
        form_snapshot: {} as any,
        created_by: user?.id,
      });
      if (error) throw error;

      toast({ title: "הטופס הועלה ונשמר בתיק העובד" });
      qc.invalidateQueries({ queryKey: ["handover-forms"] });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>העלאת טופס חתום</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>פריט ציוד</Label>
            <SearchableSelect
              value={assetId}
              onChange={setAssetId}
              options={(assets ?? []).map((a: any) => ({
                value: a.id,
                label: `${a.asset_name} (${a.asset_code})`,
              }))}
              placeholder="בחר פריט..."
            />
          </div>
          <div>
            <Label>מסמך חתום</Label>
            <label className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg text-sm cursor-pointer hover:bg-muted/70">
              <Upload className="w-4 h-4" />
              <span className="truncate">{file ? file.name : "בחר קובץ PDF/תמונה..."}</span>
              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button className="flex-1" disabled={busy || !assetId || !file} onClick={handleSave}>
            {busy ? "מעלה..." : "שמור"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
