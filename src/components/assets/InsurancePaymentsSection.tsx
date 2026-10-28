import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarClock, Check, Plus, Trash2, Undo2, Split } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/feedback/ConfirmDialog";
import { IconButton } from "@/components/feedback/IconButton";
import { cn, formatDateDMY } from "@/lib/utils";
import {
  buildInstallmentDates, nextUnpaid, useInsurancePaymentMutations, useInsurancePayments, type InsurancePayment,
} from "@/hooks/useInsurancePayments";

export function InsurancePaymentsSection({ asset }: { asset: any }) {
  const { toast } = useToast();
  const { data: payments } = useInsurancePayments(asset.id);
  const { add, update, remove, setPaid } = useInsurancePaymentMutations(asset.id);
  const confirm = useConfirm();
  const [newDate, setNewDate] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [splitOpen, setSplitOpen] = useState(false);
  const [split, setSplit] = useState({ count: "12", first: "", step: "1", amount: "" });
  const [params, setParams] = useSearchParams();
  const payId = params.get("pay");
  const confirmP = payments?.find((p) => p.id === payId) ?? null;
  const next = nextUnpaid(payments);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => { if (payId && confirmP?.paid_at) toast({ title: "התשלום כבר סומן כשולם" }); }, [payId, confirmP?.paid_at]);

  const base = { asset_id: asset.id, company_id: asset.company_id };
  const err = (e: any) => toast({ title: "שגיאה", description: e?.message, variant: "destructive" });

  const addOne = () => {
    if (!newDate) return;
    add.mutate([{ ...base, due_date: newDate, amount: newAmount ? Number(newAmount) : null }], {
      onSuccess: () => { setNewDate(""); setNewAmount(""); }, onError: err,
    });
  };
  const doSplit = () => {
    const n = Number(split.count);
    if (!split.first || !n || n < 1 || n > 60) return;
    const dates = buildInstallmentDates(split.first, n, Number(split.step));
    add.mutate(dates.map((d) => ({ ...base, due_date: d, amount: split.amount ? Number(split.amount) : null })), {
      onSuccess: () => { setSplitOpen(false); toast({ title: `נוצרו ${n} תשלומים` }); }, onError: err,
    });
  };
  const removePayment = (p: InsurancePayment, i: number) => confirm({
    title: `למחוק את תשלום ${i + 1}?`,
    description: `התשלום מתאריך ${formatDateDMY(p.due_date)}${p.amount != null ? ` בסך ₪${p.amount.toLocaleString()}` : ""} יימחק, ולא תישלח עליו תזכורת.`,
    confirmLabel: "מחק תשלום",
    destructive: true,
    onConfirm: () => remove.mutateAsync(p.id),
  }).then((ok) => { if (ok) toast({ title: "התשלום נמחק" }); });
  /** Row edits save when leaving the field; say so, instead of saving silently. */
  const saved = (what: string) => ({ onSuccess: () => toast({ title: `${what} נשמר` }), onError: err });

  const markPaid = (p: InsurancePayment, paid: boolean) =>
    setPaid.mutate({ p, paid }, { onSuccess: () => toast({ title: paid ? "סומן כשולם" : "הסימון בוטל" }), onError: err });

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <CalendarClock className="w-4 h-4" aria-hidden="true" /> לוח תשלומים
        </h2>
        <Button size="sm" variant="outline" onClick={() => setSplitOpen(true)}><Split className="w-4 h-4 ml-1" />חלק לתשלומים</Button>
      </div>

      {next ? (
        <div className={cn("rounded-lg border p-3 flex items-center justify-between gap-2",
          next.due_date < today ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5")}>
          <div className="text-sm">
            <span className="font-semibold">לתשלום הבא: </span>
            {formatDateDMY(next.due_date)}{next.amount != null && ` · ₪${next.amount.toLocaleString()}`}
            {next.due_date < today && <span className="text-destructive mr-2">(באיחור)</span>}
          </div>
          <Button size="sm" onClick={() => markPaid(next, true)}><Check className="w-4 h-4 ml-1" />שולם</Button>
        </div>
      ) : payments?.length ? (
        <p className="text-sm text-muted-foreground">כל התשלומים שולמו.</p>
      ) : (
        <p className="text-sm text-muted-foreground">לא הוגדרו תשלומים. המערכת תזכיר 7 ימים לפני כל תשלום.</p>
      )}

      {!!payments?.length && (
        <p className="text-xs text-muted-foreground">שינוי תאריך או סכום בשורה נשמר ביציאה מהשדה.</p>
      )}
      {!!payments?.length && (
        <div className="divide-y divide-border border border-border rounded-lg">
          {payments.map((p, i) => (
            <div key={p.id} className={cn("flex flex-wrap items-center gap-2 p-2 text-sm", p.paid_at && "opacity-60")}>
              <span className="w-6 text-muted-foreground">{i + 1}.</span>
              <Input type="date" aria-label={`תאריך תשלום ${i + 1}`} defaultValue={p.due_date} className="h-10 w-40" disabled={!!p.paid_at}
                onBlur={(e) => e.target.value && e.target.value !== p.due_date && update.mutate({ id: p.id, due_date: e.target.value, reminder_sent_at: null } as any, saved("התאריך"))} />
              <Input type="number" aria-label={`סכום תשלום ${i + 1}`} defaultValue={p.amount ?? ""} placeholder="סכום" className="h-10 w-28" disabled={!!p.paid_at}
                onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== p.amount) update.mutate({ id: p.id, amount: v }, saved("הסכום")); }} />
              <div className="flex-1 text-xs text-muted-foreground">{p.paid_at && `שולם ${formatDateDMY(p.paid_at)}`}</div>
              {p.paid_at ? (
                <Button size="sm" variant="ghost" onClick={() => markPaid(p, false)}><Undo2 className="w-4 h-4 ml-1" />בטל</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => markPaid(p, true)}><Check className="w-4 h-4 ml-1" />שולם</Button>
              )}
              <IconButton label={`מחק תשלום ${i + 1}`} onClick={() => { void removePayment(p, i); }}>
                <Trash2 aria-hidden="true" />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 flex-wrap">
        <div><Label htmlFor={`pay-new-date-${asset.id}`} className="text-xs">תאריך תשלום</Label><Input id={`pay-new-date-${asset.id}`} type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-10 w-40" /></div>
        <div><Label htmlFor={`pay-new-amount-${asset.id}`} className="text-xs">סכום (לא חובה)</Label><Input id={`pay-new-amount-${asset.id}`} type="number" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} className="h-10 w-28" /></div>
        <Button size="sm" onClick={addOne} disabled={!newDate}><Plus className="w-4 h-4 ml-1" />הוסף תשלום</Button>
      </div>

      <Dialog open={splitOpen} onOpenChange={setSplitOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>חלוקה לתשלומים</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="split-count">מספר תשלומים</Label><Input id="split-count" type="number" min={1} max={60} value={split.count} onChange={(e) => setSplit({ ...split, count: e.target.value })} /></div>
            <div><Label htmlFor="split-first">תאריך תשלום ראשון</Label><Input id="split-first" type="date" value={split.first} onChange={(e) => setSplit({ ...split, first: e.target.value })} /></div>
            <div><Label htmlFor="split-step">תדירות</Label>
              <select id="split-step" className="w-full h-10 rounded-md border border-input bg-background px-2" value={split.step} onChange={(e) => setSplit({ ...split, step: e.target.value })}>
                <option value="1">חודשי</option><option value="2">דו-חודשי</option><option value="3">רבעוני</option><option value="6">חצי-שנתי</option>
              </select>
            </div>
            <div><Label htmlFor="split-amount">סכום לכל תשלום</Label><Input id="split-amount" type="number" value={split.amount} onChange={(e) => setSplit({ ...split, amount: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={doSplit} disabled={!split.first || add.isPending}>צור תשלומים</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmP && !confirmP.paid_at} onOpenChange={(o) => { if (!o) { params.delete("pay"); setParams(params, { replace: true }); } }}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>אישור תשלום</DialogTitle></DialogHeader>
          {confirmP && <p className="text-sm">לסמן כשולם את התשלום מתאריך {formatDateDMY(confirmP.due_date)}{confirmP.amount != null && ` בסך ₪${confirmP.amount.toLocaleString()}`}?</p>}
          <DialogFooter>
            <Button onClick={() => { if (confirmP) markPaid(confirmP, true); params.delete("pay"); setParams(params, { replace: true }); }}>
              <Check className="w-4 h-4 ml-1" />שולם
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
