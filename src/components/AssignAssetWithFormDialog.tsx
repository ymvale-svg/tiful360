import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FileSignature, Send, PenTool, Upload, AlertCircle, FileCheck2 } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useEmployees } from "@/hooks/useData";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import type { HandoverFormData } from "@/lib/pdf/types";
import { buildHandoverPdf } from "@/lib/pdf/buildHandoverPdf";
import { SignaturePad, SignaturePadHandle } from "./SignaturePad";

interface Asset {
  id: string;
  asset_code: string;
  asset_name: string;
  manufacturer_model?: string | null;
  condition?: string | null;
  company_id?: string | null;
  current_owner_id?: string | null;
  asset_categories?: { category_name?: string | null; skip_handover_form?: boolean | null } | null;
  employees?: { full_name?: string | null } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: Asset | null;
}

export function AssignAssetWithFormDialog({ open, onOpenChange, asset }: Props) {
  const { data: employees } = useEmployees();
  const { activeCompany, activeCompanyId } = useCompany();
  const { toast } = useToast();
  const qc = useQueryClient();

  const preassignedOwnerId = asset?.current_owner_id ?? "";
  const [employeeId, setEmployeeId] = useState("");
  const [method, setMethod] = useState<"portal" | "manager_present">("portal");
  const [step, setStep] = useState<"choose" | "sign">("choose");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const attachmentPreview = attachment
    ? { url: URL.createObjectURL(attachment), isImage: attachment.type.startsWith("image/") }
    : null;

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const issuerSigRef = useRef<SignaturePadHandle>(null);
  const receiverSigRef = useRef<SignaturePadHandle>(null);
  const [issuerDataUrl, setIssuerDataUrl] = useState<string | null>(null);
  const [receiverDataUrl, setReceiverDataUrl] = useState<string | null>(null);

  // Auto-select current owner when asset is already assigned
  useEffect(() => {
    if (open && preassignedOwnerId) setEmployeeId(preassignedOwnerId);
  }, [open, preassignedOwnerId]);

  // Skip handover form when category opted-out, OR for legacy "virtual" categories by name
  const categoryName = asset?.asset_categories?.category_name ?? "";
  const categorySkipsHandover = asset?.asset_categories?.skip_handover_form === true;
  const isVirtualAsset =
    categorySkipsHandover ||
    /תוכנ|וירטואל|software|virtual|subscription|מנוי/i.test(categoryName);

  // Direct assignment for virtual assets — no form, no signature
  const handleDirectAssign = async () => {
    if (!asset || !employeeId) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("assets")
        .update({ current_owner_id: employeeId, status: "in_use" })
        .eq("id", asset.id);
      if (error) throw error;
      toast({ title: "הציוד שויך", description: "פריטים וירטואליים אינם דורשים טופס מסירה" });
      qc.invalidateQueries({ queryKey: ["assets"] });
      close();
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // Auto-assign virtual asset when an owner is already preselected (skip dialog UI entirely)
  useEffect(() => {
    if (!open || !isVirtualAsset || !asset || !preassignedOwnerId || busy) return;
    handleDirectAssign();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isVirtualAsset, asset?.id, preassignedOwnerId]);

  const reset = () => {
    setEmployeeId(preassignedOwnerId); setMethod("portal"); setStep("choose");
    setAttachment(null); setIssuerDataUrl(null); setReceiverDataUrl(null);
  };

  const close = () => { reset(); onOpenChange(false); };

  const employee = employees?.find((e: any) => e.id === employeeId);
  const isPreassigned = !!preassignedOwnerId;

  const formData: HandoverFormData | null = asset && employee && activeCompany ? {
    company_name: activeCompany.name,
    company_logo_url: activeCompany.logo_url,
    employee_name: employee.full_name ?? "",
    employee_department: (employee as any).department ?? "—",
    date: new Date().toISOString(),
    asset_name: asset.asset_name,
    category_name: asset.asset_categories?.category_name ?? null,
    manufacturer_model: asset.manufacturer_model,
    asset_code: asset.asset_code,
    condition: asset.condition || "good",
    issuer_signature: issuerDataUrl,
    receiver_signature: receiverDataUrl,
  } : null;

  // Live PDF preview
  useEffect(() => {
    if (step !== "sign" || !formData) { setPreviewUrl(null); return; }
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const blob = await buildHandoverPdf(formData);
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return createdUrl; });
      } catch (e) { console.error("preview pdf failed", e); }
    })();
    return () => { cancelled = true; if (createdUrl) URL.revokeObjectURL(createdUrl); };
  }, [step, formData?.employee_name, formData?.asset_code, issuerDataUrl, receiverDataUrl]);

  // ---- Action: Send to portal ----
  const handleSendToPortal = async () => {
    if (!asset || !employee || !activeCompanyId) return;
    setBusy(true);
    try {
      const snapshot = formData;
      const { data: { user } } = await supabase.auth.getUser();

      let attachedUrl: string | null = null;
      if (attachment) {
        const ext = attachment.name.split(".").pop();
        const path = `${activeCompanyId}/${employee.id}/${asset.id}-attached-${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("handover-forms").upload(path, attachment);
        if (error) throw error;
        attachedUrl = supabase.storage.from("handover-forms").getPublicUrl(path).data.publicUrl;
      }

      const { error } = await supabase.from("asset_handover_forms").insert({
        company_id: activeCompanyId,
        asset_id: asset.id,
        employee_id: employee.id,
        delivery_method: "portal",
        status: "pending",
        form_snapshot: snapshot as any,
        attached_document_url: attachedUrl,
        created_by: user?.id,
      });
      if (error) throw error;

      // Assign asset to employee now
      await supabase.from("assets").update({
        current_owner_id: employee.id,
        status: "in_use",
      }).eq("id", asset.id);

      toast({ title: "טופס נשלח", description: "הטופס הופיע בפורטל העובד לחתימה" });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["handover-forms"] });
      close();
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // ---- Action: Sign in front of manager / Save attached ----
  const handleManagerSign = async () => {
    if (!asset || !employee || !activeCompanyId) return;
    const issuer = issuerSigRef.current?.getDataUrl();
    const receiver = receiverSigRef.current?.getDataUrl();
    const hasUploaded = !!attachment;
    if (!receiver && !hasUploaded) {
      toast({ title: "חסרה חתימה או מסמך חתום מצורף", variant: "destructive" });
      return;
    }
    if (!hasUploaded && !formData) {
      toast({ title: "שגיאה פנימית — לא נטען טופס לחתימה", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      setIssuerDataUrl(issuer ?? null);
      setReceiverDataUrl(receiver ?? null);

      const { data: { user } } = await supabase.auth.getUser();

      let attachedUrl: string | null = null;
      if (attachment) {
        const ext = attachment.name.split(".").pop();
        const path = `${activeCompanyId}/${employee.id}/${asset.id}-attached-${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("handover-forms").upload(path, attachment);
        if (error) throw error;
        attachedUrl = supabase.storage.from("handover-forms").getPublicUrl(path).data.publicUrl;
      }

      // If a signed PDF was uploaded — use it as the canonical PDF; otherwise generate one from the template.
      let pdfUrl: string | null = null;
      if (attachedUrl && attachment?.type === "application/pdf") {
        pdfUrl = attachedUrl;
      } else if (attachedUrl) {
        pdfUrl = null;
      } else if (formData) {
        const blob = await buildHandoverPdf({
          ...formData,
          issuer_signature: issuer ?? null,
          receiver_signature: receiver ?? null,
        });
        const pdfPath = `${activeCompanyId}/${employee.id}/${asset.id}-${Date.now()}.pdf`;
        const { error: upErr } = await supabase.storage
          .from("handover-forms")
          .upload(pdfPath, blob, { contentType: "application/pdf", upsert: true });
        if (upErr) throw upErr;
        pdfUrl = supabase.storage.from("handover-forms").getPublicUrl(pdfPath).data.publicUrl;
      }

      const { error } = await supabase.from("asset_handover_forms").insert({
        company_id: activeCompanyId,
        asset_id: asset.id,
        employee_id: employee.id,
        delivery_method: hasUploaded && !receiver ? "manual_upload" : "manager_present",
        status: "signed",
        form_snapshot: { ...(formData ?? {}), issuer_signature: issuer, receiver_signature: receiver } as any,
        signature_data: receiver,
        attached_document_url: attachedUrl,
        pdf_url: pdfUrl,
        signed_at: new Date().toISOString(),
        created_by: user?.id,
      });
      if (error) throw error;

      await supabase.from("assets").update({
        current_owner_id: employee.id,
        status: "in_use",
      }).eq("id", asset.id);

      toast({ title: "הטופס נחתם ונשמר", description: "המסמך נוסף לתיק העובד" });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["handover-forms"] });
      close();
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent
        className={step === "sign" ? "max-w-5xl max-h-[95vh] overflow-y-auto" : "max-w-md"}
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="w-5 h-5 text-primary" />
            {isVirtualAsset
              ? "שיוך פריט וירטואלי"
              : step === "choose"
                ? "שיוך ציוד עם טופס חתימה"
                : "חתימה על טופס קבלת ציוד"}
          </DialogTitle>
          <DialogDescription>
            {asset ? `${asset.asset_name} (${asset.asset_code})` : ""}
            {isVirtualAsset && (
              <span className="block mt-1 text-xs">פריטים וירטואליים אינם דורשים טופס מסירה / החתמה</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {step === "choose" && (
          <div className="space-y-4 mt-2">
            {isPreassigned ? (
              <div className="rounded-lg border bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground mb-0.5">עובד משויך</div>
                <div className="text-sm font-medium">
                  {asset?.employees?.full_name ?? employee?.full_name ?? "—"}
                </div>
              </div>
            ) : (
              <div>
                <label className="text-sm font-medium mb-1 block">בחר עובד מקבל</label>
                <SearchableSelect
                  value={employeeId}
                  onChange={setEmployeeId}
                  options={(employees ?? [])
                    .filter((e: any) => e.status === "active" || e.status === "onboarding")
                    .map((e: any) => ({ value: e.id, label: `${e.full_name} (${e.employee_code})` }))}
                  placeholder="בחר עובד..."
                />
              </div>
            )}

            {isVirtualAsset ? (
              <>
                {!employeeId && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> נא לבחור עובד תחילה
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={close}>ביטול</Button>
                  <Button
                    className="flex-1"
                    disabled={!employeeId || busy}
                    onClick={handleDirectAssign}
                  >
                    {busy ? "משייך..." : "שייך"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                {!attachment && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">מסלול חתימה</label>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setMethod("portal")}
                        className={`w-full text-right p-3 rounded-lg border-2 transition-colors flex items-center gap-3 ${method === "portal" ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                      >
                        <Send className="w-5 h-5 text-primary shrink-0" />
                        <div className="flex-1">
                          <div className="font-medium text-sm">שליחה לאזור האישי בפורטל</div>
                          <div className="text-xs text-muted-foreground">העובד יחתום מתוך הפורטל שלו</div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMethod("manager_present")}
                        className={`w-full text-right p-3 rounded-lg border-2 transition-colors flex items-center gap-3 ${method === "manager_present" ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                      >
                        <PenTool className="w-5 h-5 text-primary shrink-0" />
                        <div className="flex-1">
                          <div className="font-medium text-sm">חתימה מול מנהל התפעול</div>
                          <div className="text-xs text-muted-foreground">העובד חותם כעת על המכשיר</div>
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium mb-1 block">מסמך חתום מצורף (אופציונלי)</label>
                  <label className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg text-sm cursor-pointer hover:bg-muted/70">
                    <Upload className="w-4 h-4" />
                    <span className="truncate">{attachment ? attachment.name : "בחר קובץ PDF/תמונה..."}</span>
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      className="hidden"
                      onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>

                {!employeeId && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> נא לבחור עובד תחילה
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={close}>ביטול</Button>
                  <Button
                    className="flex-1"
                    disabled={!employeeId || busy}
                    onClick={() => {
                      if (attachment) {
                        setConfirmOpen(true);
                      } else if (method === "portal") {
                        handleSendToPortal();
                      } else {
                        setStep("sign");
                      }
                    }}
                  >
                    {busy
                      ? "שומר..."
                      : attachment
                        ? "שמור"
                        : method === "portal"
                          ? "שלח לפורטל"
                          : "המשך לחתימה"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {step === "sign" && formData && (
          <div className="space-y-4 mt-2">
            <div className="border rounded-lg overflow-hidden bg-white">
              {previewUrl ? (
                <iframe src={previewUrl} title="תצוגת הטופס" className="w-full" style={{ height: "70vh", border: 0 }} />
              ) : (
                <div className="p-12 text-center text-sm text-muted-foreground">טוען תצוגת טופס...</div>
              )}
            </div>

            {attachment ? (
              <div className="rounded-lg border bg-muted/40 p-3 flex items-center gap-2 text-sm">
                <FileCheck2 className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{attachment.name}</div>
                  <div className="text-xs text-muted-foreground">
                    מסמך חתום מצורף — לא נדרשת חתימה דיגיטלית
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setAttachment(null)}>הסר</Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <SignaturePad ref={issuerSigRef} label="חתימת גורם מנפק (אופציונלי)" />
                <SignaturePad ref={receiverSigRef} label={`חתימת המושך — ${employee?.full_name ?? ""}`} />
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep("choose")}>חזור</Button>
              <Button
                className="flex-1"
                disabled={busy}
                onClick={() => {
                  if (attachment) {
                    setConfirmOpen(true);
                  } else {
                    handleManagerSign();
                  }
                }}
              >
                {busy ? "שומר..." : attachment ? "אישור ושמירה" : "שמור חתימה"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>אישור הטופס המצורף</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-right">
                <p>האם הטופס המצורף חתום על ידי העובד?</p>
                {attachmentPreview && (
                  <div className="rounded-md border overflow-hidden bg-muted/30">
                    {attachmentPreview.isImage ? (
                      <img
                        src={attachmentPreview.url}
                        alt="תצוגה מקדימה"
                        className="max-h-64 w-full object-contain"
                      />
                    ) : (
                      <div className="p-3 text-sm flex items-center gap-2">
                        <FileCheck2 className="w-4 h-4" />
                        <span className="truncate">{attachment?.name}</span>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  לאחר אישור — המסמך ייוסף לתיק העובד וישמש כראיה לקבלת הציוד.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>חזרה</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); handleManagerSign(); }}>
              {busy ? "שומר..." : "אישור ושמירה"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
