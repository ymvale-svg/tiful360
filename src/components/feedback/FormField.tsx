import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: ReactNode;
  /** The single input/select/textarea this field labels. It receives id, aria-invalid and aria-describedby. */
  children: ReactElement;
  /** Shown under the field and announced; also marks the control invalid. */
  error?: string | null;
  /** Persistent helper text, e.g. "לפחות 6 תווים". */
  hint?: ReactNode;
  required?: boolean;
  id?: string;
  className?: string;
}

/** Label + control + hint + error, wired together so screen readers read them as one field. */
export function FormField({ label, children, error, hint, required, id, className }: FormFieldProps) {
  const auto = useId();
  const fieldId = id ?? (isValidElement(children) && (children.props as { id?: string }).id) ?? `f${auto}`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: fieldId,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
        "aria-required": required || undefined,
      })
    : children;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={fieldId}>
        {label}
        {required && <span className="text-destructive ms-0.5" aria-hidden="true">*</span>}
      </Label>
      {control}
      {hint && <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={errorId} role="alert" className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

/** Moves focus to the first control marked aria-invalid inside `root`, after a failed submit. */
export function focusFirstInvalid(root: ParentNode | null | undefined = document) {
  const el = root?.querySelector<HTMLElement>('[aria-invalid="true"]');
  el?.focus();
  el?.scrollIntoView({ block: "center", behavior: "smooth" });
}
