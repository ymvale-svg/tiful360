import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Save, RotateCcw, Eye, Layers, Tag } from "lucide-react";
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
      return data ?? [];
    },
    enabled: !!activeCompanyId && canManage,
  });

  const { data: groups = [] } = useAssetGroups();

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

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border/50 shadow-card p-5">
        <div className="flex items-center gap-3 mb-3">
          <FileText className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">תבניות פרוטוקולים</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          ערוך את הטקסט המופיע בפרוטוקולי מסירה והחזרת ציוד. ניתן להגדיר ברירת מחדל לחברה, או שיוך ישיר לדומיין → קטגוריה → תת-קטגוריה.
          שיוך לקטגוריה בלבד יחול על כל תתי-הקטגוריות שלה.
        </p>
        <PlaceholderHints />
      </div>

      <Tabs defaultValue="company" dir="rtl">
        <TabsList>
          <TabsTrigger value="company" className="gap-1.5">
            <Layers className="w-4 h-4" />
            ברירות מחדל לחברה
          </TabsTrigger>
          <TabsTrigger value="category" className="gap-1.5">
            <Tag className="w-4 h-4" />
            שיוך לדומיין / קטגוריה
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="space-y-3">
          {PROTOCOL_TYPES.map((p) => (
            <TemplateEditor
              key={p.type}
              protocolType={p.type}
              defaultDisplayName={p.label}
              categoryId={null}
              groupId={null}
              templates={templates}
              companyId={activeCompanyId}
              companyName={activeCompany?.name ?? ""}
              logoUrl={activeCompany?.logo_url ?? null}
            />
          ))}
        </TabsContent>

        <TabsContent value="category" className="space-y-3">
          <PerCategoryEditor
            categories={categories as any}
            groups={groups}
            templates={templates}
            companyId={activeCompanyId}
            companyName={activeCompany?.name ?? ""}
            logoUrl={activeCompany?.logo_url ?? null}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PlaceholderHints() {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {PLACEHOLDER_HINTS.map((h) => (
        <code
          key={h.key}
          className="text-[11px] px-2 py-0.5 bg-muted rounded font-mono"
          title={h.label}
        >
          {`{{${h.key}}}`}
        </code>
      ))}
    </div>
  );
}

function PerCategoryEditor({
  categories, groups, templates, companyId, companyName, logoUrl,
}: {
  categories: { id: string; category_name: string; protocol_type: string; domain: string | null }[];
  groups: AssetGroup[];
  templates: any[];
  companyId: string;
  companyName: string;
  logoUrl: string | null;
}) {
  const [domain, setDomain] = useState<DomainKey | "">("");
  const [catId, setCatId] = useState<string>("");
  const [groupId, setGroupId] = useState<string>("");

  const domainCategories = useMemo(
    () => (domain ? categories.filter((c) => (c.domain ?? "physical") === domain) : []),
    [categories, domain]
  );
  const selected = categories.find((c) => c.id === catId);
  const catGroups = useMemo(
    () => groups.filter((g) => g.category_id === catId),
    [groups, catId]
  );
  const selectedGroup = catGroups.find((g) => g.id === groupId);

  const protocolType = selected
    ? deriveProtocolTypeFromCategory(selected.protocol_type)
    : null;
  const displayName = `${PROTOCOL_TYPES.find((p) => p.type === protocolType)?.label ?? ""} — ${selected?.category_name ?? ""}${selectedGroup ? ` / ${selectedGroup.name}` : ""}`;

  return (
    <div className="space-y-3">
      <div className="bg-card rounded-xl border border-border/50 p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-sm mb-1.5 block">דומיין</Label>
          <Select
            value={domain}
            onValueChange={(v) => { setDomain(v as DomainKey); setCatId(""); setGroupId(""); }}
          >
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
          <Select
            value={catId}
            onValueChange={(v) => { setCatId(v); setGroupId(""); }}
            disabled={!domain}
          >
            <SelectTrigger><SelectValue placeholder={domain ? "בחר קטגוריה" : "בחר דומיין תחילה"} /></SelectTrigger>
            <SelectContent>
              {domainCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.category_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-sm mb-1.5 block">תת-קטגוריה (אופציונלי)</Label>
          <Select
            value={groupId || "__all__"}
            onValueChange={(v) => setGroupId(v === "__all__" ? "" : v)}
            disabled={!catId || catGroups.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={catGroups.length ? "כל תתי-הקטגוריות" : "אין תתי-קטגוריות"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">כל תתי-הקטגוריות</SelectItem>
              {catGroups.map((g) => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selected && (
          <p className="text-xs text-muted-foreground md:col-span-3">
            סוג פרוטוקול נגזר: <span className="font-medium">{PROTOCOL_TYPES.find((p) => p.type === protocolType)?.label}</span>
            {" · "}
            {selectedGroup
              ? `התבנית תחול על תת-הקטגוריה "${selectedGroup.name}" בלבד`
              : `התבנית תחול על כל תתי-הקטגוריות של "${selected.category_name}"`}
          </p>
        )}
      </div>

      {selected && protocolType && (
        <TemplateEditor
          key={`${selected.id}-${groupId}`}
          protocolType={protocolType}
          defaultDisplayName={displayName}
          categoryId={selected.id}
          groupId={groupId || null}
          templates={templates}
          companyId={companyId}
          companyName={companyName}
          logoUrl={logoUrl}
        />
      )}
    </div>
  );
}


function TemplateEditor({
  protocolType, defaultDisplayName, categoryId, groupId, templates, companyId, companyName, logoUrl,
}: {
  protocolType: ProtocolType;
  defaultDisplayName: string;
  categoryId: string | null;
  groupId: string | null;
  templates: any[];
  companyId: string;
  companyName: string;
  logoUrl: string | null;
}) {
  const { toast } = useToast();
  const upsert = useUpsertProtocolTemplate();
  const del = useDeleteProtocolTemplateOverride();

  const effective = useMemo(
    () => resolveTemplate(templates, protocolType, companyId, categoryId, groupId),
    [templates, protocolType, companyId, categoryId, groupId]
  );
  const ownOverride = templates.find(
    (t: any) =>
      t.company_id === companyId &&
      t.protocol_type === protocolType &&
      t.category_id === categoryId &&
      (t.group_id ?? null) === groupId
  );


  const [body, setBody] = useState(effective?.body_template ?? "");
  const [displayName, setDisplayName] = useState(effective?.display_name ?? defaultDisplayName);
  const [requiresIssuer, setRequiresIssuer] = useState(!!effective?.requires_issuer_sig);
  const [validityDays, setValidityDays] = useState<string>(
    effective?.validity_days?.toString() ?? ""
  );

  // Re-sync when effective changes (e.g. after fetch)
  useMemo(() => {
    setBody(effective?.body_template ?? "");
    setDisplayName(effective?.display_name ?? defaultDisplayName);
    setRequiresIssuer(!!effective?.requires_issuer_sig);
    setValidityDays(effective?.validity_days?.toString() ?? "");
  }, [effective?.id]);

  const onSave = async () => {
    try {
      await upsert.mutateAsync({
        company_id: companyId,
        category_id: categoryId,
        group_id: groupId,

        protocol_type: protocolType,
        display_name: displayName.trim() || defaultDisplayName,
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
      toast({ title: "שוחזר לברירת המחדל" });
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
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
        title: displayName.trim() || defaultDisplayName,
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
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold">
            {PROTOCOL_TYPES.find((p) => p.type === protocolType)?.label}
          </h4>
          {inheritsFrom && (
            <span className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground">
              יורש מ{inheritsFrom}
            </span>
          )}
          {isOverride && (
            <span className="text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary">
              התאמה אישית
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onPreview}>
            <Eye className="w-3.5 h-3.5" /> תצוגה מקדימה
          </Button>
          {isOverride && (
            <Button size="sm" variant="ghost" className="gap-1.5 text-destructive" onClick={onReset}>
              <RotateCcw className="w-3.5 h-3.5" /> שחזר ברירת מחדל
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={onSave} disabled={upsert.isPending}>
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
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          className="font-mono text-sm leading-relaxed"
          dir="rtl"
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Switch checked={requiresIssuer} onCheckedChange={setRequiresIssuer} />
        <Label className="text-sm">דורש גם חתימת נותן הציוד</Label>
      </div>
    </div>
  );
}
