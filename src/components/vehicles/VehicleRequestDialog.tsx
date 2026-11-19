import { useEffect, useMemo, useState } from "react";
import { Sparkles, Send, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileDrop } from "@/components/feedback/FileDrop";
import { FormField } from "@/components/feedback/FormField";
import { IconButton } from "@/components/feedback/IconButton";
import { useConfirm } from "@/components/feedback/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import {
  useDeleteQuote,
  useDraftQuoteRequest,
  useImportQuoteFile,
  useSaveQuote,
  useSendQuoteRequest,
  useSuppliers,
  useUpdateVehicleRequest,
  useVehicleTiers,
} from "@/hooks/useVehicles";
import { compareQuotes, REQUEST_STATUS_LABEL } from "@/domain/vehicles/quotes";
import { FUEL_OPTIONS, GEARBOX_OPTIONS, type VehicleRequest } from "@/domain/vehicles/types";
import { formatIsraelDateTime } from "@/domain/systemAccess/protocol";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const inputClass = "w-full min-h-10 px-3 bg-card border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30";
const shekel = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("he-IL")} ₪`);

interface Props {
  request: VehicleRequest | null;
  onOpenChange: (open: boolean) => void;
}

/** One car request from tier and preferences to a chosen, ordered and delivered car. */
export function VehicleRequestDialog({ request, onOpenChange }: Props) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { data: tiers = [] } = useVehicleTiers();
  const { data: suppliers = [] } = useSuppliers();
  const update = useUpdateVehicleRequest();
  const draft = useDraftQuoteRequest();
  const send = useSendQuoteRequest();
  const importFile = useImportQuoteFile();
  const saveQuote = useSaveQuote();
  const deleteQuote = useDeleteQuote();

  const [form, setForm] = useState({ tier_id: "", fuel: "", gearbox: "", models: "", notes: "", desired_date: "", period_months: 36 });
  const [mail, setMail] = useState({ subject: "", body: "" });
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!request) return;
    const p = request.preferences ?? {};
    setForm({
      tier_id: request.tier_id ?? "",
      fuel: p.fuel ?? "",
      gearbox: p.gearbox ?? "",
      models: (p.models ?? []).join(", "),
      notes: p.notes ?? "",
      desired_date: request.desired_date ?? "",
      period_months: request.period_months ?? 36,
    });
    setMail({ subject: request.quote_subject ?? "", body: request.quote_body ?? "" });
    setPicked(new Set(request.requested_supplier_ids ?? []));
  }, [request]);

  const leasing = suppliers.filter((s) => s.is_active && s.kind === "leasing");
  const tier = tiers.find((t) => t.id === (form.tier_id || request?.tier_id));
  const preferredModels = form.models.split(",").map((m) => m.trim()).filter(Boolean);
  const compared = useMemo(
    () => compareQuotes(request?.vehicle_quotes ?? [], tier?.monthly_cap ?? null, preferredModels),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [request?.vehicle_quotes, tier?.monthly_cap, form.models],
  );

  if (!request) return null;
  const emp = request.employees;
  const closed = request.status === "delivered" || request.status === "cancelled";

  const saveDetails = async () => {
    try {
      await update.mutateAsync({
        id: request.id,
        patch: {
          tier_id: form.tier_id || null,
          preferences: { fuel: form.fuel || null, gearbox: form.gearbox || null, models: preferredModels, notes: form.notes.trim() || null },
          desired_date: form.desired_date || null,
          period_months: Number(form.period_months) || 36,
        },
      });
      toast({ title: "הפרטים נשמרו" });
    } catch (e) {
      toast({ title: "הפרטים לא נשמרו", description: message(e), variant: "destructive" });
    }
  };

  const makeDraft = async () => {
    await saveDetails();
    try {
      const d = await draft.mutateAsync(request.id);
      setMail({ subject: d.subject, body: d.body });
      if (d.source === "template") toast({ title: "נוסח לפי תבנית", description: "ה-AI לא היה זמין. אפשר לערוך את הנוסח." });
    } catch (e) {
      toast({ title: "הניסוח נכשל", description: message(e), variant: "destructive" });
    }
  };

  const sendMail = () =>
    confirm({
      title: `לשלוח את הבקשה ל-${picked.size} חברות ליסינג?`,
      description: "המייל יישלח בשם החברה, והתשובות יחזרו אליך.",
      confirmLabel: "שלח",
      onConfirm: async () => {
        const res = await send.mutateAsync({ requestId: request.id, supplierIds: [...picked], subject: mail.subject, body: mail.body });
        toast({
          title: `הבקשה נשלחה ל-${res.sent} חברות`,
          description: res.failed.length ? `לא נשלח אל: ${res.failed.join(", ")}` : undefined,
          variant: res.failed.length ? "destructive" : undefined,
        });
      },
    });

  const onQuoteFiles = async (files: File[]) => {
    for (const file of files) {
      try {
        const res = await importFile.mutateAsync({ request, file, suppliers: leasing });
        toast({
          title: res.extracted ? "ההצעה נקראה" : "הקובץ נשמר",
          description: res.extracted
            ? `${res.supplierMatched ? "" : "בחרו את חברת הליסינג. "}בדקו את הפרטים בטבלה.`
            : `${res.extractError ?? "לא ניתן לקרוא את הקובץ"} — הקלידו את הפרטים בטבלה.`,
        });
      } catch (e) {
        toast({ title: `${file.name} לא נשמר`, description: message(e), variant: "destructive" });
      }
    }
  };

  const setQuoteField = (id: string, field: string, value: string) => {
    const numeric = ["monthly_price", "km_per_year", "period_months"].includes(field);
    saveQuote.mutate(
      { id, request_id: request.id, [field]: value === "" ? null : numeric ? Number(value) : value },
      { onError: (e) => toast({ title: "השינוי לא נשמר", description: message(e), variant: "destructive" }) },
    );
  };

  const setStatus = async (status: VehicleRequest["status"], extra: Partial<VehicleRequest> = {}) => {
    try {
      await update.mutateAsync({ id: request.id, patch: { status, ...extra } });
    } catch (e) {
      toast({ title: "השינוי לא נשמר", description: message(e), variant: "destructive" });
    }
  };

  return (
    <Dialog open={!!request} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>רכב ל{emp?.full_name ?? "עובד"}</DialogTitle>
          <DialogDescription>
            {[emp?.role, emp?.department].filter(Boolean).join(" · ")} · {REQUEST_STATUS_LABEL[request.status]}
          </DialogDescription>
        </DialogHeader>

        <section aria-labelledby="veh-details" className="space-y-3">
          <h3 id="veh-details" className="text-sm font-semibold">1. רמה והעדפות</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="רמת רכב" hint={tier?.monthly_cap ? `תקרה ${shekel(tier.monthly_cap)} לחודש` : undefined}>
              <select value={form.tier_id} onChange={(e) => setForm({ ...form, tier_id: e.target.value })} disabled={closed} className={inputClass}>
                <option value="">ללא רמה</option>
                {tiers.filter((t) => t.is_active || t.id === form.tier_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </FormField>
            <FormField label="הנעה">
              <select value={form.fuel} onChange={(e) => setForm({ ...form, fuel: e.target.value })} disabled={closed} className={inputClass}>
                <option value="">לא משנה</option>
                {FUEL_OPTIONS.map((f) => <option key={f}>{f}</option>)}
              </select>
            </FormField>
            <FormField label="תיבת הילוכים">
              <select value={form.gearbox} onChange={(e) => setForm({ ...form, gearbox: e.target.value })} disabled={closed} className={inputClass}>
                <option value="">לא משנה</option>
                {GEARBOX_OPTIONS.map((g) => <option key={g}>{g}</option>)}
              </select>
            </FormField>
            <FormField label="דגמים מועדפים" hint="מופרדים בפסיק">
              <input value={form.models} onChange={(e) => setForm({ ...form, models: e.target.value })} disabled={closed} className={inputClass} />
            </FormField>
            <FormField label="מסירה רצויה">
              <input type="date" value={form.desired_date} onChange={(e) => setForm({ ...form, desired_date: e.target.value })} disabled={closed} className={inputClass} />
            </FormField>
            <FormField label="תקופה (חודשים)">
              <input type="number" min={1} max={120} value={form.period_months} onChange={(e) => setForm({ ...form, period_months: Number(e.target.value) })} disabled={closed} className={inputClass} />
            </FormField>
          </div>
          <FormField label="הערות">
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} disabled={closed} className={inputClass} />
          </FormField>
          {!closed && (
            <Button size="sm" variant="outline" onClick={() => { void saveDetails(); }} loading={update.isPending} loadingText="שומר…">שמור פרטים</Button>
          )}
        </section>

        <section aria-labelledby="veh-mail" className="space-y-3 border-t border-border pt-4">
          <h3 id="veh-mail" className="text-sm font-semibold">2. בקשת הצעות מחיר</h3>
          {request.quotes_requested_at && (
            <p className="text-xs text-muted-foreground">נשלחה {formatIsraelDateTime(request.quotes_requested_at)}</p>
          )}
          {leasing.length === 0 ? (
            <p className="text-sm text-muted-foreground">עוד לא הוגדרו חברות ליסינג. הוסיפו אותן בלשונית ליסינג ורמות רכב.</p>
          ) : (
            <div className="flex flex-wrap gap-3" role="group" aria-label="חברות ליסינג">
              {leasing.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={picked.has(s.id)}
                    disabled={closed || !s.email}
                    onCheckedChange={() => setPicked((prev) => { const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}
                  />
                  {s.name}{!s.email && <span className="text-xs text-muted-foreground">(אין מייל)</span>}
                </label>
              ))}
            </div>
          )}
          <FormField label="נושא">
            <input value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} disabled={closed} className={inputClass} />
          </FormField>
          <FormField label="תוכן" hint="המייל לא כולל את שם העובד, רק את התפקיד">
            <textarea value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} rows={9} disabled={closed} className={`${inputClass} py-2`} />
          </FormField>
          {!closed && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => { void makeDraft(); }} loading={draft.isPending} loadingText="מנסח…">
                <Sparkles className="w-4 h-4" /> נסח עם AI
              </Button>
              <Button size="sm" onClick={() => { void sendMail(); }} disabled={picked.size === 0 || !mail.subject.trim() || !mail.body.trim()} loading={send.isPending} loadingText="שולח…">
                <Send className="w-4 h-4" /> שלח לחברות שנבחרו
              </Button>
            </div>
          )}
        </section>

        <section aria-labelledby="veh-quotes" className="space-y-3 border-t border-border pt-4">
          <h3 id="veh-quotes" className="text-sm font-semibold">3. הצעות והשוואה</h3>
          {!closed && (
            <FileDrop
              accept="application/pdf,image/*"
              multiple
              onFiles={(files) => { void onQuoteFiles(files); }}
              disabled={importFile.isPending}
              title={<span className="inline-flex items-center gap-1.5"><Upload className="w-4 h-4" /> גררו לכאן הצעות מחיר (PDF או תמונה)</span>}
              hint="ה-AI קורא מחיר, דגם, ק״מ, תקופה ומועד אספקה. שדה שלא נמצא נשאר ריק."
            />
          )}
          {compared.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">השוואת הצעות מחיר</caption>
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th scope="col" className="text-start font-medium py-2 px-2">חברה</th>
                    <th scope="col" className="text-start font-medium py-2 px-2">דגם</th>
                    <th scope="col" className="text-start font-medium py-2 px-2">מחיר חודשי</th>
                    <th scope="col" className="text-start font-medium py-2 px-2">ק״מ שנתי</th>
                    <th scope="col" className="text-start font-medium py-2 px-2">תקופה</th>
                    <th scope="col" className="text-start font-medium py-2 px-2">אספקה</th>
                    <th scope="col" className="text-start font-medium py-2 px-2">בתקרה</th>
                    <th scope="col" className="py-2 px-2"><span className="sr-only">פעולות</span></th>
                  </tr>
                </thead>
                <tbody>
                  {compared.map(({ quote: q, withinCap, recommended }) => (
                    <tr key={q.id} className={`border-b border-border/60 ${request.chosen_quote_id === q.id ? "bg-success/10" : recommended ? "bg-primary/5" : ""}`}>
                      <th scope="row" className="text-start font-medium py-2 px-2">
                        <select
                          value={q.supplier_id ?? ""}
                          onChange={(e) => setQuoteField(q.id, "supplier_id", e.target.value)}
                          disabled={closed}
                          aria-label="חברת הליסינג של ההצעה"
                          className="min-h-9 px-2 bg-card border border-border rounded-lg text-sm"
                        >
                          <option value="">בחרו חברה</option>
                          {leasing.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        {recommended && <div className="text-xs font-normal text-primary mt-1">מומלצת: הזולה בתוך התקרה</div>}
                      </th>
                      {(["model", "monthly_price", "km_per_year", "period_months", "delivery_date"] as const).map((f) => (
                        <td key={f} className="py-2 px-2">
                          <input
                            defaultValue={(q[f] ?? "") as string | number}
                            type={f === "delivery_date" ? "date" : f === "model" ? "text" : "number"}
                            onBlur={(e) => { if (String(q[f] ?? "") !== e.target.value) setQuoteField(q.id, f, e.target.value); }}
                            disabled={closed}
                            aria-label={{ model: "דגם", monthly_price: "מחיר חודשי", km_per_year: "ק״מ שנתי", period_months: "תקופה", delivery_date: "אספקה" }[f]}
                            className="min-h-9 w-28 px-2 bg-card border border-border rounded-lg text-sm tabular-nums"
                          />
                        </td>
                      ))}
                      <td className="py-2 px-2">{withinCap === null ? "—" : withinCap ? "כן" : <span className="text-destructive">חורג</span>}</td>
                      <td className="py-2 px-2">
                        <div className="flex gap-1">
                          {!closed && request.chosen_quote_id !== q.id && (
                            <Button size="sm" variant={recommended ? "default" : "outline"} onClick={() => { void setStatus("chosen", { chosen_quote_id: q.id }); }}>בחר</Button>
                          )}
                          {request.chosen_quote_id === q.id && <span className="text-xs text-success font-medium">נבחרה</span>}
                          {!closed && request.chosen_quote_id !== q.id && (
                            <IconButton
                              label="מחק הצעה"
                              onClick={() => { void confirm({ title: "למחוק את ההצעה?", destructive: true, confirmLabel: "מחק", onConfirm: () => deleteQuote.mutateAsync(q.id) }); }}
                            >
                              <Trash2 />
                            </IconButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!closed && (
            <Button size="sm" variant="ghost" onClick={() => saveQuote.mutate({ request_id: request.id })}>+ הצעה ידנית</Button>
          )}
        </section>

        <section aria-labelledby="veh-order" className="space-y-2 border-t border-border pt-4">
          <h3 id="veh-order" className="text-sm font-semibold">4. הזמנה ומסירה</h3>
          {request.status === "chosen" && (
            <Button size="sm" onClick={() => { void setStatus("ordered", { ordered_at: new Date().toISOString() }); }}>סמן כהוזמן</Button>
          )}
          {request.status === "ordered" && (
            <Button size="sm" onClick={() => { void setStatus("delivered", { delivered_at: new Date().toISOString() }); }}>הרכב הגיע</Button>
          )}
          {request.status === "delivered" && (
            <p className="text-sm text-muted-foreground">
              הרכב נמסר {formatIsraelDateTime(request.delivered_at)}. קלטו אותו כנכס רכב במשאבים, ובצ'קליסט הקליטה בחרו אותו בשורת הרכב ומסרו לעובד.
            </p>
          )}
          {!closed && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { void confirm({ title: "לבטל את בקשת הרכב?", destructive: true, confirmLabel: "בטל בקשה", onConfirm: () => setStatus("cancelled") }); }}
            >
              בטל בקשה
            </Button>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
