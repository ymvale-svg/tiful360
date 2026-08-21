import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FileText, Save, RotateCcw, Eye, Plus, Search, ChevronLeft, ChevronDown,
  Building2, ListTree, Trash2, AlertCircle,
} from "lucide-react";
import {
  PROTOCOL_TYPES,
  ProtocolType,
  useProtocolTemplates,
  useUpsertProtocolTemplate,
  useDeleteProtocolTemplateOverride,
  resolveTemplate,
  deriveProtocolTypeFromCategory,
  substitutePlaceholders,
  PLACEHOLDER_HINTS,
} from "@/hooks/useProtocolTemplates";
import { buildProtocolPreviewPdf } from "@/lib/pdf/buildProtocolPreviewPdf";
import { useAuth } from "@/hooks/useAuth";
import { useAssetGroups, type AssetGroup } from "@/hooks/useAssetGroups";
import { DOMAIN_META, DOMAIN_ORDER, type DomainKey } from "@/lib/assetDomains";
import { cn } from "@/lib/utils";

type CategoryRow = { id: string; category_name: string; protocol_type: string; domain: string | null };

/** A selectable node in the scope tree. */
type ScopeSelection = {
  protocolType: ProtocolType;
  categoryId: string | null;
  groupId: string | null;
  label: string;
};

const typeLabel = (t: ProtocolType) => PROTOCOL_TYPES.find((p) => p.type === t)?.label ?? t;

export function ProtocolTemplatesTab() {
  const { activeCompanyId, activeCompany } = useCompany();
  const { data: templates = [] } = useProtocolTemplates(activeCompanyId);
  const { isAdmin, isSuperAdmin, isOperations } = useAuth();
  const canManage = isAdmin || isSuperAdmin || isOperations;

  const { data: categories = [] } = useQuery({
    queryKey: ["asset_categories", activeCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_categories")
        .select("id, category_name, protocol_type, domain")
        .eq("company_id", activeCompanyId!)
        .order("category_name");
      if (error) throw error;
      return (data ?? []) as CategoryRow[];
    },
    enabled: !!activeCompanyId && canManage,
  });

  const { data: groups = [] } = useAssetGroups();

  const [selection, setSelection] = useState<ScopeSelection>({
    protocolType: "physical",
    categoryId: null,
    groupId: null,
    label: `${typeLabel("physical")} — ברירת מחדל לחברה`,
  });
  const [newOpen, setNewOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);

  if (!canManage) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        אין לך הרשאה לצפות בתבניות פרוטוקולים. הגישה מוגבלת למנהל מערכת ולתפעול.
      </div>
    );
  }

  if (!activeCompanyId) {
    return <div className="text-center py-8 text-muted-foreground">לא נבחרה חברה</div>;
  }

  const tree = (
    <ScopeTree
      categories={categories}
      groups={groups}
      templates={templates}
      companyId={activeCompanyId}
      selection={selection}
      onSelect={(s) => { setSelection(s); setTreeOpen(false); }}
      onNew={() => { setNewOpen(true); setTreeOpen(false); }}
    />
  );

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border/50 shadow-card p-5">
        <div className="flex items-center gap-3 mb-2">
          <FileText className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">תבניות פרוטוקולים</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          בחר יעד מעץ השיוך מימין וערוך את הטקסט. יעד ללא תבנית משלו יורש אוטומטית מהרמה שמעליו:
          תת-קטגוריה ← קטגוריה ← ברירת מחדל לחברה ← ברירת מחדל גלובלית.
        </p>
      </div>

      {/* Mobile tree launcher */}
      <div className="md:hidden">
        <Sheet open={treeOpen} onOpenChange={setTreeOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full gap-2">
              <ListTree className="w-4 h-4" />
              {selection.label}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh] overflow-y-auto p-0">
            <SheetHeader className="p-4 pb-2 text-right">
              <SheetTitle>עץ שיוך</SheetTitle>
            </SheetHeader>
            <div className="p-4 pt-0">{tree}</div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
        <TemplateEditorPanel
          key={`${selection.protocolType}-${selection.categoryId}-${selection.groupId}`}
          selection={selection}
          templates={templates}
          companyId={activeCompanyId}
          companyName={activeCompany?.name ?? ""}
          logoUrl={activeCompany?.logo_url ?? null}
        />
        <div className="hidden md:block">{tree}</div>
      </div>

      <NewProtocolDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        categories={categories}
        groups={groups}
        templates={templates}
        companyId={activeCompanyId}
        onCreated={(s) => setSelection(s)}
      />
    </div>
  );
}

/* ------------------------------- scope tree ------------------------------- */

function hasOwnTemplate(
  templates: any[], companyId: string, protocolType: ProtocolType,
  categoryId: string | null, groupId: string | null
) {
  return templates.some(
    (t) =>
      t.company_id === companyId &&
      t.protocol_type === protocolType &&
      (t.category_id ?? null) === categoryId &&
      (t.group_id ?? null) === groupId
  );
}

function ScopeTree({
  categories, groups, templates, companyId, selection, onSelect, onNew,
}: {
  categories: CategoryRow[];
  groups: AssetGroup[];
  templates: any[];
  companyId: string;
  selection: ScopeSelection;
  onSelect: (s: ScopeSelection) => void;
  onNew: () => void;
}) {
  const [q, setQ] = useState("");
  const [openDomains, setOpenDomains] = useState<Record<string, boolean>>({});
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const search = q.trim().toLowerCase();

  const matches = (s: string) => !search || s.toLowerCase().includes(search);

  const isSelected = (categoryId: string | null, groupId: string | null, protocolType: ProtocolType) =>
    selection.categoryId === categoryId &&
    selection.groupId === groupId &&
    selection.protocolType === protocolType;

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-3 space-y-3 md:sticky md:top-4">
      <Button size="sm" className="w-full gap-1.5" onClick={onNew}>
        <Plus className="w-4 h-4" /> פרוטוקול חדש
      </Button>

      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש קטגוריה או פרוטוקול"
          className="h-8 pr-8 text-xs"
        />
      </div>

      <div className="max-h-[60vh] overflow-y-auto pl-1 space-y-1">
        {/* Company defaults branch */}
        <div className="flex items-center gap-1.5 px-1 py-1 text-xs font-semibold text-muted-foreground">
          <Building2 className="w-3.5 h-3.5" /> ברירות מחדל לחברה
        </div>
        {PROTOCOL_TYPES.filter((p) => matches(p.label)).map((p) => (
          <NodeRow
            key={p.type}
            depth={1}
            label={p.label}
            custom={hasOwnTemplate(templates, companyId, p.type, null, null)}
            active={isSelected(null, null, p.type)}
            onClick={() =>
              onSelect({ protocolType: p.type, categoryId: null, groupId: null, label: `${p.label} — ברירת מחדל לחברה` })
            }
          />
        ))}

        <div className="h-2" />

        {DOMAIN_ORDER.map((d) => {
          const domainCats = categories.filter((c) => (c.domain ?? "physical") === (d as DomainKey));
          if (!domainCats.length) return null;
          const visibleCats = domainCats.filter(
            (c) => matches(c.category_name) || groups.some((g) => g.category_id === c.id && matches(g.name))
          );
          if (search && !visibleCats.length && !matches(DOMAIN_META[d].title)) return null;
          const open = search ? true : openDomains[d] ?? false;
          const cats = search ? (visibleCats.length ? visibleCats : domainCats) : domainCats;
          return (
            <div key={d}>
              <button
                type="button"
                onClick={() => setOpenDomains((s) => ({ ...s, [d]: !open }))}
                className="w-full flex items-center gap-1.5 px-1 py-1.5 rounded-md text-xs font-semibold hover:bg-muted/60"
              >
                {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                {DOMAIN_META[d].title}
              </button>
              {open && cats.map((c) => {
                const pt = deriveProtocolTypeFromCategory(c.protocol_type);
                const catGroups = groups.filter((g) => g.category_id === c.id);
                const catOpen = search ? true : openCats[c.id] ?? false;
                return (
                  <div key={c.id}>
                    <div className="flex items-stretch">
                      {catGroups.length > 0 && (
                        <button
                          type="button"
                          aria-label="הצג תתי-קטגוריות"
                          onClick={() => setOpenCats((s) => ({ ...s, [c.id]: !catOpen }))}
                          className="px-1 text-muted-foreground hover:text-foreground"
                          style={{ marginInlineStart: 12 }}
                        >
                          {catOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <NodeRow
                        depth={catGroups.length ? 0 : 1}
                        className="flex-1"
                        label={c.category_name}
                        hint={typeLabel(pt)}
                        custom={hasOwnTemplate(templates, companyId, pt, c.id, null)}
                        active={isSelected(c.id, null, pt)}
                        onClick={() =>
                          onSelect({
                            protocolType: pt, categoryId: c.id, groupId: null,
                            label: `${typeLabel(pt)} — ${c.category_name}`,
                          })
                        }
                      />
                    </div>
                    {catOpen && catGroups.map((g) => (
                      <NodeRow
                        key={g.id}
                        depth={2}
                        label={g.name}
                        custom={hasOwnTemplate(templates, companyId, pt, c.id, g.id)}
                        active={isSelected(c.id, g.id, pt)}
                        onClick={() =>
                          onSelect({
                            protocolType: pt, categoryId: c.id, groupId: g.id,
                            label: `${typeLabel(pt)} — ${c.category_name} / ${g.name}`,
                          })
                        }
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NodeRow({
  label, hint, custom, active, onClick, depth, className,
}: {
  label: string;
  hint?: string;
  custom: boolean;
  active: boolean;
  onClick: () => void;
  depth: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingInlineStart: 8 + depth * 12 }}
      className={cn(
        "w-full text-right flex items-center justify-between gap-2 py-1.5 pl-2 rounded-md text-xs transition-colors",
        active ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60",
        !custom && !active && "text-muted-foreground",
        className
      )}
    >
      <span className="truncate">
        {label}
        {hint && <span className="text-[10px] text-muted-foreground/70 mr-1.5">· {hint}</span>}
      </span>
      <span
        className={cn(
          "shrink-0 text-[10px] px-1.5 py-0.5 rounded",
          custom ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground/70"
        )}
      >
        {custom ? "מותאם" : "יורש"}
      </span>
    </button>
  );
}

/* ------------------------------ editor panel ------------------------------ */

function TemplateEditorPanel({
  selection, templates, companyId, companyName, logoUrl,
}: {
  selection: ScopeSelection;
  templates: any[];
  companyId: string;
  companyName: string;
  logoUrl: string | null;
}) {
  const { protocolType, categoryId, groupId } = selection;
  const { toast } = useToast();
  const upsert = useUpsertProtocolTemplate();
  const del = useDeleteProtocolTemplateOverride();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const effective = useMemo(
    () => resolveTemplate(templates, protocolType, companyId, categoryId, groupId),
    [templates, protocolType, companyId, categoryId, groupId]
  );
  const ownOverride = templates.find(
    (t: any) =>
      t.company_id === companyId &&
      t.protocol_type === protocolType &&
      (t.category_id ?? null) === categoryId &&
      (t.group_id ?? null) === groupId
  );

  const defaults = {
    body: effective?.body_template ?? "",
    displayName: effective?.display_name ?? selection.label,
    requiresIssuer: !!effective?.requires_issuer_sig,
    validityDays: effective?.validity_days?.toString() ?? "",
  };

  const [body, setBody] = useState(defaults.body);
  const [displayName, setDisplayName] = useState(defaults.displayName);
  const [requiresIssuer, setRequiresIssuer] = useState(defaults.requiresIssuer);
  const [validityDays, setValidityDays] = useState(defaults.validityDays);

  useEffect(() => {
    setBody(defaults.body);
    setDisplayName(defaults.displayName);
    setRequiresIssuer(defaults.requiresIssuer);
    setValidityDays(defaults.validityDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effective?.id, selection.protocolType, selection.categoryId, selection.groupId]);

  const dirty =
    body !== defaults.body ||
    displayName !== defaults.displayName ||
    requiresIssuer !== defaults.requiresIssuer ||
    validityDays !== defaults.validityDays;

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const insertPlaceholder = (key: string) => {
    const el = textareaRef.current;
    const token = `{{${key}}}`;
    if (!el) { setBody((b) => b + token); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const onSave = async () => {
    try {
      await upsert.mutateAsync({
        company_id: companyId,
        category_id: categoryId,
        group_id: groupId,
        protocol_type: protocolType,
        display_name: displayName.trim() || selection.label,
        body_template: body,
        requires_issuer_sig: requiresIssuer,
        validity_days: validityDays ? parseInt(validityDays, 10) : null,
      });
      toast({ title: "התבנית נשמרה" });
    } catch (e: any) {
      toast({ title: "שגיאה בשמירה", description: e.message, variant: "destructive" });
    }
  };

  const onReset = async () => {
    if (!ownOverride) return;
    try {
      await del.mutateAsync(ownOverride.id);
      toast({ title: "התבנית נמחקה — היעד חזר לירושה" });
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    } finally {
      setConfirmReset(false);
    }
  };

  const onPreview = async () => {
    try {
      const sample: Record<string, string> = {
        employee_name: "ישראל ישראלי",
        employee_id: "012345678",
        asset_name: "מחשב נייד Dell Latitude",
        asset_code: "PC-001",
        serial: "ABC123XYZ",
        category: "מחשבים ניידים",
        date: new Date().toLocaleDateString("en-GB"),
        company_name: companyName,
      };
      const blob = await buildProtocolPreviewPdf({
        title: displayName.trim() || selection.label,
        bodyText: substitutePlaceholders(body, sample),
        companyName,
        logoUrl,
        footerNote: "תצוגה מקדימה — נתוני דמה",
      });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) {
      toast({ title: "שגיאה בתצוגה מקדימה", description: e.message, variant: "destructive" });
    }
  };

  const isOverride = !!ownOverride;
  const inheritsFrom = !isOverride
    ? groupId
      ? "התבנית של הקטגוריה"
      : categoryId
        ? "ברירת המחדל של החברה"
        : "ברירת המחדל הגלובלית"
    : null;

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-4 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="min-w-0">
          <h4 className="font-semibold truncate">{selection.label}</h4>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {isOverride ? (
              <span className="text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary">התאמה אישית</span>
            ) : (
              <span className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground">
                יורש מ{inheritsFrom}
              </span>
            )}
            {dirty && (
              <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> שינויים שלא נשמרו
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onPreview}>
            <Eye className="w-3.5 h-3.5" /> תצוגה מקדימה
          </Button>
          {isOverride && (
            <Button size="sm" variant="ghost" className="gap-1.5 text-destructive" onClick={() => setConfirmReset(true)}>
              <Trash2 className="w-3.5 h-3.5" /> מחק תבנית
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={onSave} disabled={upsert.isPending || !dirty}>
            <Save className="w-3.5 h-3.5" /> שמור
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <Label className="text-xs mb-1 block">כותרת הפרוטוקול</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs mb-1 block">תוקף (ימים, אופציונלי)</Label>
          <Input
            type="number"
            value={validityDays}
            onChange={(e) => setValidityDays(e.target.value)}
            placeholder="לדוגמה: 30"
          />
        </div>
      </div>

      <div>
        <Label className="text-xs mb-1 block">טקסט הפרוטוקול</Label>
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={14}
          className="font-mono text-sm leading-relaxed"
          dir="rtl"
        />
        <div className="mt-2">
          <p className="text-[11px] text-muted-foreground mb-1">לחץ להוספת שדה דינמי במיקום הסמן:</p>
          <div className="flex flex-wrap gap-1.5">
            {PLACEHOLDER_HINTS.map((h) => (
              <button
                key={h.key}
                type="button"
                onClick={() => insertPlaceholder(h.key)}
                title={h.label}
                className="text-[11px] px-2 py-0.5 bg-muted hover:bg-muted/70 rounded font-mono transition-colors"
              >
                {`{{${h.key}}}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Switch checked={requiresIssuer} onCheckedChange={setRequiresIssuer} />
        <Label className="text-sm">דורש גם חתימת נותן הציוד</Label>
      </div>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את התבנית?</AlertDialogTitle>
            <AlertDialogDescription>
              היעד יחזור לרשת מ{inheritsFrom ?? "הרמה שמעליו"}. הפעולה אינה הפיכה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={onReset} className="bg-destructive text-destructive-foreground">
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------------------------- new protocol dialog --------------------------- */

function NewProtocolDialog({
  open, onOpenChange, categories, groups, templates, companyId, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: CategoryRow[];
  groups: AssetGroup[];
  templates: any[];
  companyId: string;
  onCreated: (s: ScopeSelection) => void;
}) {
  const { toast } = useToast();
  const upsert = useUpsertProtocolTemplate();
  const [scopeKind, setScopeKind] = useState<"company" | "category" | "group">("company");
  const [protocolType, setProtocolType] = useState<ProtocolType>("physical");
  const [domain, setDomain] = useState<DomainKey | "">("");
  const [catId, setCatId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [base, setBase] = useState<"inherit" | "blank">("inherit");

  useEffect(() => {
    if (!open) return;
    setScopeKind("company");
    setProtocolType("physical");
    setDomain(""); setCatId(""); setGroupId(""); setBase("inherit");
  }, [open]);

  const domainCategories = useMemo(
    () => (domain ? categories.filter((c) => (c.domain ?? "physical") === domain) : []),
    [categories, domain]
  );
  const selectedCat = categories.find((c) => c.id === catId);
  const catGroups = useMemo(() => groups.filter((g) => g.category_id === catId), [groups, catId]);
  const selectedGroup = catGroups.find((g) => g.id === groupId);

  const effectiveType: ProtocolType =
    scopeKind === "company" ? protocolType : deriveProtocolTypeFromCategory(selectedCat?.protocol_type);

  const targetCategoryId = scopeKind === "company" ? null : catId || null;
  const targetGroupId = scopeKind === "group" ? groupId || null : null;

  const valid =
    scopeKind === "company"
      ? true
      : scopeKind === "category"
        ? !!catId
        : !!catId && !!groupId;

  const label =
    scopeKind === "company"
      ? `${typeLabel(effectiveType)} — ברירת מחדל לחברה`
      : `${typeLabel(effectiveType)} — ${selectedCat?.category_name ?? ""}${selectedGroup ? ` / ${selectedGroup.name}` : ""}`;

  const duplicate =
    valid && hasOwnTemplate(templates, companyId, effectiveType, targetCategoryId, targetGroupId);

  const goToExisting = () => {
    onCreated({ protocolType: effectiveType, categoryId: targetCategoryId, groupId: targetGroupId, label });
    onOpenChange(false);
  };

  const onCreate = async () => {
    if (!valid || duplicate) return;
    const inherited = resolveTemplate(templates, effectiveType, companyId, targetCategoryId, targetGroupId);
    try {
      await upsert.mutateAsync({
        company_id: companyId,
        category_id: targetCategoryId,
        group_id: targetGroupId,
        protocol_type: effectiveType,
        display_name: label,
        body_template: base === "inherit" ? inherited?.body_template ?? "" : "",
        requires_issuer_sig: base === "inherit" ? !!inherited?.requires_issuer_sig : false,
        validity_days: base === "inherit" ? inherited?.validity_days ?? null : null,
      });
      toast({ title: "הפרוטוקול נוצר" });
      onCreated({ protocolType: effectiveType, categoryId: targetCategoryId, groupId: targetGroupId, label });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "שגיאה ביצירה", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-right">פרוטוקול חדש</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm mb-1.5 block">יעד שיוך</Label>
            <Select value={scopeKind} onValueChange={(v) => { setScopeKind(v as any); setGroupId(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="company">כל החברה (ברירת מחדל)</SelectItem>
                <SelectItem value="category">קטגוריה מסוימת</SelectItem>
                <SelectItem value="group">תת-קטגוריה מסוימת</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scopeKind === "company" && (
            <div>
              <Label className="text-sm mb-1.5 block">סוג פרוטוקול</Label>
              <Select value={protocolType} onValueChange={(v) => setProtocolType(v as ProtocolType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROTOCOL_TYPES.map((p) => (
                    <SelectItem key={p.type} value={p.type}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {scopeKind !== "company" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm mb-1.5 block">דומיין</Label>
                <Select value={domain} onValueChange={(v) => { setDomain(v as DomainKey); setCatId(""); setGroupId(""); }}>
                  <SelectTrigger><SelectValue placeholder="בחר דומיין" /></SelectTrigger>
                  <SelectContent>
                    {DOMAIN_ORDER.map((d) => (
                      <SelectItem key={d} value={d}>{DOMAIN_META[d].title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">קטגוריה</Label>
                <Select value={catId} onValueChange={(v) => { setCatId(v); setGroupId(""); }} disabled={!domain}>
                  <SelectTrigger><SelectValue placeholder={domain ? "בחר קטגוריה" : "בחר דומיין תחילה"} /></SelectTrigger>
                  <SelectContent>
                    {domainCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.category_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {scopeKind === "group" && (
                <div className="sm:col-span-2">
                  <Label className="text-sm mb-1.5 block">תת-קטגוריה</Label>
                  <Select value={groupId} onValueChange={setGroupId} disabled={!catId || catGroups.length === 0}>
                    <SelectTrigger>
                      <SelectValue placeholder={catGroups.length ? "בחר תת-קטגוריה" : "אין תתי-קטגוריות לקטגוריה זו"} />
                    </SelectTrigger>
                    <SelectContent>
                      {catGroups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <div>
            <Label className="text-sm mb-1.5 block">בסיס התבנית</Label>
            <Select value={base} onValueChange={(v) => setBase(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit">התחל מהתבנית שנורשת</SelectItem>
                <SelectItem value="blank">התחל מטקסט ריק</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {valid && (
            <p className="text-xs text-muted-foreground">
              ייווצר: <span className="font-medium">{label}</span>
              {scopeKind === "category" && " · יחול על כל תתי-הקטגוריות"}
            </p>
          )}

          {duplicate && (
            <div className="text-xs rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 p-2.5 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>כבר קיימת תבנית ליעד זה. אפשר לעבור אליה לעריכה במקום ליצור כפילות.</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          {duplicate ? (
            <Button onClick={goToExisting}>עבור לעריכה</Button>
          ) : (
            <Button onClick={onCreate} disabled={!valid || upsert.isPending}>צור פרוטוקול</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
