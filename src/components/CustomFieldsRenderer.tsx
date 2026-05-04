import { useMemo } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { AlertCircle, Info, ChevronDown, X as XIcon } from "lucide-react";

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
          return (
            <div key={cf.id}>
              <label className="text-sm font-medium mb-1 block">
                {cf.field_name}
                {cf.is_required && !readOnly && <span className="text-destructive mr-1">*</span>}
              </label>
              {readOnly ? (
                <div className="px-3 py-2 bg-muted/40 rounded-lg text-sm min-h-[40px] whitespace-pre-wrap break-words" dir={cf.field_type === "date" || cf.field_type === "number" ? "ltr" : "rtl"}>
                  {cf.field_type === "date" && value
                    ? new Date(value).toLocaleDateString("he-IL")
                    : (value || <span className="text-muted-foreground">—</span>)}
                </div>
              ) : cf.field_type === "list" ? (
                <SearchableSelect
                  value={value}
                  onChange={(v) => onChange(cf.field_name, v)}
                  options={(Array.isArray(cf.field_options) ? cf.field_options : []).map(
                    (opt: any) => ({ value: String(opt), label: String(opt) }),
                  )}
                  placeholder="בחר..."
                  error={!!errors[errKey]}
                />
              ) : cf.field_type === "list_multi" ? (
                (() => {
                  const opts = (Array.isArray(cf.field_options) ? cf.field_options : []).map(String);
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
                            <p className="text-xs text-muted-foreground p-2 text-center">אין אפשרויות מוגדרות</p>
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
                <p className="text-[11px] text-primary/80 mt-1 flex items-center gap-1">
                  <Info className="w-3 h-3 shrink-0" />
                  {helper}
                </p>
              )}
              {errors[errKey] && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
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
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            {isCompanyRenting && "החברה היא השוכרת בחוזה זה — הצד השני הוא בעל הנכס/המשכיר."}
            {isCompanyLeasing && "החברה היא המשכירה בחוזה זה — הצד השני הוא השוכר של הנכס."}
          </span>
        </div>
      )}
    </div>
  );
}
