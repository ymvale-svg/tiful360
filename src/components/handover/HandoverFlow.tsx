import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SignaturePad, SignaturePadHandle } from "@/components/SignaturePad";
import {
  FileSignature, Camera, Video, Gauge, Send, PenTool, Upload, X,
  ChevronLeft, ChevronRight, Loader2, FileDown, Save, RotateCcw, Trash2,
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
import {
  buildCandidateFields, buildPlaceholderValues, DEFAULT_FIELD_KEYS, type HandoverAssetLike,
} from "@/lib/handoverFields";
import { buildProtocolPdf } from "@/lib/pdf/lazy";
import type { ProtocolDirection, ProtocolMedia } from "@/lib/pdf/types";
import { uploadProtocolFile, compressImage, describeUploadError } from "@/lib/protocolUpload";
import { compressVideo, VIDEO_TARGET_BYTES } from "@/lib/videoCompress";
import {
  saveHandoverDraft, loadHandoverDraft, deleteHandoverDraft, draftKeyForAsset, formatDraftTime,
  type HandoverDraft,
} from "@/lib/handoverDraft";


interface AssetLike extends HandoverAssetLike {
  id: string;
  company_id?: string | null;
  category_id?: string | null;
  group_id?: string | null;
  current_owner_id?: string | null;
  asset_categories?: {
    category_name?: string | null;
    skip_handover_form?: boolean | null;
    skip_return_form?: boolean | null;
    protocol_type?: string | null;
    protocol_field_defaults?: string[] | null;
  } | null;
  employees?: { full_name?: string | null } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetLike | null;
  /** handover (default) or return of the item. */
  direction?: ProtocolDirection;
  defaultEmployeeId?: string;
  onAssigned?: () => void;
}

type Step = "details" | "media" | "sign";
type Mode = "on_site" | "remote_sign" | "manual_upload";

const QUICK_TEXTS = [
  "הפריט נמסר תקין ובמצב עבודה מלא",
  "הרכב נמסר נקי וללא נזקים גלויים",
  "חסר מטען / אביזר נלווה",
  "נמסרו מפתחות רזרביים",
];

export function HandoverFlow({ open, onOpenChange, asset: assetProp, direction = "handover", defaultEmployeeId, onAssigned }: Props) {
  const { data: employees } = useEmployees();
  const { activeCompany, activeCompanyId } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  /** Callers pass partial asset objects; load the full row so every detail (km, plate, custom fields…) reaches the protocol. */
  const [fullAsset, setFullAsset] = useState<AssetLike | null>(null);
  useEffect(() => {
    if (!open || !assetProp?.id) { setFullAsset(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("assets")
        .select("*, asset_categories(category_name, skip_handover_form, skip_return_form, protocol_type, protocol_field_defaults)")
        .eq("id", assetProp.id)
        .maybeSingle();
      if (!cancelled && data) setFullAsset(data as any);
    })();
    return () => { cancelled = true; };
  }, [open, assetProp?.id]);

  const asset = (fullAsset ?? assetProp) as AssetLike | null;

  const isReturn = direction === "return";
  const preassignedOwnerId = asset?.current_owner_id ?? "";

  const [step, setStep] = useState<Step>("details");
  const [mode, setMode] = useState<Mode>("on_site");
  const [employeeId, setEmployeeId] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [odometer, setOdometer] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [odometerPhoto, setOdometerPhoto] = useState<File | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [foundDraft, setFoundDraft] = useState<HandoverDraft | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);


  const issuerSigRef = useRef<SignaturePadHandle>(null);
  const receiverSigRef = useRef<SignaturePadHandle>(null);

  const listEmployee = (employees ?? []).find((e: any) => e.id === employeeId) as any;
  /** The public employees list omits sensitive fields (id number); load the full record for the protocol. */
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


  const categoryName = asset?.asset_categories?.category_name ?? "";
  const isVehicle = asset?.asset_categories?.protocol_type === "vehicle" || !!asset?.license_plate;
  const skipsForm = isReturn
    ? asset?.asset_categories?.skip_return_form === true
    : asset?.asset_categories?.skip_handover_form === true;

  // ---- Template resolution (sub-category → category → company → global) ----
  const { data: templates = [] } = useProtocolTemplates(activeCompanyId);
  const baseProtocolType = deriveProtocolTypeFromCategory(asset?.asset_categories?.protocol_type ?? "physical");
  const protocolType = isReturn
    ? (baseProtocolType === "virtual" ? "return_virtual" : "return_physical")
    : baseProtocolType;
  const template = useMemo(
    () => resolveTemplate(templates, protocolType as any, activeCompanyId ?? null, asset?.category_id ?? null, asset?.group_id ?? null),
    [templates, protocolType, activeCompanyId, asset?.category_id, asset?.group_id]
  );

  const candidateFields = useMemo(
    () => (asset ? buildCandidateFields(asset, categoryName) : []),
    [asset, categoryName]
  );

  // Init on open
  useEffect(() => {
    if (!open) return;
    setStep("details");
    setMode("on_site");
    setEmployeeId(preassignedOwnerId || defaultEmployeeId || "");
    setFreeText("");
    setOdometer(asset?.current_km != null ? String(asset.current_km) : "");
    setPhotos([]); setVideoFile(null); setOdometerPhoto(null); setAttachment(null);
    const defaults =
      (template?.field_defaults && template.field_defaults.length ? template.field_defaults : null) ??
      (asset?.asset_categories?.protocol_field_defaults?.length
        ? asset.asset_categories.protocol_field_defaults
        : null) ??
      DEFAULT_FIELD_KEYS;
    setSelectedKeys(candidateFields.filter((f) => defaults.includes(f.key)).map((f) => f.key));
    setVideoProgress(null);
    setDraftSavedAt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, asset?.id, template?.id, fullAsset]);

  // ---- Draft (save mid-process / resume) ----
  const draftKey = asset?.id ? draftKeyForAsset(asset.id, direction) : null;

  useEffect(() => {
    if (!open || !draftKey) { setFoundDraft(null); return; }
    let cancelled = false;
    (async () => {
      const d = await loadHandoverDraft(draftKey);
      if (!cancelled) setFoundDraft(d);
    })();
    return () => { cancelled = true; };
  }, [open, draftKey]);

  const handleSaveDraft = async () => {
    if (!draftKey) return;
    await saveHandoverDraft({
      key: draftKey,
      savedAt: new Date().toISOString(),
      label: `${asset?.asset_name ?? ""} ${asset?.asset_code ? `(${asset.asset_code})` : ""}`.trim(),
      state: { step, mode, employeeId, selectedKeys, freeText, odometer },
      photos,
      video: videoFile,
      odometerPhoto,
    });
    setDraftSavedAt(new Date().toISOString());
    setFoundDraft(null);
    toast({ title: "הטיוטה נשמרה", description: "אפשר להמשיך את המסירה מאוחר יותר מאותו פריט" });
  };

  const restoreDraft = () => {
    if (!foundDraft) return;
    const s = foundDraft.state ?? {};
    setStep((s.step as Step) ?? "details");
    setMode((s.mode as Mode) ?? "on_site");
    if (s.employeeId) setEmployeeId(s.employeeId);
    if (Array.isArray(s.selectedKeys)) setSelectedKeys(s.selectedKeys);
    setFreeText(s.freeText ?? "");
    setOdometer(s.odometer ?? "");
    setPhotos(foundDraft.photos ?? []);
    setVideoFile(foundDraft.video ?? null);
    setOdometerPhoto(foundDraft.odometerPhoto ?? null);
    setFoundDraft(null);
    toast({ title: "הטיוטה שוחזרה" });
  };

  const discardDraft = async () => {
    if (draftKey) await deleteHandoverDraft(draftKey);
    setFoundDraft(null);
  };




  const toggleKey = (key: string) =>
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const selectedFields = candidateFields.filter((f) => selectedKeys.includes(f.key));

  const renderedBody = useMemo(() => {
    if (!template || !asset) return null;
    return substitutePlaceholders(
      template.body_template,
      buildPlaceholderValues({
        asset,
        categoryName,
        employeeName: employee?.full_name ?? "",
        employeeIdNumber: employee?.id_number ?? "",
        companyName: activeCompany?.name ?? "",
        issuerName,
        odometer: odometer ? Number(odometer) : null,
      })
    );
  }, [template, asset, categoryName, employee, activeCompany?.name, issuerName, odometer]);

  const close = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    onOpenChange(false);
  };

  // ---- Uploads ----
  const uploadFile = async (file: Blob, name: string, contentType?: string) =>
    uploadProtocolFile(
      "handover-forms",
      `${activeCompanyId}/${asset!.id}/${Date.now()}-${name}`,
      file,
      contentType,
      name
    );

  const uploadImage = async (file: File) => uploadFile(await compressImage(file), file.name, "image/jpeg");

  const uploadMedia = async (): Promise<ProtocolMedia[]> => {
    const out: ProtocolMedia[] = [];
    const now = new Date().toISOString();
    if (odometerPhoto) {
      out.push({ url: await uploadImage(odometerPhoto), type: "image", label: 'צילום מד ק"מ', captured_at: now });
    }
    for (const p of photos) {
      out.push({ url: await uploadImage(p), type: "image", label: null, captured_at: now });
    }
    if (videoFile) {
      setVideoProgress(0);
      try {
        const compressed = await compressVideo(videoFile, VIDEO_TARGET_BYTES, (r) => setVideoProgress(r));
        out.push({
          url: await uploadFile(compressed.blob, compressed.fileName, compressed.contentType),
          type: "video",
          label: "סרטון מסירה",
          captured_at: now,
        });
      } finally {
        setVideoProgress(null);
      }
    }

    return out;
  };

  const buildPdf = async (media: ProtocolMedia[], employeeSig: string | null, issuerSig: string | null) =>
    buildProtocolPdf({
      direction,
      title: template?.display_name ?? (isReturn ? "פרוטוקול הזדכות" : "פרוטוקול משיכה"),
      companyName: activeCompany?.name ?? "",
      companyLogoUrl: activeCompany?.logo_url ?? null,
      employeeName: employee?.full_name ?? "",
      employeeIdNumber: employee?.id_number ?? null,
      employeeDepartment: employee?.department ?? null,
      issuerName,
      issuedAt: new Date().toISOString(),
      fields: [
        ...selectedFields,
        ...(isVehicle && odometer ? [{ key: "odometer_now", label: 'ק"מ במעמד המסירה', value: odometer }] : []),
      ],
      bodyText: renderedBody,
      freeText: freeText || null,
      media,
      employeeSignature: employeeSig,
      issuerSignature: issuerSig,
    });

  const applyAssetUpdate = async () => {
    const patch: Record<string, any> = isReturn
      ? { current_owner_id: null, status: "in_stock" }
      : { current_owner_id: employeeId, status: "in_use" };
    if (isVehicle && odometer) patch.current_km = Number(odometer);
    const { error } = await supabase.from("assets").update(patch as any).eq("id", asset!.id);
    if (error) throw error;

    try {
      await supabase.from("activity_log").insert({
        company_id: activeCompanyId,
        employee_id: employeeId || null,
        action: isReturn
          ? `הזדכות ציוד: ${asset?.asset_name ?? ""}`
          : `הזנת ציוד לעובד: ${asset?.asset_name ?? ""}`,
        details: isReturn
          ? `${employee?.full_name ?? ""} החזיר/ה את הפריט למלאי`
          : `נמסר ל${employee?.full_name ?? ""}`,
        entity_type: "asset",
        entity_id: asset!.id,
        performed_by: user?.id,
      } as any);
    } catch (e) {
      console.warn("activity_log insert (handover) failed:", e);
    }
  };


  const insertForm = async (values: Record<string, any>) => {
    const { error } = await supabase.from("asset_handover_forms").insert({
      company_id: activeCompanyId,
      asset_id: asset!.id,
      employee_id: employeeId,
      group_id: asset?.group_id ?? null,
      protocol_type: protocolType,
      direction,
      delivery_method: mode,
      selected_fields: selectedFields as any,
      free_text: freeText || null,
      odometer_km: isVehicle && odometer ? Number(odometer) : null,
      created_by: user?.id,
      ...values,
    } as any);
    if (error) throw error;
  };

  const snapshot = (media: ProtocolMedia[]) => ({
    direction,
    title: template?.display_name ?? null,
    company_name: activeCompany?.name ?? "",
    company_logo_url: activeCompany?.logo_url ?? null,
    employee_name: employee?.full_name ?? "",
    employee_id_number: employee?.id_number ?? null,
    employee_department: employee?.department ?? null,
    issuer_name: issuerName,
    issued_at: new Date().toISOString(),
    fields: selectedFields,
    body_text: renderedBody,
    free_text: freeText || null,
    media,
  });

  /** Email the signed protocol to the receiving employee (recipient is resolved server-side). */
  const sendProtocolEmail = async (pdfUrl: string | null) => {
    if (!employeeId) return;
    try {
      const { data, error } = await supabase.functions.invoke("send-handover-protocol-email", {

        body: {
          employeeId,
          idempotencyKey: `handover-${asset!.id}-${employeeId}-${Date.now()}`,

          templateData: {
            employeeName: employee?.full_name ?? "",
            companyName: activeCompany?.name ?? "",
            itemName: asset?.asset_name ?? "",
            itemCode: asset?.asset_code ?? "",
            direction,
            title: template?.display_name ?? null,
            issuerName,
            issuedAt: new Date().toLocaleString("he-IL", {
              day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
            }),
            fields: [
              ...selectedFields,
              ...(isVehicle && odometer ? [{ label: 'ק"מ במעמד המסירה', value: odometer }] : []),
            ].map((f: any) => ({ label: f.label, value: String(f.value ?? "") })),
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


  // ---- Actions ----
  const handleDirectAssign = async () => {
    setBusy(true);
    try {
      await applyAssetUpdate();
      toast({ title: isReturn ? "הפריט הוחזר" : "הפריט שויך", description: "קטגוריה זו אינה דורשת פרוטוקול חתום" });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["activity-log"] });
      onAssigned?.();
      close();
    } catch (e: any) {
      toast({ title: "שגיאה בשמירת הפרוטוקול", description: describeUploadError(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
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

      await insertForm({
        status: "signed",
        form_snapshot: { ...snapshot(media), employee_signature: receiver, issuer_signature: issuer } as any,
        signature_data: receiver,
        issuer_signature: issuer,
        attached_document_url: attachedUrl,
        media: media as any,
        pdf_url: pdfUrl,
        signed_at: new Date().toISOString(),
      });
      await applyAssetUpdate();
      await sendProtocolEmail(pdfUrl);

      toast({ title: "הפרוטוקול נחתם ונשמר", description: "המסמך נוסף לאזור האישי, לכרטיס הפריט ונשלח במייל לעובד" });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["activity-log"] });
      qc.invalidateQueries({ queryKey: ["handover-forms"] });
      qc.invalidateQueries({ queryKey: ["pending-handover"] });
      if (draftKey) await deleteHandoverDraft(draftKey);
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
      await insertForm({
        status: "pending",
        form_snapshot: { ...snapshot(media), issuer_signature: issuer } as any,
        issuer_signature: issuer,
        media: media as any,
      });
      await applyAssetUpdate();
      toast({ title: "נשלח לחתימה", description: "הפרוטוקול ממתין לעובד בפורטל" });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["activity-log"] });
      qc.invalidateQueries({ queryKey: ["handover-forms"] });
      qc.invalidateQueries({ queryKey: ["pending-handover"] });
      if (draftKey) await deleteHandoverDraft(draftKey);
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

  if (!asset) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent
        dir="rtl"
        className="max-w-2xl w-[100vw] h-[100dvh] sm:h-auto sm:w-full sm:max-h-[92vh] overflow-y-auto rounded-none sm:rounded-lg p-4 sm:p-6"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <FileSignature className="w-5 h-5 text-primary" />
            {isReturn ? "הזדכות על פריט" : "מסירת פריט"}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {asset.asset_name} ({asset.asset_code})
            {template && <span className="block mt-0.5">תבנית: {template.display_name}</span>}
          </DialogDescription>
        </DialogHeader>

        {skipsForm ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">קטגוריה זו מוגדרת ללא פרוטוקול חתום.</p>
            {!preassignedOwnerId && !isReturn && (
              <EmployeePicker employees={employees} value={employeeId} onChange={setEmployeeId} />
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={close}>ביטול</Button>
              <Button className="flex-1" disabled={busy || (!isReturn && !employeeId)} onClick={handleDirectAssign}>
                {busy ? "שומר..." : isReturn ? "החזר למלאי" : "שייך"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {foundDraft && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
                <p className="text-sm">
                  נמצאה טיוטה שמורה מ־{formatDraftTime(foundDraft.savedAt)}. לשחזר ולהמשיך מהמקום שבו הפסקת?
                </p>
                <div className="flex gap-2">
                  <Button size="sm" className="gap-1.5" onClick={restoreDraft}>
                    <RotateCcw className="w-4 h-4" /> שחזר טיוטה
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={discardDraft}>
                    <Trash2 className="w-4 h-4" /> מחק טיוטה
                  </Button>
                </div>
              </div>
            )}

            <StepBar step={step} />

            <div className="flex items-center justify-between gap-2 -mt-1">
              <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={handleSaveDraft}>
                <Save className="w-4 h-4" /> שמור כטיוטה
              </Button>
              {draftSavedAt && (
                <span className="text-[11px] text-muted-foreground">נשמר {formatDraftTime(draftSavedAt)}</span>
              )}
            </div>



            {step === "details" && (
              <div className="space-y-4">
                {preassignedOwnerId || isReturn ? (
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground mb-0.5">{isReturn ? "מחזיר" : "עובד משויך"}</div>
                    <div className="text-sm font-medium">
                      {asset.employees?.full_name ?? employee?.full_name ?? "—"}
                    </div>
                  </div>
                ) : (
                  <EmployeePicker employees={employees} value={employeeId} onChange={setEmployeeId} />
                )}

                <div>
                  <Label className="text-sm mb-2 block">פרטים שיופיעו בפרוטוקול</Label>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto rounded-lg border p-2">
                    {candidateFields.map((f) => (
                      <label key={f.key} className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted/60 cursor-pointer">
                        <Checkbox checked={selectedKeys.includes(f.key)} onCheckedChange={() => toggleKey(f.key)} />
                        <span className="text-sm font-medium min-w-[110px]">{f.label}</span>
                        <span className="text-sm text-muted-foreground truncate">{f.value}</span>
                      </label>
                    ))}
                    {candidateFields.length === 0 && (
                      <p className="text-xs text-muted-foreground p-2">אין פרטים זמינים בכרטיס הפריט</p>
                    )}
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
                {isVehicle && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <Label className="text-sm flex items-center gap-1.5">
                      <Gauge className="w-4 h-4 text-primary" /> קריאת מד ק"מ
                    </Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={odometer}
                      onChange={(e) => setOdometer(e.target.value)}
                      placeholder="לדוגמה: 84500"
                    />
                    <FilePickerButton
                      icon={<Camera className="w-4 h-4" />}
                      label={odometerPhoto ? odometerPhoto.name : 'צלם את מד הק"מ'}
                      accept="image/*"
                      capture="environment"
                      onFiles={(files) => setOdometerPhoto(files[0] ?? null)}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <FilePickerButton
                    icon={<Camera className="w-4 h-4" />}
                    label="צילום תמונות של הפריט"
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
                  <p className="text-[11px] text-muted-foreground">
                    הסרטון יכווץ אוטומטית לכ‑3 מ"ב לפני השמירה.
                  </p>
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
                  <SignaturePad
                    ref={receiverSigRef}
                    label={isReturn ? "חתימת העובד המחזיר" : "חתימת העובד המקבל"}
                    height={140}
                  />
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
                    {busy ? (
                      videoProgress !== null
                        ? <span className="text-xs">מכווץ סרטון… {Math.round(videoProgress * 100)}%</span>
                        : <Loader2 className="w-4 h-4 animate-spin" />
                    ) : mode === "remote_sign" ? "שלח לחתימה" : "סיים ושמור"}

                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EmployeePicker({ employees, value, onChange }: { employees: any[] | undefined; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-sm mb-1.5 block">עובד</Label>
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={(employees ?? [])
          .filter((e: any) => e.status === "active" || e.status === "onboarding")
          .map((e: any) => ({ value: e.id, label: `${e.full_name} (${e.employee_code})` }))}
        placeholder="בחר עובד..."
      />
    </div>
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
