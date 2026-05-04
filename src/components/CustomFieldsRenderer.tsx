import { useMemo } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import { AlertCircle, Info } from "lucide-react";

export interface CustomField {
  id: string;
  field_name: string;
  field_type: "text" | "number" | "date" | "list" | string;
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
}

/**
 * Renders dynamic custom fields stored on assets.custom_fields.
 * Adds contextual helper text for known categories (currently: LEASE direction).
 */
export function CustomFieldsRenderer({
  fields,
  values,
  onChange,
  errors = {},
  categoryPrefix,
  title,
  columns = 2,
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
                {cf.is_required && <span className="text-destructive mr-1">*</span>}
              </label>
              {cf.field_type === "list" ? (
                <SearchableSelect
                  value={value}
                  onChange={(v) => onChange(cf.field_name, v)}
                  options={(Array.isArray(cf.field_options) ? cf.field_options : []).map(
                    (opt: any) => ({ value: String(opt), label: String(opt) }),
                  )}
                  placeholder="בחר..."
                  error={!!errors[errKey]}
                />
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
