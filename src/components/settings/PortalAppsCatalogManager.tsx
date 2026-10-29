import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AppWindow, Pencil, Plus, Trash2, Users, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField, focusFirstInvalid } from "@/components/feedback/FormField";
import { IconButton } from "@/components/feedback/IconButton";
import { StateView } from "@/components/feedback/StateView";
import { useConfirm } from "@/components/feedback/ConfirmDialog";
import { useCompanyPortalLinks } from "@/hooks/usePortalApps";
import { useAssetCategories } from "@/hooks/useData";
import { useAssetGroups } from "@/hooks/useAssetGroups";
import { ACCESS_DOMAINS, normalizeAppUrl } from "@/lib/portalApps";

type AccessMode = "everyone" | "assigned";

interface Form {
  label: string;
  url: string;
  category: string;
  description: string;
  access_mode: AccessMode;
  asset_category_id: string;
  /** "" = any sub-category of the chosen category. */
  asset_group_id: string;
}

const EMPTY: Form = { label: "", url: "", category: "", description: "", access_mode: "everyone", asset_category_id: "", asset_group_id: "" };
const ANY_GROUP = "__any__";

/**
 * The company's system catalogue: the tiles employees see under "המערכות שלי" in the portal.
 * A system is shown to everyone, or only to employees holding a digital/licence asset of a category.
 */
export function PortalAppsCatalogManager({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const linksQuery = useCompanyPortalLinks(companyId);
  const links = linksQuery.data ?? [];
  const { data: categories = [] } = useAssetCategories();
  const { data: groups = [] } = useAssetGroups();
  const accessCategories = categories.filter((c) => (ACCESS_DOMAINS as readonly string[]).includes(c.domain));
  const [form, setForm] = useState<Form>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});

  const categoryName = (id: string | null) => accessCategories.find((c) => c.id === id)?.category_name ?? "קטגוריה שנמחקה";
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name;
  const existingCategories = [...new Set(links.map((l) => l.category).filter(Boolean) as string[])];
  const groupsOfCategory = groups.filter((g) => g.category_id === form.asset_category_id);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value, ...(key === "asset_category_id" ? { asset_group_id: "" } : {}) }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const reset = () => { setForm(EMPTY); setEditingId(null); setErrors({}); };

  const save = useMutation({
    mutationFn: async (values: Form) => {
      const row = {
        label: values.label.trim(),
        url: normalizeAppUrl(values.url)!,
        category: values.category.trim() || null,
        description: values.description.trim() || null,
        access_mode: values.access_mode,
        asset_category_id: values.access_mode === "assigned" ? values.asset_category_id : null,
        asset_group_id: values.access_mode === "assigned" && values.asset_group_id ? values.asset_group_id : null,
        updated_at: new Date().toISOString(),
      };
      const { error } = editingId
        ? await supabase.from("portal_links").update(row).eq("id", editingId)
        : await supabase.from("portal_links").insert({ ...row, company_id: companyId, sort_order: links.length });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal_links"] });
      toast({ title: editingId ? "המערכת עודכנה" : "המערכת נוספה לקטלוג" });
      reset();
    },
    onError: (e: Error) => toast({ title: "השמירה נכשלה", description: e.message, variant: "destructive" }),
  });

  const submit = () => {
    const next: typeof errors = {};
    if (!form.label.trim()) next.label = "נא למלא את שם המערכת";
    if (!normalizeAppUrl(form.url)) next.url = "כתובת לא תקינה. יש להזין כתובת אתר, למשל https://erp.company.co.il";
    if (form.access_mode === "assigned" && !form.asset_category_id) next.asset_category_id = "נא לבחור את קטגוריית ההרשאה";
    setErrors(next);
    if (Object.keys(next).length) {
      requestAnimationFrame(() => focusFirstInvalid(document.getElementById("portal-apps-form")));
      return;
    }
    save.mutate(form);
  };

  const edit = (link: (typeof links)[number]) => {
    setEditingId(link.id);
    setErrors({});
    setForm({
      label: link.label,
      url: link.url,
      category: link.category ?? "",
      description: link.description ?? "",
      access_mode: link.access_mode === "assigned" ? "assigned" : "everyone",
      asset_category_id: link.asset_category_id ?? "",
      asset_group_id: link.asset_group_id ?? "",
    });
    requestAnimationFrame(() => document.getElementById("portal-app-label")?.focus());
  };

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("portal_links").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["portal_links"] });
      if (id === editingId) reset();
      toast({ title: "המערכת הוסרה מהקטלוג" });
    },
  });
  const confirmRemove = (link: { id: string; label: string }) => confirm({
    title: `להסיר את "${link.label}" מהקטלוג?`,
    description: "המערכת תיעלם מ\"המערכות שלי\" בפורטל. ההרשאות עצמן לא משתנות.",
    confirmLabel: "הסר מערכת",
    destructive: true,
    onConfirm: () => remove.mutateAsync(link.id),
  });

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 space-y-4">
      <div className="flex items-center gap-3">
        <AppWindow className="w-5 h-5 text-primary" aria-hidden="true" />
        <h3 className="font-semibold">קטלוג מערכות (המערכות שלי בפורטל)</h3>
      </div>
      <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-2.5 leading-relaxed">
        כל מערכת מוצגת לכל העובדים, או רק למי שמחזיק נכס הרשאה מקטגוריה מסוימת (תחום הרשאות דיגיטליות או רישיונות).
        נכסי הרשאה עם כתובת כניסה שלא מקושרים לאף מערכת כאן מופיעים לבעליהם אוטומטית.
        הפורטל רק מקשר למערכת. ההרשאה עצמה נבדקת בתוך כל מערכת.
      </p>

      <StateView
        loading={linksQuery.isLoading}
        error={linksQuery.error}
        onRetry={() => { void linksQuery.refetch(); }}
        label="את קטלוג המערכות"
        isEmpty={links.length === 0}
        empty={{ icon: <AppWindow className="w-6 h-6" />, title: "עדיין אין מערכות בקטלוג", description: "הוסיפו את המערכת הראשונה בטופס שלמטה." }}
      >
        <ul className="space-y-2">
          {links.map((link) => (
            <li key={link.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-background">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {link.label}
                  {link.category && <span className="text-muted-foreground font-normal"> · {link.category}</span>}
                </p>
                <p className="text-xs text-muted-foreground truncate" dir="ltr">{link.url}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  {link.access_mode === "assigned" ? (
                    <><KeyRound className="w-3 h-3 shrink-0" aria-hidden="true" />רק למי שמחזיק: {categoryName(link.asset_category_id)}{link.asset_group_id ? ` › ${groupName(link.asset_group_id) ?? "תת-קטגוריה שנמחקה"}` : ""}</>
                  ) : (
                    <><Users className="w-3 h-3 shrink-0" aria-hidden="true" />לכל העובדים</>
                  )}
                </p>
              </div>
              <IconButton label={`ערוך את ${link.label}`} className="shrink-0" onClick={() => edit(link)}>
                <Pencil className="w-4 h-4" />
              </IconButton>
              <IconButton label={`הסר את ${link.label}`} className="shrink-0 text-destructive" onClick={() => { void confirmRemove(link); }}>
                <Trash2 className="w-4 h-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      </StateView>

      <form
        id="portal-apps-form"
        noValidate
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-border/50"
      >
        <p className="sm:col-span-2 text-sm font-semibold">{editingId ? "עריכת מערכת" : "הוספת מערכת"}</p>
        <FormField label="שם המערכת" required error={errors.label} id="portal-app-label">
          <Input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="למשל: ERP כספים" autoComplete="off" />
        </FormField>
        <FormField label="כתובת" required error={errors.url} id="portal-app-url">
          <Input type="url" value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://..." dir="ltr" className="font-mono" />
        </FormField>
        <FormField label="קטגוריה" hint="משמשת לסינון בפורטל" id="portal-app-category">
          <Input value={form.category} onChange={(e) => set("category", e.target.value)} list="portal-app-categories" placeholder="למשל: כספים" autoComplete="off" />
        </FormField>
        <datalist id="portal-app-categories">
          {existingCategories.map((c) => <option key={c} value={c} />)}
        </datalist>
        <FormField label="תיאור קצר" id="portal-app-description">
          <Input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="לא חובה" />
        </FormField>

        <div className="space-y-1.5">
          <Label htmlFor="portal-app-access">למי מוצגת</Label>
          <Select value={form.access_mode} onValueChange={(v) => set("access_mode", v as AccessMode)}>
            <SelectTrigger id="portal-app-access"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="everyone">לכל העובדים</SelectItem>
              <SelectItem value="assigned">רק למי שמחזיק הרשאה</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {form.access_mode === "assigned" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="portal-app-asset-category">
                קטגוריית ההרשאה<span className="text-destructive ms-0.5" aria-hidden="true">*</span>
              </Label>
              <Select value={form.asset_category_id} onValueChange={(v) => set("asset_category_id", v)}>
                <SelectTrigger
                  id="portal-app-asset-category"
                  aria-required="true"
                  aria-invalid={errors.asset_category_id ? true : undefined}
                  aria-describedby={errors.asset_category_id ? "portal-app-asset-category-error" : "portal-app-asset-category-hint"}
                >
                  <SelectValue placeholder="בחירת קטגוריה" />
                </SelectTrigger>
                <SelectContent>
                  {accessCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.category_name}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.asset_category_id ? (
                <p id="portal-app-asset-category-error" role="alert" className="text-xs font-medium text-destructive">{errors.asset_category_id}</p>
              ) : (
                <p id="portal-app-asset-category-hint" className="text-xs text-muted-foreground">
                  {accessCategories.length ? "קטגוריות מתחום הרשאות דיגיטליות ורישיונות" : "אין עדיין קטגוריות בתחום הרשאות דיגיטליות או רישיונות"}
                </p>
              )}
            </div>
            {groupsOfCategory.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="portal-app-asset-group">תת-קטגוריה</Label>
                <Select value={form.asset_group_id || ANY_GROUP} onValueChange={(v) => set("asset_group_id", v === ANY_GROUP ? "" : v)}>
                  <SelectTrigger id="portal-app-asset-group"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_GROUP}>כל תתי-הקטגוריות</SelectItem>
                    {groupsOfCategory.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}

        <div className="sm:col-span-2 flex flex-wrap gap-2">
          <Button type="submit" className="gap-1.5" loading={save.isPending} loadingText="שומר…">
            {editingId ? null : <Plus className="w-4 h-4" aria-hidden="true" />}
            {editingId ? "שמירת השינויים" : "הוספה לקטלוג"}
          </Button>
          {editingId && <Button type="button" variant="outline" onClick={reset} disabled={save.isPending}>ביטול עריכה</Button>}
        </div>
      </form>
    </div>
  );
}
