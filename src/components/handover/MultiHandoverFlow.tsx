import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SignaturePad, SignaturePadHandle } from "@/components/SignaturePad";
import {
  FileSignature, Camera, Video, Send, PenTool, Upload, X,
  ChevronLeft, ChevronRight, Loader2, FileDown, Package,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEmployees } from "@/hooks/useData";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  useProtocolTemplates, resolveTemplate, deriveProtocolTypeFromCategory, substitutePlaceholders,
} from "@/hooks/useProtocolTemplates";
import { buildPlaceholderValues } from "@/lib/handoverFields";
import { buildProtocolPdf } from "@/lib/pdf/buildProtocolPdf";
import type { ProtocolMedia } from "@/lib/pdf/types";
import { uploadProtocolFile, compressImage, describeUploadError } from "@/lib/protocolUpload";

export interface MultiAssetLike {
  id: string;
  asset_name?: string | null;
  asset_code?: string | null;
  serial_number?: string | null;
  category_id?: string | null;
  group_id?: string | null;
  company_id?: string | null;
  asset_categories?: {
    category_name?: string | null;
    protocol_type?: string | null;
  } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All selected items — must share one domain (enforced by caller). */
  assets: MultiAssetLike[];
  onAssigned?: () => void;
}

type Step = "details" | "media" | "sign";
type Mode = "on_site" | "remote_sign" | "manual_upload";

const QUICK_TEXTS = [
  "הפריטים נמסרו תקינים ובמצב עבודה מלא",
  "הציוד נמסר עם כל האביזרים הנלווים",
];

export function MultiHandoverFlow({ open, onOpenChange, assets, onAssigned }: Props) {
  const { data: employees } = useEmployees();
  const { activeCompany, activeCompanyId } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("details");
  const [mode, setMode] = useState<Mode>("on_site");
  const [employeeId, setEmployeeId] = useState("");
  const [freeText, setFreeText] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const issuerSigRef = useRef<SignaturePadHandle>(null);
  const receiverSigRef = useRef<SignaturePadHandle>(null);

  const listEmployee = (employees ?? []).find((e: any) => e.id === employeeId) as any;
  const [fullEmployee, setFullEmployee] = useState<any>(null);
  useEffect(() => {
    if (!open || !employeeId) { setFullEmployee(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("employees").select("*").eq("id", employeeId).maybeSingle();
      if (!cancelled && data) setFullEmployee(data);
    })();
    return () => { cancelled = true; };
  }, [open, employeeId]);
  const employee = fullEmployee ?? listEmployee;
  const issuerEmployee = (employees ?? []).find((e: any) => e.linked_user_id === user?.id) as any;
  const issuerName = issuerEmployee?.full_name ?? "";

  const firstAsset = assets[0] ?? null;
  const categoryName = firstAsset?.asset_categories?.category_name ?? "";

  // Template resolution from the first item's category / sub-category
  const { data: templates = [] } = useProtocolTemplates(activeCompanyId);
  const protocolType = deriveProtocolTypeFromCategory(firstAsset?.asset_categories?.protocol_type ?? "physical");
  const template = useMemo(
    () => resolveTemplate(templates, protocolType as any, activeCompanyId ?? null, firstAsset?.category_id ?? null, firstAsset?.group_id ?? null),
    [templates, protocolType, activeCompanyId, firstAsset?.category_id, firstAsset?.group_id]
  );

  useEffect(() => {
    if (!open) return;
    setStep("details");
    setMode("on_site");
    setEmployeeId("");
    setFreeText("");
    setPhotos([]); setVideoFile(null); setAttachment(null);
  }, [open]);

  /** Flattened per-item rows for the protocol PDF. */
  const itemFields = useMemo(() => {
    const rows: { key: string; label: string; value: string }[] = [];
    assets.forEach((a, i) => {
      const prefix = assets.length > 1 ? `פריט ${i + 1} — ` : "";
      rows.push({ key: `item_${i}_name`, label: `${prefix}שם פריט`, value: a.asset_name ?? "" });
      if (a.asset_code) rows.push({ key: `item_${i}_code`, label: `${prefix}מזהה`, value: a.asset_code });
      if (a.serial_number) rows.push({ key: `item_${i}_serial`, label: `${prefix}מס׳ סידורי`, value: a.serial_number });
      if (a.asset_categories?.category_name)
        rows.push({ key: `item_${i}_cat`, label: `${prefix}קטגוריה`, value: a.asset_categories.category_name });
    });
    return rows.filter((f) => f.value.trim() !== "");
  }, [assets]);

  const renderedBody = useMemo(() => {
    if (!template || !firstAsset) return null;
    return substitutePlaceholders(
      template.body_template,
      buildPlaceholderValues({
        asset: firstAsset as any,
        categoryName,
        employeeName: employee?.full_name ?? "",
        employeeIdNumber: employee?.id_number ?? "",
        companyName: activeCompany?.name ?? "",
        issuerName,
        odometer: null,
      })
    );
  }, [template, firstAsset, categoryName, employee, activeCompany?.name, issuerName]);

  const close = () => onOpenChange(false);

  const uploadFile = async (file: Blob, name: string, contentType?: string) =>
    uploadProtocolFile("handover-forms", `${activeCompanyId}/multi/${Date.now()}-${name}`, file, contentType, name);

  const uploadImage = async (file: File) => uploadFile(await compressImage(file), file.name, "image/jpeg");

  const uploadMedia = async (): Promise<ProtocolMedia[]> => {
    const out: ProtocolMedia[] = [];
    const now = new Date().toISOString();
    for (const p of photos) {
      out.push({ url: await uploadImage(p), type: "image", label: null, captured_at: now });
    }
    if (videoFile) {
      out.push({ url: await uploadFile(videoFile, videoFile.name), type: "video", label: "סרטון מסירה", captured_at: now });
    }
    return out;
  };

  const buildPdf = async (media: ProtocolMedia[], employeeSig: string | null, issuerSig: string | null) =>
    buildProtocolPdf({
      direction: "handover",
      title: template?.display_name ?? `פרוטוקול משיכה — ${assets.length} פריטים`,
      companyName: activeCompany?.name ?? "",
      companyLogoUrl: activeCompany?.logo_url ?? null,
      employeeName: employee?.full_name ?? "",
      employeeIdNumber: employee?.id_number ?? null,
      employeeDepartment: employee?.department ?? null,
      issuerName,
      issuedAt: new Date().toISOString(),
      fields: itemFields,
      bodyText: renderedBody,
      freeText: freeText || null,
      media,
      employeeSignature: employeeSig,
      issuerSignature: issuerSig,
    });

  const applyAssetsUpdate = async () => {
    for (const a of assets) {
      const { error } = await supabase
        .from("assets")
        .update({ current_owner_id: employeeId, status: "in_use" } as any)
        .eq("id", a.id);
      if (error) throw error;
    }
    try {
      await supabase.from("activity_log").insert({
        company_id: activeCompanyId,
        employee_id: employeeId,
        action: `מסירה מרובה: ${assets.length} פריטים`,
        details: `נמסרו ל${employee?.full_name ?? ""}: ${assets.map((a) => a.asset_name).filter(Boolean).join(", ")}`,
        entity_type: "asset",
        entity_id: assets[0]?.id ?? null,
        performed_by: user?.id,
      } as any);
    } catch (e) {
      console.warn("activity_log insert (multi handover) failed:", e);
    }
  };

  const insertForms = async (values: Record<string, any>, media: ProtocolMedia[]) => {
    const baseSnapshot = {
      direction: "handover",
      title: template?.display_name ?? null,
      company_name: activeCompany?.name ?? "",
      company_logo_url: activeCompany?.logo_url ?? null,
      employee_name: employee?.full_name ?? "",
      employee_id_number: employee?.id_number ?? null,
      employee_department: employee?.department ?? null,
      issuer_name: issuerName,
      issued_at: new Date().toISOString(),
      fields: itemFields,
      body_text: renderedBody,
      free_text: freeText || null,
      media,
      items: assets.map((a) => ({ id: a.id, name: a.asset_name, code: a.asset_code, serial: a.serial_number })),
    };
    for (const a of assets) {
      const { error } = await supabase.from("asset_handover_forms").insert({
        company_id: activeCompanyId,
        asset_id: a.id,
        employee_id: employeeId,
        group_id: a.group_id ?? null,
        protocol_type: protocolType,
        direction: "handover",
        delivery_method: mode,
        selected_fields: itemFields as any,
        free_text: freeText || null,
        created_by: user?.id,
        ...values,
        form_snapshot: { ...baseSnapshot, ...(values.form_snapshot ?? {}) } as any,
      } as any);
      if (error) throw error;
    }
  };

  /** One email with the combined protocol (recipient resolved server-side). */
  const sendProtocolEmail = async (pdfUrl: string | null) => {
    if (!employeeId) return;
    try {
      const { data, error } = await supabase.functions.invoke("send-handover-protocol-email", {
        body: {
          employeeId,
          idempotencyKey: `multi-handover-${Date.now()}`,
          templateData: {
            employeeName: employee?.full_name ?? "",
            companyName: activeCompany?.name ?? "",
            itemName: `${assets.length} פריטים`,
            itemCode: assets.map((a) => a.asset_code).filter(Boolean).join(", "),
            direction: "handover",
            title: template?.display_name ?? null,
            issuerName,
            issuedAt: new Date().toLocaleString("he-IL", {
              day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
            }),
            fields: itemFields.map((f) => ({ label: f.label, value: String(f.value ?? "") })),
            notes: freeText || null,
            pdfUrl,
            portalUrl: `${window.location.origin}/portal`,
          },
        },
      });
      if (error) throw error;
      if (data && data.success === false) {
        toast({
          title: "הפרוטוקול נשמר, אך לא נשלח במייל",
          description: data.reason === "no_email" ? "לעובד אין כתובת מייל בתיק העובד" : "שליחת המייל נחסמה",
        });
      }
    } catch (e) {
      console.error("protocol email failed", e);
      toast({ title: "הפרוטוקול נשמר, אך שליחת המייל נכשלה", variant: "destructive" });
    }
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["assets"] });
    qc.invalidateQueries({ queryKey: ["activity-log"] });
    qc.invalidateQueries({ queryKey: ["handover-forms"] });
    qc.invalidateQueries({ queryKey: ["pending-handover"] });
  };

  const handleSignNow = async () => {
    const receiver = receiverSigRef.current?.getDataUrl();
    const issuer = issuerSigRef.current?.getDataUrl();
    if (!receiver && !attachment) {
      toast({ title: "חסרה חתימת העובד או מסמך חתום מצורף", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const media = await uploadMedia();
      let attachedUrl: string | null = null;
      if (attachment) attachedUrl = await uploadFile(attachment, attachment.name);

      let pdfUrl: string | null = null;
      if (attachment && attachment.type === "application/pdf" && !receiver) {
        pdfUrl = attachedUrl;
      } else {
        const blob = await buildPdf(media, receiver ?? null, issuer ?? null);
        pdfUrl = await uploadFile(blob, "protocol.pdf", "application/pdf");
      }

      await insertForms({
        status: "signed",
        form_snapshot: { employee_signature: receiver, issuer_signature: issuer },
        signature_data: receiver,
        issuer_signature: issuer,
        attached_document_url: attachedUrl,
        media: media as any,
        pdf_url: pdfUrl,
        signed_at: new Date().toISOString(),
      }, media);
      await applyAssetsUpdate();
      await sendProtocolEmail(pdfUrl);

      toast({
        title: "הפרוטוקול נחתם ונשמר",
        description: `${assets.length} פריטים שויכו לעובד, המסמך נוסף לאזור האישי ונשלח במייל`,
      });
      invalidate();
      onAssigned?.();
      close();
    } catch (e: any) {
      toast({ title: "שגיאה בשמירת הפרוטוקול", description: describeUploadError(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleSendRemote = async () => {
    setBusy(true);
    try {
      const media = await uploadMedia();
      const issuer = issuerSigRef.current?.getDataUrl() ?? null;
      await insertForms({
        status: "pending",
        form_snapshot: { issuer_signature: issuer },
        issuer_signature: issuer,
        media: media as any,
      }, media);
      await applyAssetsUpdate();
      toast({ title: "נשלח לחתימה", description: `${assets.length} פרוטוקולים ממתינים לעובד בפורטל` });
      invalidate();
      onAssigned?.();
      close();
    } catch (e: any) {
      toast({ title: "שגיאה בשמירת הפרוטוקול", description: describeUploadError(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = async () => {
    try {
      const blob = await buildPdf([], null, null);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) {
      toast({ title: "שגיאה בתצוגה מקדימה", description: e.message, variant: "destructive" });
    }
  };

  if (!assets.length) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent
        dir="rtl"
        className="max-w-2xl w-[100vw] h-[100dvh] sm:h-auto sm:w-full sm:max-h-[92vh] overflow-y-auto rounded-none sm:rounded-lg p-4 sm:p-6"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <FileSignature className="w-5 h-5 text-primary" />
            מסירה מרובה — {assets.length} פריטים
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            פרוטוקול אחד חתום עבור כל הפריטים
            {template && <span className="block mt-0.5">תבנית: {template.display_name}</span>}
          </DialogDescription>
        </DialogHeader>

        <StepBar step={step} />

        {step === "details" && (
          <div className="space-y-4">
            <div>
              <Label className="text-sm mb-1.5 block">עובד מקבל</Label>
              <SearchableSelect
                value={employeeId}
                onChange={setEmployeeId}
                options={(employees ?? [])
                  .filter((e: any) => e.status === "active" || e.status === "onboarding")
                  .map((e: any) => ({ value: e.id, label: `${e.full_name} (${e.employee_code})` }))}
                placeholder="בחר עובד..."
              />
            </div>

            <div>
              <Label className="text-sm mb-2 block">הפריטים בפרוטוקול</Label>
              <div className="space-y-1.5 max-h-56 overflow-y-auto rounded-lg border p-2">
                {assets.map((a, i) => (
                  <div key={a.id} className="flex items-center gap-2 py-1 px-1 text-sm">
                    <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="font-medium">{i + 1}. {a.asset_name}</span>
                    <span className="text-muted-foreground font-mono text-xs">{a.asset_code}</span>
                    {a.serial_number && (
                      <span className="text-muted-foreground text-xs">סידורי: {a.serial_number}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm mb-1.5 block">הערות</Label>
              <Textarea value={freeText} onChange={(e) => setFreeText(e.target.value)} rows={3} dir="rtl" />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {QUICK_TEXTS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFreeText((prev) => (prev ? `${prev}\n${t}` : t))}
                    className="text-[11px] px-2 py-1 rounded-full bg-muted hover:bg-muted/70"
                  >
                    + {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={close}>ביטול</Button>
              <Button className="flex-1 gap-1" disabled={!employeeId} onClick={() => setStep("media")}>
                המשך <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {step === "media" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <FilePickerButton
                icon={<Camera className="w-4 h-4" />}
                label="צילום תמונות של הפריטים"
                accept="image/*"
                capture="environment"
                multiple
                onFiles={(files) => setPhotos((prev) => [...prev, ...files])}
              />
              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((p, i) => (
                    <div key={i} className="relative rounded-lg overflow-hidden border">
                      <img src={URL.createObjectURL(p)} alt={`תיעוד ${i + 1}`} className="w-full h-20 object-cover" />
                      <button
                        type="button"
                        onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-1 left-1 bg-background/90 rounded-full p-0.5"
                        aria-label="הסר תמונה"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <FilePickerButton
                icon={<Video className="w-4 h-4" />}
                label={videoFile ? videoFile.name : "צילום סרטון קצר (עד 60 שניות)"}
                accept="video/*"
                capture="environment"
                onFiles={(files) => setVideoFile(files[0] ?? null)}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1 gap-1" onClick={() => setStep("details")}>
                <ChevronRight className="w-4 h-4" /> חזרה
              </Button>
              <Button className="flex-1 gap-1" onClick={() => setStep("sign")}>
                המשך <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {step === "sign" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <ModeButton active={mode === "on_site"} onClick={() => setMode("on_site")} icon={<PenTool className="w-4 h-4" />} title="חתימה במקום" />
              <ModeButton active={mode === "remote_sign"} onClick={() => setMode("remote_sign")} icon={<Send className="w-4 h-4" />} title="שליחה לחתימה" />
              <ModeButton active={mode === "manual_upload"} onClick={() => setMode("manual_upload")} icon={<Upload className="w-4 h-4" />} title="העלאת מסמך חתום" />
            </div>

            <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePreview}>
              <FileDown className="w-4 h-4" /> תצוגה מקדימה של הפרוטוקול
            </Button>

            {mode !== "manual_upload" && (
              <SignaturePad ref={issuerSigRef} label="חתימת נציג התפעול" height={140} />
            )}
            {mode === "on_site" && (
              <SignaturePad ref={receiverSigRef} label="חתימת העובד המקבל" height={140} />
            )}
            {mode === "manual_upload" && (
              <FilePickerButton
                icon={<Upload className="w-4 h-4" />}
                label={attachment ? attachment.name : "בחר מסמך חתום (PDF / תמונה)"}
                accept="application/pdf,image/*"
                onFiles={(files) => setAttachment(files[0] ?? null)}
              />
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1 gap-1" onClick={() => setStep("media")}>
                <ChevronRight className="w-4 h-4" /> חזרה
              </Button>
              <Button
                className="flex-1"
                disabled={busy}
                onClick={mode === "remote_sign" ? handleSendRemote : handleSignNow}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "remote_sign" ? "שלח לחתימה" : "סיים ושמור"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StepBar({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "details", label: "פרטים" },
    { key: "media", label: "תיעוד" },
    { key: "sign", label: "חתימות" },
  ];
  const idx = steps.findIndex((s) => s.key === step);
  return (
    <div className="flex items-center gap-1.5 py-1">
      {steps.map((s, i) => (
        <div key={s.key} className="flex-1 flex items-center gap-1.5">
          <div
            className={`flex-1 h-1.5 rounded-full ${i <= idx ? "bg-primary" : "bg-muted"}`}
            aria-hidden="true"
          />
          <span className={`text-[11px] whitespace-nowrap ${i === idx ? "text-primary font-medium" : "text-muted-foreground"}`}>
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function ModeButton({ active, onClick, icon, title }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-2.5 rounded-lg border-2 text-sm flex items-center justify-center gap-2 transition-colors ${
        active ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted"
      }`}
    >
      {icon}
      {title}
    </button>
  );
}

function FilePickerButton({
  icon, label, accept, capture, multiple, onFiles,
}: {
  icon: React.ReactNode;
  label: string;
  accept: string;
  capture?: "environment" | "user";
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const id = useRef(`file-${Math.random().toString(36).slice(2)}`).current;
  return (
    <label
      htmlFor={id}
      className="flex items-center gap-2 px-3 py-2.5 bg-muted rounded-lg text-sm cursor-pointer hover:bg-muted/70 focus-within:ring-2 focus-within:ring-ring"
    >
      {icon}
      <span className="truncate">{label}</span>
      <input
        id={id}
        type="file"
        accept={accept}
        capture={capture}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.currentTarget.value = "";
        }}
      />
    </label>
  );
}
