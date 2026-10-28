import { useMemo, useState } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { AlertCircle, Info, ChevronDown, X as XIcon, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAddCategoryFieldOption } from "@/hooks/useCategories";
import { toast } from "@/hooks/use-toast";
import { useSites, useCreateSite } from "@/hooks/useSites";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Fields whose values come from the company's existing sites list */
const isSiteField = (name: string) => /^שיוך לאתר/.test(name.trim());

export interface CustomField {
  id: string;
  field_name: string;
  field_type: "text" | "number" | "date" | "list" | "list_multi" | string;
  field_options?: any;
  is_required?: boolean;
  sort_order?: number;
}

interface Props {
  fields: CustomField[];
  values: Record<string, string>;
  onChange: (field_name: string, value: string) => void;
  errors?: Record<string, string>;
  /** Category prefix - used to enable contextual helpers (e.g. lease direction labels) */
  categoryPrefix?: string;
  /** Optional title above the section */
  title?: string;
  /** Number of columns (default 2) */
  columns?: 1 | 2;
  /** When true, render values as read-only text instead of inputs */
  readOnly?: boolean;
}

export function CustomFieldsRenderer({
  fields,
  values,
  onChange,
  errors = {},
  categoryPrefix,
  title,
  columns = 2,
  readOnly = false,
}: Props) {
  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [fields],
  );

  const { data: sites } = useSites();
  const siteNames = useMemo(
    () => (sites ?? []).filter((s: any) => s.is_active).map((s: any) => String(s.name)),
    [sites],
  );
  const createSite = useCreateSite();
  const { isAdmin } = useAuth();
  const addOption = useAddCategoryFieldOption();
  const canAddOptions = isAdmin && !readOnly;

  /** Replaces window.prompt: one labelled text dialog for "new list value" and "new site". */
  const [prompt, setPrompt] = useState<
    | { kind: "option"; cf: CustomField }
    | { kind: "site"; cf: CustomField; selected: string[] }
    | null
  >(null);
  const [promptValue, setPromptValue] = useState("");
  const [promptBusy, setPromptBusy] = useState(false);
  const openPrompt = (p: NonNullable<typeof prompt>) => { setPromptValue(""); setPrompt(p); };

  const submitPrompt = async () => {
    const v = promptValue.trim();
    if (!prompt || !v) return;
    setPromptBusy(true);
    try {
      if (prompt.kind === "option") {
        await addOption.mutateAsync({ fieldId: prompt.cf.id, newOption: v });
        toast({ title: "הערך נוסף לרשימה" });
      } else {
        const site = await createSite.mutateAsync({ name: v, address: "", contact_name: "", phone: "" } as any);
        toast({ title: "האתר נוסף", description: site.name });
        if (!prompt.selected.includes(site.name)) onChange(prompt.cf.field_name, [...prompt.selected, site.name].join(", "));
      }
      setPrompt(null);
    } catch (e: any) {
      toast({ title: prompt.kind === "option" ? "שגיאה בהוספת ערך" : "שגיאה בהוספת אתר", description: e?.message, variant: "destructive" });
    } finally {
      setPromptBusy(false);
    }
  };

  const handleAddOption = (cf: CustomField) => openPrompt({ kind: "option", cf });

  // For LEASE category: derive contextual labels based on the "כיוון חוזה" value
  const leaseDirection = categoryPrefix === "LEASE" ? values["כיוון חוזה"] : undefined;
  const isCompanyRenting = leaseDirection === "החברה שוכרת";
  const isCompanyLeasing = leaseDirection === "החברה משכירה";

  const getHelperText = (fieldName: string): string | undefined => {
    if (categoryPrefix !== "LEASE" || !leaseDirection) return undefined;
    if (fieldName === "שם הצד השני") {
      return isCompanyRenting ? "שם המשכיר (בעל הנכס)" : "שם השוכר";
    }
    if (fieldName === "ח״פ/ת״ז של הצד השני") {
      return isCompanyRenting ? "ח״פ/ת״ז של המשכיר" : "ח״פ/ת״ז של השוכר";
    }
    if (fieldName === "שם איש קשר") {
      return isCompanyRenting ? "איש קשר אצל המשכיר/מנהל הנכס" : "איש קשר אצל השוכר";
    }
    if (fieldName === "דמי שכירות חודשיים") {
      return isCompanyRenting ? "סכום ששולם על ידי החברה" : "סכום שמתקבל מהשוכר";
    }
    return undefined;
  };

  if (sortedFields.length === 0) return null;

  return (
    <div className="border-t border-border/50 pt-3 mt-3">
      {title && (
        <p className="text-xs font-medium text-muted-foreground mb-2">{title}</p>
      )}
      <div className={cn("grid gap-3", columns === 2 ? "grid-cols-2" : "grid-cols-1")}>
        {sortedFields.map((cf) => {
          const errKey = `cf_${cf.field_name}`;
          const helper = getHelperText(cf.field_name);
          const value = values[cf.field_name] ?? "";
          // Label, control, helper and error are wired by id so screen readers read them together.
          const fieldId = `cf-${cf.id}`;
          const labelId = `${fieldId}-label`;
          const helperId = helper ? `${fieldId}-help` : undefined;
          const errorId = errors[errKey] ? `${fieldId}-error` : undefined;
          const describedBy = [helperId, errorId].filter(Boolean).join(" ") || undefined;
          return (
            <div key={cf.id}>
              <div className="flex items-center justify-between mb-1 gap-2">
                <label id={labelId} htmlFor={readOnly || cf.field_type === "list" ? undefined : fieldId} className="text-sm font-medium">
                  {cf.field_name}
                  {cf.is_required && !readOnly && <span className="text-destructive mr-1" aria-hidden="true">*</span>}
                </label>
                {canAddOptions && (cf.field_type === "list" || cf.field_type === "list_multi") && (
                  <button
                    type="button"
                    onClick={() => handleAddOption(cf)}
                    className="min-h-8 px-1 text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title="הוסף ערך חדש לרשימה"
                    aria-label={`הוסף ערך חדש לרשימה ${cf.field_name}`}
                  >
                    <Plus className="w-3 h-3" aria-hidden="true" /> ערך חדש
                  </button>
                )}
              </div>
              {readOnly ? (
                (() => {
                  const isDate = cf.field_type === "date";
                  const isNumber = cf.field_type === "number";
                  const fname = cf.field_name;
                  const isPhone = /טלפון|נייד|פקס|phone|mobile/i.test(fname);
                  const isEmail = /אימייל|מייל|email|דוא"?ל/i.test(fname);
                  const baseCls = "px-3 py-2 bg-muted/40 rounded-lg text-sm min-h-[40px] whitespace-pre-wrap break-words text-right";
                  if (!value) {
                    return <div className={baseCls} dir="rtl"><span className="text-muted-foreground">—</span></div>;
                  }
                  if (isPhone) {
                    const digits = value.replace(/[^\d+]/g, "");
                    // Convert local Israeli mobile (05x...) to international 9725x...
                    let intl = digits;
                    if (intl.startsWith("0")) intl = "972" + intl.slice(1);
                    intl = intl.replace(/^\+/, "");
                    return (
                      <a
                        href={`https://wa.me/${intl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        dir="ltr"
                        className={cn(baseCls, "block text-primary hover:underline")}
                      >
                        {value}
                      </a>
                    );
                  }
                  if (isEmail) {
                    return (
                      <a
                        href={`mailto:${value}`}
                        dir="ltr"
                        className={cn(baseCls, "block text-primary hover:underline")}
                      >
                        {value}
                      </a>
                    );
                  }
                  return (
                    <div className={baseCls} dir={isDate || isNumber ? "ltr" : "rtl"}>
                      {isDate ? new Date(value).toLocaleDateString("en-GB") : value}
                    </div>
                  );
                })()
              ) : cf.field_type === "list" ? (
                <div role="group" aria-labelledby={labelId} aria-describedby={describedBy}>
                <SearchableSelect
                  value={value}
                  onChange={(v) => onChange(cf.field_name, v)}
                  options={(Array.isArray(cf.field_options) ? cf.field_options : []).map(
                    (opt: any) => ({ value: String(opt), label: String(opt) }),
                  )}
                  placeholder="בחר..."
                  error={!!errors[errKey]}
                />
                </div>
              ) : cf.field_type === "list_multi" || isSiteField(cf.field_name) ? (
                (() => {
                  const opts = isSiteField(cf.field_name)
                    ? siteNames
                    : (Array.isArray(cf.field_options) ? cf.field_options : []).map(String);
                  const selected = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
                  const toggle = (opt: string) => {
                    const next = selected.includes(opt)
                      ? selected.filter((s) => s !== opt)
                      : [...selected, opt];
                    onChange(cf.field_name, next.join(", "));
                  };
                  return (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          id={fieldId}
                          aria-labelledby={`${labelId} ${fieldId}`}
                          aria-describedby={describedBy}
                          aria-invalid={errors[errKey] ? true : undefined}
                          className={cn(
                            "w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 text-right flex items-center justify-between gap-2 min-h-[40px]",
                            errors[errKey] ? "ring-2 ring-destructive/50" : "focus:ring-primary/30",
                          )}
                        >
                          <span className="flex flex-wrap gap-1 flex-1 min-w-0">
                            {selected.length === 0 ? (
                              <span className="text-muted-foreground">בחר אפשרויות...</span>
                            ) : (
                              selected.map((s) => (
                                <span
                                  key={s}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-primary text-xs"
                                >
                                  {s}
                                  <XIcon
                                    aria-hidden="true"
                                    className="w-3 h-3 cursor-pointer hover:text-destructive"
                                    onClick={(e) => { e.stopPropagation(); toggle(s); }}
                                  />
                                </span>
                              ))
                            )}
                          </span>
                          <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-1" align="start">
                        <div className="max-h-64 overflow-auto">
                          {opts.length === 0 && (
                            <p className="text-xs text-muted-foreground p-2 text-center">{isSiteField(cf.field_name) ? "אין אתרים — הוסיפו אתר חדש" : "אין אפשרויות מוגדרות"}</p>
                          )}
                          {isSiteField(cf.field_name) && (
                            <button
                              type="button"
                              className="w-full flex items-center gap-1 px-2 py-1.5 rounded hover:bg-muted text-sm text-primary border-b border-border/50 mb-1"
                              onClick={() => openPrompt({ kind: "site", cf, selected })}
                            >
                              <Plus className="w-3.5 h-3.5" aria-hidden="true" /> אתר חדש
                            </button>
                          )}
                          {opts.map((opt) => {
                            const checked = selected.includes(opt);
                            return (
                              <label
                                key={opt}
                                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                              >
                                <Checkbox checked={checked} onCheckedChange={() => toggle(opt)} />
                                <span>{opt}</span>
                              </label>
                            );
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>
                  );
                })()
              ) : (
                <input
                  id={fieldId}
                  aria-invalid={errors[errKey] ? true : undefined}
                  aria-describedby={describedBy}
                  aria-required={cf.is_required || undefined}
                  type={
                    cf.field_type === "number"
                      ? "number"
                      : cf.field_type === "date"
                        ? "date"
                        : "text"
                  }
                  value={value}
                  onChange={(e) => onChange(cf.field_name, e.target.value)}
                  className={cn(
                    "w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2",
                    errors[errKey] ? "ring-2 ring-destructive/50" : "focus:ring-primary/30",
                  )}
                  dir={cf.field_type === "date" || cf.field_type === "number" ? "ltr" : "rtl"}
                />
              )}
              {helper && (
                <p id={helperId} className="text-xs text-primary/80 mt-1 flex items-center gap-1">
                  <Info className="w-3 h-3 shrink-0" aria-hidden="true" />
                  {helper}
                </p>
              )}
              {errors[errKey] && (
                <p id={errorId} role="alert" className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" aria-hidden="true" />
                  {errors[errKey]}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {/* Lease direction summary */}
      {categoryPrefix === "LEASE" && leaseDirection && (
        <div className="mt-3 p-2 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary flex items-start gap-2">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {isCompanyRenting && "החברה היא השוכרת בחוזה זה — הצד השני הוא בעל הנכס/המשכיר."}
            {isCompanyLeasing && "החברה היא המשכירה בחוזה זה — הצד השני הוא השוכר של הנכס."}
          </span>
        </div>
      )}

      <Dialog open={!!prompt} onOpenChange={(v) => { if (!v && !promptBusy) setPrompt(null); }}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{prompt?.kind === "site" ? "הוספת אתר חדש" : `ערך חדש לרשימה "${prompt?.cf.field_name ?? ""}"`}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); void submitPrompt(); }} className="space-y-1.5">
            <Label htmlFor="cf-prompt-value">{prompt?.kind === "site" ? "שם האתר" : "הערך"}</Label>
            <Input id="cf-prompt-value" value={promptValue} onChange={(e) => setPromptValue(e.target.value)} autoFocus disabled={promptBusy} />
          </form>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPrompt(null)} disabled={promptBusy}>ביטול</Button>
            <Button onClick={submitPrompt} disabled={!promptValue.trim()} loading={promptBusy} loadingText="מוסיף…">הוסף</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
