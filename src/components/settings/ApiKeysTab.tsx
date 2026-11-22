import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Copy, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { DateInput } from "@/components/ui/date-input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FormField } from "@/components/feedback/FormField";
import { ListSkeleton, StateView } from "@/components/feedback/StateView";
import { useConfirm } from "@/components/feedback/ConfirmDialog";
import { formatDateDMY } from "@/lib/utils";

type Scope = "read" | "write" | "delete" | "payroll" | "identity";

const SCOPES: { key: Scope; label: string; hint: string }[] = [
  { key: "read", label: "קריאה", hint: "להציג רשימות ורשומות" },
  { key: "write", label: "הוספה ועריכה", hint: "ליצור ולשנות רשומות" },
  { key: "delete", label: "מחיקה", hint: "למחוק רשומות לפי רשימת מזהים מדויקת" },
  { key: "payroll", label: "שכר", hint: "תלושי שכר ונתוני שכר" },
  { key: "identity", label: "פרטים מזהים", hint: "ת\"ז, תאריך לידה, כתובת, מצב משפחתי וקופת חולים של עובדים" },
];

const SCOPE_LABEL: Record<string, string> = Object.fromEntries(SCOPES.map((s) => [s.key, s.label]));

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  owner_user_id: string | null;
  scopes: Scope[];
  expires_at: string | null;
  company_id: string;
}

const API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/open-api`;

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The visible part of the key: enough to recognise it in a list, never enough to use it. */
const keyPrefix = (raw: string) => raw.slice(0, 12);

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDateDMY(value)}, ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <Input readOnly dir="ltr" value={value} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`העתקת ${label}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              toast.error("ההעתקה נכשלה", { description: "סמנו את הטקסט והעתיקו ידנית." });
            }
          }}
        >
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export function ApiKeysTab() {
  const { user, isSuperAdmin } = useAuth();
  const { activeCompanyId } = useCompany();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ApiKey | null>(null);
  const [label, setLabel] = useState("");
  const [scopes, setScopes] = useState<Scope[]>(["read"]);
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [expiry, setExpiry] = useState("");
  const [active, setActive] = useState(true);
  const [revealed, setRevealed] = useState<string | null>(null);

  const [logKeyFilter, setLogKeyFilter] = useState("all");
  const [logStatusFilter, setLogStatusFilter] = useState("all");

  const keysQuery = useQuery({
    queryKey: ["api-keys"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("id, name, key_prefix, is_active, created_at, last_used_at, owner_user_id, scopes, expires_at, company_id")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ApiKey[];
    },
  });

  const companiesQuery = useQuery({
    queryKey: ["api-keys-companies"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, name").order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const grantsQuery = useQuery({
    queryKey: ["api-key-companies"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("api_key_companies").select("api_key_id, company_id");
      if (error) throw new Error(error.message);
      return (data ?? []) as { api_key_id: string; company_id: string }[];
    },
  });

  const logQuery = useQuery({
    queryKey: ["api-request-log"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_request_log")
        .select("id, key_prefix, resource, action, status, error, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return (data ?? []) as {
        id: string; key_prefix: string | null; resource: string; action: string;
        status: string; error: string | null; created_at: string;
      }[];
    },
  });

  const companyNames = useMemo(
    () => new Map((companiesQuery.data ?? []).map((c) => [c.id, c.name])),
    [companiesQuery.data],
  );

  const companiesForKey = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const g of grantsQuery.data ?? []) {
      const list = map.get(g.api_key_id) ?? [];
      list.push(g.company_id);
      map.set(g.api_key_id, list);
    }
    return map;
  }, [grantsQuery.data]);

  const openCreate = () => {
    setEditing(null);
    setLabel("");
    setScopes(["read"]);
    setCompanyIds(activeCompanyId ? [activeCompanyId] : []);
    setExpiry("");
    setActive(true);
    setDialogOpen(true);
  };

  const openEdit = (key: ApiKey) => {
    setEditing(key);
    setLabel(key.name);
    setScopes(key.scopes ?? ["read"]);
    setCompanyIds(companiesForKey.get(key.id) ?? (key.company_id ? [key.company_id] : []));
    setExpiry(key.expires_at ? String(key.expires_at).slice(0, 10) : "");
    setActive(key.is_active);
    setDialogOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!label.trim()) throw new Error("חסר שם למפתח.");
      if (!scopes.length) throw new Error("יש לבחור לפחות הרשאה אחת.");
      if (!companyIds.length) throw new Error("יש לבחור לפחות חברה אחת.");
      if (!user?.id) throw new Error("לא ניתן לזהות את המשתמש היוצר.");

      const expiresAt = expiry ? `${expiry}T23:59:59+03:00` : null;

      if (editing) {
        const { error } = await supabase
          .from("api_keys")
          .update({
            name: label.trim(),
            scopes,
            expires_at: expiresAt,
            is_active: active,
            company_id: companyIds[0],
          })
          .eq("id", editing.id);
        if (error) throw new Error(error.message);

        const { error: delErr } = await supabase.from("api_key_companies").delete().eq("api_key_id", editing.id);
        if (delErr) throw new Error(delErr.message);
        const { error: insErr } = await supabase
          .from("api_key_companies")
          .insert(companyIds.map((c) => ({ api_key_id: editing.id, company_id: c })));
        if (insErr) throw new Error(insErr.message);
        return null;
      }

      const raw = "tf360_" + Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0")).join("");
      const hash = await sha256Hex(raw);

      const { data, error } = await supabase
        .from("api_keys")
        .insert({
          name: label.trim(),
          key_hash: hash,
          key_prefix: keyPrefix(raw),
          is_active: true,
          owner_user_id: user.id,
          scopes,
          expires_at: expiresAt,
          company_id: companyIds[0],
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      const { error: insErr } = await supabase
        .from("api_key_companies")
        .insert(companyIds.map((c) => ({ api_key_id: (data as { id: string }).id, company_id: c })));
      if (insErr) throw new Error(insErr.message);
      return raw;
    },
    onSuccess: (raw) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["api-key-companies"] });
      setDialogOpen(false);
      if (raw) setRevealed(raw);
      else toast.success("המפתח נשמר");
    },
    onError: (e: Error) => toast.error("השמירה נכשלה", { description: e.message }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("api_keys").update({ is_active: value }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
    onError: (e: Error) => toast.error("השינוי נכשל", { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_keys").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["api-key-companies"] });
      toast.success("המפתח נמחק");
    },
    onError: (e: Error) => toast.error("המחיקה נכשלה", { description: e.message }),
  });

  const askDelete = async (key: ApiKey) => {
    const ok = await confirm({
      title: "למחוק את המפתח?",
      description: `המפתח "${key.name}" יימחק, וכל חיבור שמשתמש בו יפסיק לעבוד מיד. אין דרך לשחזר אותו.`,
      confirmLabel: "למחוק מפתח",
      destructive: true,
    });
    if (ok) remove.mutate(key.id);
  };

  const logRows = (logQuery.data ?? []).filter((row) => {
    if (logKeyFilter !== "all" && (row.key_prefix ?? "") !== logKeyFilter) return false;
    if (logStatusFilter !== "all" && row.status !== logStatusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">מפתחות API</h2>
          <p className="text-sm text-muted-foreground">
            מפתח אחד = אפליקציה או אתר חיצוני. כל מפתח מורשה רק לחברות שנבחרו לו, ורואה רק מה שבעליו רואה.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" /> מפתח חדש
        </Button>
      </div>

      <StateView
        loading={keysQuery.isLoading}
        error={keysQuery.error ? (keysQuery.error as Error).message : null}
        onRetry={() => keysQuery.refetch()}
        isEmpty={(keysQuery.data ?? []).length === 0}
        empty={{
          icon: <KeyRound className="h-6 w-6" />,
          title: "אין עדיין מפתחות",
          description: "צרו מפתח ראשון כדי לחבר את האפליקציה או האתר שלכם לנתוני המערכת.",
          action: <Button onClick={openCreate}>מפתח חדש</Button>,
        }}
        skeleton={<ListSkeleton rows={3} />}
      >
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table dir="rtl">
            <TableHeader>
              <TableRow>
                <TableHead>שם</TableHead>
                <TableHead>מפתח</TableHead>
                <TableHead>חברות</TableHead>
                <TableHead>הרשאות</TableHead>
                <TableHead>פעיל</TableHead>
                <TableHead>שימוש אחרון</TableHead>
                <TableHead>תוקף</TableHead>
                <TableHead className="w-20"> </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(keysQuery.data ?? []).map((key) => {
                const ids = companiesForKey.get(key.id) ?? (key.company_id ? [key.company_id] : []);
                const expired = !!key.expires_at && new Date(key.expires_at).getTime() < Date.now();
                return (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell dir="ltr" className="font-mono text-xs">{key.key_prefix}…</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {ids.map((id) => (
                          <Badge key={id} variant="secondary" className="font-normal">
                            {companyNames.get(id) ?? "חברה"}
                          </Badge>
                        ))}
                        {ids.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(key.scopes ?? []).map((s) => (
                          <Badge key={s} variant="outline" className="font-normal">{SCOPE_LABEL[s] ?? s}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={key.is_active}
                        disabled={toggleActive.isPending}
                        onCheckedChange={(v) => toggleActive.mutate({ id: key.id, value: v })}
                        aria-label={`הפעלת מפתח ${key.name}`}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(key.last_used_at)}</TableCell>
                    <TableCell className="text-xs">
                      {key.expires_at
                        ? <span className={expired ? "text-destructive" : "text-muted-foreground"}>{formatDateDMY(key.expires_at)}</span>
                        : <span className="text-muted-foreground">ללא תוקף</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(key)} aria-label={`עריכת מפתח ${key.name}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => askDelete(key)}
                          aria-label={`מחיקת מפתח ${key.name}`}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </StateView>

      {/* ── recent calls ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">קריאות אחרונות</h2>
            <p className="text-sm text-muted-foreground">
              כל קריאה נרשמת, מוצלחת או לא. היומן לא ניתן לשינוי או למחיקה.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={logKeyFilter} onValueChange={setLogKeyFilter}>
              <SelectTrigger className="w-48" aria-label="סינון לפי מפתח">
                <SelectValue placeholder="כל המפתחות" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל המפתחות</SelectItem>
                {(keysQuery.data ?? []).map((k) => (
                  <SelectItem key={k.id} value={k.key_prefix}>{k.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={logStatusFilter} onValueChange={setLogStatusFilter}>
              <SelectTrigger className="w-36" aria-label="סינון לפי תוצאה">
                <SelectValue placeholder="הכול" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכול</SelectItem>
                <SelectItem value="ok">הצליחו</SelectItem>
                <SelectItem value="error">נכשלו</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <StateView
          loading={logQuery.isLoading}
          error={logQuery.error ? (logQuery.error as Error).message : null}
          onRetry={() => logQuery.refetch()}
          isEmpty={logRows.length === 0}
          empty={{
            icon: <KeyRound className="h-6 w-6" />,
            title: "אין קריאות עדיין",
            description: "כשאפליקציה חיצונית תתחיל לעבוד מול הממשק, כל קריאה תופיע כאן.",
          }}
          skeleton={<ListSkeleton rows={4} />}
        >
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table dir="rtl">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">זמן</TableHead>
                  <TableHead className="w-28">מפתח</TableHead>
                  <TableHead className="w-28">פעולה</TableHead>
                  <TableHead className="w-40">חלק</TableHead>
                  <TableHead className="w-24">תוצאה</TableHead>
                  <TableHead>פירוט</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</TableCell>
                    <TableCell dir="ltr" className="font-mono text-xs">{row.key_prefix ?? "—"}</TableCell>
                    <TableCell className="text-xs">{row.action}</TableCell>
                    <TableCell className="text-xs">{row.resource}</TableCell>
                    <TableCell>
                      {row.status === "ok"
                        ? <Badge variant="outline" className="border-success/40 text-success">הצליחה</Badge>
                        : <Badge variant="outline" className="border-destructive/40 text-destructive">נכשלה</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.error ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </StateView>
      </div>

      {/* ── documentation ────────────────────────────────────────────────── */}
      <Collapsible className="rounded-lg border border-border">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-right">
          <span className="text-sm font-semibold">איך מתחברים — תיעוד קצר</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 px-4 pb-4 text-sm">
          <CopyField label="כתובת הממשק" value={API_URL} />
          <p className="text-muted-foreground">
            כל קריאה היא POST לכתובת הזו, עם כותרת <code dir="ltr">Authorization: Bearer &lt;המפתח&gt;</code>
            {" "}וגוף JSON. התשובות תמיד בעברית.
          </p>
          <CopyField
            label="דוגמה — רשימת עובדים"
            value={`curl -X POST "${API_URL}" \\\n  -H "Authorization: Bearer <המפתח שלכם>" \\\n  -H "Content-Type: application/json" \\\n  -d '{"action":"list","resource":"employees","company_id":"<מזהה החברה>","limit":50}'`}
          />
          <div>
            <p className="mb-1 font-medium">פעולות</p>
            <ul className="list-disc space-y-1 pr-5 text-muted-foreground">
              <li><code dir="ltr">capabilities</code> — מה המפתח הזה מורשה לעשות, אילו חברות ואילו הרשאות.</li>
              <li><code dir="ltr">list</code> — רשימה עם <code dir="ltr">limit</code>, <code dir="ltr">offset</code>, <code dir="ltr">search</code>, <code dir="ltr">filters</code>.</li>
              <li><code dir="ltr">get</code> — רשומה אחת לפי <code dir="ltr">id</code>.</li>
              <li><code dir="ltr">create</code> / <code dir="ltr">update</code> — רשומה חדשה או שינוי, עם <code dir="ltr">data</code>.</li>
              <li><code dir="ltr">preview_delete</code> — מראה מה עומד להימחק, בלי למחוק.</li>
              <li><code dir="ltr">delete</code> — מחיקה של רשימת מזהים מדויקת בלבד. אין מחיקה של "הכול".</li>
            </ul>
          </div>
          <div>
            <p className="mb-1 font-medium">כללים</p>
            <ul className="list-disc space-y-1 pr-5 text-muted-foreground">
              <li>המפתח רואה רק את החברות שסומנות לו, ורק מה שבעל המפתח רואה במערכת.</li>
              <li>תלושי שכר ונתוני שכר דורשים את ההרשאה "שכר".</li>
              <li>ת"ז, תאריך לידה, כתובת, מצב משפחתי וקופת חולים של עובדים מוחזרים, ואפשר לחפש ולסנן לפיהם, רק עם ההרשאה "פרטים מזהים".</li>
              <li>מחיקה דורשת הרשאת "מחיקה" ורשימת מזהים מדויקת; אם מזהה אחד לא נמצא — אף רשומה לא נמחקת.</li>
              <li>עובדים לא נמחקים דרך הממשק. סיום העסקה — דרך <code dir="ltr">offboarding_processes</code>.</li>
              <li>עד 120 קריאות בדקה למפתח. חריגה מחזירה הודעה ברורה.</li>
              <li>הממשק מיועד לקריאות משרת לשרת בלבד. אסור לשים את המפתח בקוד שרץ בדפדפן (אתר או אפליקציית ווב): כל מבקר יכול לראות אותו שם. קריאה מדפדפן נחסמת.</li>
              <li>המפתח המלא מוצג פעם אחת בלבד. אם אבד — יוצרים מפתח חדש.</li>
            </ul>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ── create / edit dialog ─────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "עריכת מפתח" : "מפתח חדש"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "שינויים נכנסים לתוקף מיד, בלי ליצור מפתח חדש."
                : "המפתח המלא יוצג פעם אחת בלבד אחר היצירה. שמרו אותו במקום בטוח."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <FormField label="שם המפתח" required hint="למי הוא מיועד — כך הוא יופיע ברשימה ובלוג.">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="האפליקציה שלנו" />
            </FormField>

            <FormField label="חברות" required hint="המפתח יעבוד מול החברות האלה בלבד.">
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-border p-3">
                {(companiesQuery.data ?? []).map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={companyIds.includes(c.id)}
                      onCheckedChange={(v) => setCompanyIds((prev) => (v
                        ? [...prev.filter((x) => x !== c.id), c.id]
                        : prev.filter((x) => x !== c.id)))}
                    />
                    {c.name}
                  </label>
                ))}
                {!companiesQuery.isLoading && (companiesQuery.data ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">אין חברות במערכת.</p>
                )}
              </div>
            </FormField>

            <FormField label="הרשאות" required hint="מה מותר לעשות עם המפתח.">
              <div className="space-y-2 rounded-md border border-border p-3">
                {SCOPES.map((s) => (
                  <label key={s.key} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={scopes.includes(s.key)}
                      onCheckedChange={(v) => setScopes((prev) => (v
                        ? [...prev.filter((x) => x !== s.key), s.key]
                        : prev.filter((x) => x !== s.key)))}
                    />
                    <span className="font-medium">{s.label}</span>
                    <span className="text-xs text-muted-foreground">— {s.hint}</span>
                  </label>
                ))}
              </div>
            </FormField>

            <FormField label="תוקף" hint="אם תבחרו תאריך, המפתח יפסיק לעבוד אחריו. ריק = ללא תוקף.">
              <DateInput value={expiry} onChange={(e) => setExpiry((e.target as HTMLInputElement).value)} className="w-40" />
            </FormField>

            {editing && (
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={active} onCheckedChange={setActive} aria-label="מפתח פעיל" />
                מפתח פעיל
              </label>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>ביטול</Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} loadingText="שומר...">
              {editing ? "לשמור" : "ליצור מפתח"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── reveal once ──────────────────────────────────────────────────── */}
      <Dialog open={!!revealed} onOpenChange={(o) => { if (!o) setRevealed(null); }}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>המפתח נוצר</DialogTitle>
            <DialogDescription>
              זו הפעם היחידה שהמפתח המלא מוצג. אחר כך אפשר לראות רק את ההתחלה שלו.
            </DialogDescription>
          </DialogHeader>
          {revealed && <CopyField label="המפתח" value={revealed} />}
          <p className="text-sm text-destructive">
            שמרו אותו עכשיו. אם יאבד, אין דרך להציגו שוב — רק ליצור מפתח חדש.
          </p>
          <DialogFooter>
            <Button onClick={() => setRevealed(null)}>סיימתי, שמרתי</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
