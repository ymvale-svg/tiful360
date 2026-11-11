import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, Eye, FileText, Loader2, Minus, PenLine, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/feedback/IconButton";
import { StateView } from "@/components/feedback/StateView";
import { useDirtyGuard } from "@/components/feedback/useDirtyGuard";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import { Tax101ValidationPanel } from "@/components/Tax101ValidationPanel";
import { useToast } from "@/hooks/use-toast";
import { useSubmitTax101, useTax101Context, type Tax101ContextResult } from "@/hooks/useTax101";
import { buildTax101Pdf } from "@/lib/pdf/lazy";
import { uploadFile } from "@/lib/uploadWithProgress";
import { TAX101_FIELDS, TAX101_PAGE_HEIGHT, TAX101_PAGE_WIDTH, TAX_YEAR_CELLS } from "@/lib/tax101/layout";
import { getPath, setPath } from "@/lib/tax101/paths";
import { applyChildCounts, buildTax101Prefill } from "@/lib/tax101/prefill";
import {
  emptyDependent,
  emptyEmployer,
  emptyYearChange,
  mergeTax101Form,
  type Tax101FormData,
} from "@/lib/tax101/types";
import { validateTax101 } from "@/lib/validateTax101";
import { cn } from "@/lib/utils";
import page1Url from "@/assets/forms/tax101/page-1.webp";
import page2Url from "@/assets/forms/tax101/page-2.webp";
import { Tax101FieldControl, type FieldState } from "./Tax101FieldControl";
import { Tax101AttachmentsPanel } from "./Tax101AttachmentsPanel";
import {
  attachmentRequirements,
  missingRequiredAttachments,
  sanitizeAttachments,
  type Tax101Attachment,
} from "@/lib/tax101/attachments";

const PAGE_IMAGES = [page1Url, page2Url];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Signed-in employee flow. */
  formId?: string | null;
  /** E-mailed link flow (no login). */
  token?: string | null;
  onSigned?: () => void;
}

/**
 * The official Form 101 shown as the printed page, pre-filled with everything the
 * system knows about the employee. The employee completes what is missing, then signs.
 */
export function Tax101OfficialForm({ open, onOpenChange, formId, token, onSigned }: Props) {
  const ctx = useTax101Context({ formId, token });
  const [busy, setBusy] = useState(false);
  const guard = useDirtyGuard(false, busy);

  return (
    <Dialog open={open} onOpenChange={guard(onOpenChange)}>
      <DialogContent
        dir="rtl"
        onOpenAutoFocus={(e) => {
          // Start on the title (read first by screen readers), not on the zoom buttons.
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
        }}
        className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:rounded-none"
      >
        <StateView
          loading={ctx.isLoading}
          error={ctx.error}
          onRetry={() => void ctx.refetch()}
          isEmpty={!ctx.data}
          empty={{ title: "הטופס לא נמצא", description: "ייתכן שהקישור פג תוקף או שהטופס כבר נחתם." }}
          label="טופס 101"
        >
          {ctx.data && (
            <FormEditor
              ctx={ctx.data}
              token={token ?? null}
              onBusyChange={setBusy}
              onDone={() => {
                onOpenChange(false);
                onSigned?.();
              }}
            />
          )}
        </StateView>
      </DialogContent>
    </Dialog>
  );
}

const fillRow = (arrayPath: string) => {
  if (arrayPath === "dependents") return emptyDependent();
  if (arrayPath === "year_changes") return emptyYearChange();
  if (arrayPath === "tax_coordination.additional_employers") return emptyEmployer();
  return {};
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "");

function readDraft(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function FormEditor({
  ctx,
  token,
  onBusyChange,
  onDone,
}: {
  ctx: Tax101ContextResult;
  token: string | null;
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const submit = useSubmitTax101();
  const taxYear = ctx.form.tax_year;
  const allowEditPrefilled = ctx.settings?.allow_edit_prefilled !== false;
  const draftKey = `tax101-draft:${ctx.form.id}`;

  const prefill = useMemo(
    () =>
      buildTax101Prefill({
        taxYear,
        employee: ctx.employee,
        dependents: ctx.dependents ?? [],
        employer: ctx.employer,
        settings: ctx.settings,
      }),
    [ctx, taxYear],
  );

  const [data, setData] = useState<Tax101FormData>(() => {
    let d = prefill.data;
    const stored = ctx.form.form_data;
    if (stored && typeof stored === "object" && Object.keys(stored).length > 0) d = mergeTax101Form(d, stored);
    const draft = readDraft(draftKey);
    if (draft) d = mergeTax101Form(d, draft);
    // Section א is the employer's: always the current company details.
    return { ...d, employer: prefill.data.employer };
  });

  // Uploaded attachments are recorded on the form only when it is signed; until then
  // the list lives in the local draft so reopening the form keeps them.
  const attachmentsKey = `${draftKey}:attachments`;
  const [attachments, setAttachments] = useState<Tax101Attachment[]>(() => {
    const stored = sanitizeAttachments(ctx.form.attachments, ctx.form.id);
    const draft = sanitizeAttachments(readDraft(attachmentsKey), ctx.form.id);
    return draft.length ? draft : stored;
  });

  // Keep a local draft so closing the window never loses what was typed.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(data));
        localStorage.setItem(attachmentsKey, JSON.stringify(attachments));
      } catch {
        /* storage unavailable — the form still works */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [data, attachments, draftKey, attachmentsKey]);

  const update = useCallback(
    (path: string, value: unknown) =>
      setData((prev) => {
        let next = setPath(prev, path, value, fillRow);
        if (path.startsWith("dependents.")) next = applyChildCounts(next, taxYear);
        return next;
      }),
    [taxYear],
  );

  const validation = useMemo(() => validateTax101(data), [data]);
  const errorPaths = useMemo(() => new Set(validation.errors.map((e) => e.path)), [validation]);
  const requirements = useMemo(() => attachmentRequirements(data, ctx.settings ?? {}), [data, ctx.settings]);
  const missingDocs = useMemo(() => missingRequiredAttachments(requirements, attachments), [requirements, attachments]);
  // Files of a document kind that no longer applies (credit unticked) are not sent.
  const activeAttachments = useMemo(() => {
    const kinds = new Set(requirements.map((r) => r.kind));
    return attachments.filter((a) => kinds.has(a.kind));
  }, [attachments, requirements]);

  const fieldState = (path: string): FieldState => {
    if (errorPaths.has(path)) return "missing";
    if (prefill.prefilled.has(path)) {
      return same(getPath(data, path), getPath(prefill.data, path)) ? "prefilled" : "changed";
    }
    return "plain";
  };

  // ── Zoom: fit the page to the window, larger by default on phones ─────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fitWidth, setFitWidth] = useState(800);
  const [zoom, setZoom] = useState<number | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setFitWidth(Math.max(280, Math.min(el.clientWidth - 24, 1000)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const effectiveZoom = zoom ?? (fitWidth < 640 ? 1.8 : 1);
  const pageWidth = fitWidth * effectiveZoom;
  const scale = pageWidth / TAX101_PAGE_WIDTH;

  const jumpTo = useCallback((path: string) => {
    const field = TAX101_FIELDS.find((f) => f.path === path && !f.mirror);
    if (!field) return;
    const el = document.getElementById(`t101-${field.id}`);
    el?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    window.setTimeout(() => el?.focus({ preventScroll: true }), 250);
  }, []);

  // ── Preview / sign ───────────────────────────────────────────────────────
  const [signOpen, setSignOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => onBusyChange(submitting), [submitting, onBusyChange]);

  const preview = async () => {
    setPreviewing(true);
    try {
      const blob = await buildTax101Pdf({ data, taxYear });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast({ title: "לא ניתן להציג את הטופס", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setPreviewing(false);
    }
  };

  const jumpToAttachments = useCallback(() => {
    const el = document.getElementById("t101-attachments");
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
    window.setTimeout(() => el?.focus({ preventScroll: true }), 250);
  }, []);

  const startSigning = () => {
    if (validation.ok && missingDocs.length > 0) {
      toast({
        title: `חסרים ${missingDocs.length} נספחים`,
        description: missingDocs.map((d) => d.label).join(" · "),
        variant: "destructive",
      });
      jumpToAttachments();
      return;
    }
    if (!validation.ok) {
      toast({
        title: `נותרו ${validation.errors.length} שדות להשלמה`,
        description: validation.errors[0]?.message,
        variant: "destructive",
      });
      if (validation.errors[0]) jumpTo(validation.errors[0].path);
      return;
    }
    setSignOpen(true);
  };

  const sign = async (signature: string) => {
    setSubmitting(true);
    try {
      const blob = await buildTax101Pdf({ data, taxYear, signatureDataUrl: signature, signedAt: new Date() });
      const path = `${ctx.form.company_id}/${ctx.form.id}-${Date.now()}.pdf`;
      const { error } = await uploadFile("tax-forms-101", path, blob, { contentType: "application/pdf", upsert: true });
      if (error) throw error;
      await submit.mutateAsync({
        formId: ctx.form.id,
        token,
        formData: data,
        signatureData: signature,
        pdfPath: path,
        attachments: activeAttachments,
      });
      try {
        localStorage.removeItem(draftKey);
        localStorage.removeItem(attachmentsKey);
      } catch {
        /* ignore */
      }
      toast({ title: "הטופס נחתם ונשלח למחלקת השכר" });
      setSignOpen(false);
      onDone();
    } catch (e) {
      toast({
        title: "החתימה לא נשמרה",
        description: `${e instanceof Error ? e.message : String(e)}. הנתונים שמילאת נשמרו — אפשר לנסות שוב.`,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const remaining = validation.errors.length + missingDocs.length;
  const fieldsByPage = useMemo(() => [0, 1].map((p) => TAX101_FIELDS.filter((f) => f.page === p)), []);

  return (
    <>
      <DialogHeader className="space-y-2 border-b bg-background px-4 py-3 pe-12 text-right">
        <DialogTitle data-autofocus tabIndex={-1} className="flex items-center gap-2 text-base outline-none">
          <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
          טופס 101 לשנת המס {taxYear}
        </DialogTitle>
        <DialogDescription className="text-xs">
          מילאנו עבורך את כל מה שידוע לנו. השלם/י את השדות המסומנים באדום, ובסיום חתום/חתמי.
        </DialogDescription>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <Legend className="bg-sky-100 ring-1 ring-sky-300" label="מולא מהמערכת" />
          <Legend className="bg-amber-100 ring-1 ring-amber-300" label="עודכן על ידך" />
          <Legend className="bg-red-100 ring-1 ring-red-500" label="חסר / לתיקון" />
          <div className="ms-auto flex items-center gap-1">
            <IconButton label="הקטן תצוגה" variant="ghost" size="icon" onClick={() => setZoom(Math.max(0.6, effectiveZoom - 0.2))}>
              <Minus />
            </IconButton>
            <span className="w-12 text-center tabular-nums" aria-live="polite">{Math.round(effectiveZoom * 100)}%</span>
            <IconButton label="הגדל תצוגה" variant="ghost" size="icon" onClick={() => setZoom(Math.min(2.6, effectiveZoom + 0.2))}>
              <Plus />
            </IconButton>
          </div>
        </div>
      </DialogHeader>

      <div ref={scrollRef} className="flex-1 overflow-auto bg-muted/40 py-4">
        {fieldsByPage.map((pageFields, pageIndex) => (
          <section
            key={pageIndex}
            aria-label={`עמוד ${pageIndex + 1} מתוך 2`}
            className="relative mx-auto mb-4 bg-white shadow-md"
            style={{ width: pageWidth, height: (TAX101_PAGE_HEIGHT / TAX101_PAGE_WIDTH) * pageWidth }}
          >
            <img
              src={PAGE_IMAGES[pageIndex]}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full select-none"
            />
            {pageIndex === 0 && <TaxYearCells year={taxYear} scale={scale} />}
            {pageFields.map((f) => {
              const state = fieldState(f.path);
              const readOnly =
                !!f.employerOnly || !!f.mirror || (!allowEditPrefilled && state === "prefilled");
              return (
                <Tax101FieldControl
                  key={f.id}
                  field={f}
                  value={getPath(data, f.path)}
                  scale={scale}
                  state={f.employerOnly || f.mirror ? "plain" : state}
                  readOnly={readOnly}
                  onChange={(v) => update(f.path, v)}
                />
              );
            })}
          </section>
        ))}

        <div className="mx-auto space-y-4 px-3" style={{ maxWidth: Math.min(pageWidth, 720) }}>
          <Tax101AttachmentsPanel
            companyId={ctx.form.company_id}
            formId={ctx.form.id}
            requirements={requirements}
            files={activeAttachments}
            onChange={setAttachments}
            disabled={submitting}
          />
          <Tax101ValidationPanel result={validation} onJump={jumpTo} />
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t bg-background px-4 py-3">
        <p className="text-sm" aria-live="polite">
          {remaining > 0 ? (
            <>
              נותרו <span className="font-bold tabular-nums text-destructive">{remaining}</span> פריטים להשלמה
              {missingDocs.length > 0 && <span className="text-muted-foreground"> (כולל {missingDocs.length} נספחים)</span>}
            </>
          ) : (
            <span className="inline-flex items-center gap-1 font-medium text-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> הטופס מוכן לחתימה
            </span>
          )}
        </p>
        {remaining > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => (validation.errors[0] ? jumpTo(validation.errors[0].path) : jumpToAttachments())}
          >
            לשדה הבא <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
        <div className="ms-auto flex gap-2">
          <Button variant="outline" onClick={() => void preview()} disabled={previewing}>
            {previewing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            תצוגה כ-PDF
          </Button>
          <Button onClick={startSigning}>
            <PenLine className="h-4 w-4" aria-hidden="true" />
            לחתימה ושליחה
          </Button>
        </div>
      </footer>

      <SignDialog open={signOpen} onOpenChange={setSignOpen} submitting={submitting} onSign={sign} />
    </>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block h-3 w-4 rounded-sm", className)} aria-hidden="true" />
      {label}
    </span>
  );
}

function TaxYearCells({ year, scale }: { year: number; scale: number }) {
  const { x, pitch, top, h } = TAX_YEAR_CELLS;
  return (
    <div aria-label={`שנת המס ${year}`} role="img">
      {Array.from(String(year)).map((ch, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="absolute grid place-items-center text-blue-900"
          style={{ left: (x + pitch * i) * scale, top: top * scale, width: pitch * scale, height: h * scale, fontSize: 10 * scale }}
        >
          {ch}
        </span>
      ))}
    </div>
  );
}

function SignDialog({
  open,
  onOpenChange,
  submitting,
  onSign,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting: boolean;
  onSign: (signature: string) => void;
}) {
  const sigRef = useRef<SignaturePadHandle>(null);
  const [missing, setMissing] = useState(false);
  const guard = useDirtyGuard(false, submitting);

  return (
    <Dialog open={open} onOpenChange={guard(onOpenChange)}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-5 w-5 text-primary" aria-hidden="true" />
            הצהרה וחתימה
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-foreground">
            אני מצהיר/ה כי הפרטים שמסרתי בטופס זה הינם מלאים ונכונים. ידוע לי שהשמטה או מסירת פרטים לא נכונים
            הינה עבירה על פקודת מס הכנסה. אני מתחייב/ת להודיע למעסיק על כל שינוי שיחול בפרטיי האישיים ובפרטים
            דלעיל תוך שבוע ימים מתאריך השינוי.
          </DialogDescription>
        </DialogHeader>
        <SignaturePad ref={sigRef} label="חתימת המבקש/ת" height={180} />
        {missing && (
          <p role="alert" className="text-sm font-medium text-destructive">
            יש לחתום בתוך המסגרת לפני השליחה.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            חזרה לטופס
          </Button>
          <Button
            disabled={submitting}
            onClick={() => {
              const sig = sigRef.current?.getDataUrl();
              if (!sig) {
                setMissing(true);
                return;
              }
              setMissing(false);
              onSign(sig);
            }}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            חתום ושלח
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
