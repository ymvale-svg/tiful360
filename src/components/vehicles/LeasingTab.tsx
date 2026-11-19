import { useState } from "react";
import { Car, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FormField } from "@/components/feedback/FormField";
import { StateView } from "@/components/feedback/StateView";
import { IconButton } from "@/components/feedback/IconButton";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";
import { useEmployees } from "@/hooks/useData";
import {
  useCreateVehicleRequest,
  useSaveSupplier,
  useSaveTier,
  useSuppliers,
  useTierRole,
  useVehicleRequests,
  useVehicleTiers,
} from "@/hooks/useVehicles";
import { VehicleRequestDialog } from "@/components/vehicles/VehicleRequestDialog";
import { entitledTier, REQUEST_STATUS_LABEL } from "@/domain/vehicles/quotes";
import { formatIsraelDateTime } from "@/domain/systemAccess/protocol";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const inputClass = "w-full min-h-10 px-3 bg-card border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30";
const shekel = (n: number | null) => (n === null ? "—" : `${Number(n).toLocaleString("he-IL")} ₪`);

/** Car requests, vehicle tiers with the roles entitled to them, and leasing companies. */
export function LeasingTab() {
  const { toast } = useToast();
  const { activeCompanyId } = useCompany();
  const { data: requests = [], isLoading, error, refetch } = useVehicleRequests();
  const { data: tiers = [] } = useVehicleTiers();
  const { data: employees = [] } = useEmployees();
  const create = useCreateVehicleRequest();
  const [openId, setOpenId] = useState<string | null>(null);
  const [newEmployee, setNewEmployee] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  const shown = requests.filter((r) => showClosed || (r.status !== "delivered" && r.status !== "cancelled"));
  const open = requests.find((r) => r.id === openId) ?? null;

  const startRequest = async () => {
    const emp = (employees as Array<{ id: string; role?: string | null; department?: string | null }>).find((e) => e.id === newEmployee);
    if (!emp || !activeCompanyId) return;
    const roles = tiers.flatMap((t) => (t.vehicle_tier_roles ?? []).map((r) => ({ ...r, tier_id: t.id })));
    try {
      const created = await create.mutateAsync({ company_id: activeCompanyId, employee_id: emp.id, tier_id: entitledTier(roles, emp) });
      setNewEmployee("");
      setOpenId(created.id);
    } catch (e) {
      toast({ title: "הבקשה לא נפתחה", description: message(e), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="leasing-requests" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="leasing-requests" className="text-base font-semibold">בקשות רכב</h2>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Switch checked={showClosed} onCheckedChange={setShowClosed} aria-label="הצג גם בקשות שנסגרו" />
              <span aria-hidden="true">כולל סגורות</span>
            </div>
            <div className="w-64">
              <SearchableSelect
                value={newEmployee}
                onChange={setNewEmployee}
                placeholder="עובד לבקשה חדשה"
                options={(employees as Array<{ id: string; full_name: string; status?: string }>)
                  .filter((e) => e.status === "active" || e.status === "onboarding")
                  .map((e) => ({ value: e.id, label: e.full_name }))}
              />
            </div>
            <Button size="sm" onClick={() => { void startRequest(); }} disabled={!newEmployee} loading={create.isPending} loadingText="פותח…">
              <Plus className="w-4 h-4" /> בקשת רכב
            </Button>
          </div>
        </div>
        <StateView
          loading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          isEmpty={shown.length === 0}
          label="בקשות רכב"
          empty={{ title: "אין בקשות רכב פתוחות", description: "בקשה נפתחת משורת הרכב בצ'קליסט הקליטה, או מכאן.", icon: <Car className="w-6 h-6" /> }}
        >
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">בקשות רכב</caption>
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border bg-muted/30">
                  <th scope="col" className="text-start font-medium py-2 px-3">עובד</th>
                  <th scope="col" className="text-start font-medium py-2 px-3">רמה</th>
                  <th scope="col" className="text-start font-medium py-2 px-3">מצב</th>
                  <th scope="col" className="text-start font-medium py-2 px-3">הצעות</th>
                  <th scope="col" className="text-start font-medium py-2 px-3">נפתחה</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <th scope="row" className="text-start font-medium py-2 px-3">
                      <button type="button" className="min-h-9 text-start hover:underline" onClick={() => setOpenId(r.id)}>
                        {r.employees?.full_name ?? "—"}
                      </button>
                      <div className="text-xs font-normal text-muted-foreground">{r.employees?.role ?? ""}</div>
                    </th>
                    <td className="py-2 px-3">{r.vehicle_tiers?.name ?? "—"}</td>
                    <td className="py-2 px-3">{REQUEST_STATUS_LABEL[r.status]}</td>
                    <td className="py-2 px-3 tabular-nums">{r.vehicle_quotes?.length ?? 0}</td>
                    <td className="py-2 px-3 tabular-nums whitespace-nowrap">{formatIsraelDateTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </StateView>
      </section>

      <TiersSection />
      <SuppliersSection />
      <VehicleRequestDialog request={open} onOpenChange={(o) => { if (!o) setOpenId(null); }} />
    </div>
  );
}

function TiersSection() {
  const { toast } = useToast();
  const { data: tiers = [] } = useVehicleTiers();
  const save = useSaveTier();
  const role = useTierRole();
  const [draft, setDraft] = useState({ name: "", level: 1, monthly_cap: "", allowed_models: "" });
  const [roleDraft, setRoleDraft] = useState<Record<string, string>>({});

  const add = async () => {
    try {
      await save.mutateAsync({
        name: draft.name,
        level: Number(draft.level) || 1,
        monthly_cap: draft.monthly_cap === "" ? null : Number(draft.monthly_cap),
        allowed_models: draft.allowed_models.trim() || null,
      });
      setDraft({ name: "", level: tiers.length + 2, monthly_cap: "", allowed_models: "" });
    } catch (e) {
      toast({ title: "הרמה לא נוספה", description: message(e), variant: "destructive" });
    }
  };

  const addRole = async (tierId: string) => {
    const name = roleDraft[tierId]?.trim();
    if (!name) return;
    try {
      await role.mutateAsync({ add: { tierId, roleName: name } });
      setRoleDraft((p) => ({ ...p, [tierId]: "" }));
    } catch (e) {
      toast({ title: "התפקיד לא נוסף", description: message(e), variant: "destructive" });
    }
  };

  return (
    <section aria-labelledby="leasing-tiers" className="space-y-3">
      <h2 id="leasing-tiers" className="text-base font-semibold">רמות רכב</h2>
      <p className="text-xs text-muted-foreground">התפקידים של כל רמה קובעים איזו רמה מוצעת לעובד בבקשה (לפי התפקיד בכרטיס העובד).</p>
      <ul className="space-y-2">
        {tiers.map((t) => (
          <li key={t.id} className="rounded-xl border border-border p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-medium">{t.name}</span>
                <span className="text-xs text-muted-foreground ms-2">תקרה {shekel(t.monthly_cap)} · רמה {t.level}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Switch
                  checked={t.is_active}
                  onCheckedChange={(v) => save.mutate({ id: t.id, name: t.name, is_active: v }, { onError: (e) => toast({ title: "השינוי לא נשמר", description: message(e), variant: "destructive" }) })}
                  aria-label={`${t.name} פעילה`}
                />
                <span aria-hidden="true">פעילה</span>
              </div>
            </div>
            {t.allowed_models && <p className="text-xs text-muted-foreground whitespace-pre-line">דגמים: {t.allowed_models}</p>}
            <div className="flex flex-wrap items-center gap-1.5">
              {(t.vehicle_tier_roles ?? []).map((r) => (
                <span key={r.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {r.role_name}{r.department ? ` · ${r.department}` : ""}
                  <IconButton label={`הסר את ${r.role_name} מ${t.name}`} className="h-5 w-5" onClick={() => role.mutate({ removeId: r.id })}>
                    <X />
                  </IconButton>
                </span>
              ))}
              <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); void addRole(t.id); }}>
                <input
                  value={roleDraft[t.id] ?? ""}
                  onChange={(e) => setRoleDraft((p) => ({ ...p, [t.id]: e.target.value }))}
                  placeholder="תפקיד זכאי"
                  aria-label={`תפקיד זכאי ל${t.name}`}
                  className="min-h-9 px-2 bg-card border border-border rounded-lg text-xs w-36"
                />
                <Button type="submit" size="sm" variant="outline" disabled={!roleDraft[t.id]?.trim()}>הוסף</Button>
              </form>
            </div>
          </li>
        ))}
      </ul>
      <form className="grid gap-3 sm:grid-cols-4 items-end rounded-xl border border-dashed border-border p-3" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <FormField label="שם הרמה" required>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="רמה 2" className={inputClass} />
        </FormField>
        <FormField label="תקרה חודשית (₪)">
          <input type="number" min={0} value={draft.monthly_cap} onChange={(e) => setDraft({ ...draft, monthly_cap: e.target.value })} className={inputClass} />
        </FormField>
        <FormField label="דגמים ברמה" hint="שורה לכל דגם">
          <textarea value={draft.allowed_models} onChange={(e) => setDraft({ ...draft, allowed_models: e.target.value })} rows={1} className={`${inputClass} py-2`} />
        </FormField>
        <Button type="submit" disabled={!draft.name.trim()} loading={save.isPending} loadingText="מוסיף…">
          <Plus className="w-4 h-4" /> הוסף רמה
        </Button>
      </form>
    </section>
  );
}

function SuppliersSection() {
  const { toast } = useToast();
  const { data: suppliers = [] } = useSuppliers();
  const save = useSaveSupplier();
  const [draft, setDraft] = useState({ name: "", contact_name: "", email: "", phone: "" });
  const leasing = suppliers.filter((s) => s.kind === "leasing");

  const add = async () => {
    try {
      await save.mutateAsync({ ...draft, kind: "leasing", contact_name: draft.contact_name || null, phone: draft.phone || null });
      setDraft({ name: "", contact_name: "", email: "", phone: "" });
    } catch (e) {
      toast({ title: "החברה לא נוספה", description: message(e), variant: "destructive" });
    }
  };

  return (
    <section aria-labelledby="leasing-suppliers" className="space-y-3">
      <h2 id="leasing-suppliers" className="text-base font-semibold">חברות ליסינג</h2>
      {leasing.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">חברות ליסינג</caption>
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border bg-muted/30">
                <th scope="col" className="text-start font-medium py-2 px-3">חברה</th>
                <th scope="col" className="text-start font-medium py-2 px-3">איש קשר</th>
                <th scope="col" className="text-start font-medium py-2 px-3">מייל להצעות</th>
                <th scope="col" className="text-start font-medium py-2 px-3">טלפון</th>
                <th scope="col" className="text-start font-medium py-2 px-3">פעילה</th>
              </tr>
            </thead>
            <tbody>
              {leasing.map((s) => (
                <tr key={s.id} className="border-b border-border/60">
                  <th scope="row" className="text-start font-medium py-2 px-3">{s.name}</th>
                  <td className="py-2 px-3">{s.contact_name ?? "—"}</td>
                  <td className="py-2 px-3" dir="ltr">{s.email ?? "—"}</td>
                  <td className="py-2 px-3" dir="ltr">{s.phone ?? "—"}</td>
                  <td className="py-2 px-3">
                    <Switch
                      checked={s.is_active}
                      onCheckedChange={(v) => save.mutate({ id: s.id, name: s.name, email: s.email, is_active: v }, { onError: (e) => toast({ title: "השינוי לא נשמר", description: message(e), variant: "destructive" }) })}
                      aria-label={`${s.name} פעילה`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form className="grid gap-3 sm:grid-cols-5 items-end rounded-xl border border-dashed border-border p-3" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <FormField label="שם החברה" required>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} />
        </FormField>
        <FormField label="איש קשר">
          <input value={draft.contact_name} onChange={(e) => setDraft({ ...draft, contact_name: e.target.value })} className={inputClass} />
        </FormField>
        <FormField label="מייל להצעות" required>
          <input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} dir="ltr" className={inputClass} />
        </FormField>
        <FormField label="טלפון">
          <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} dir="ltr" className={inputClass} />
        </FormField>
        <Button type="submit" disabled={!draft.name.trim() || !draft.email.trim()} loading={save.isPending} loadingText="מוסיף…">
          <Plus className="w-4 h-4" /> הוסף חברה
        </Button>
      </form>
    </section>
  );
}
