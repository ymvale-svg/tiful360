import { useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAssets } from "@/hooks/useData";

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Sub-category (asset_groups.id) — suggestions are scoped to it only */
  groupId?: string | null;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Free-text input for "יצרן ומודל" that also offers the values already used
 * by other items in the SAME sub-category (תת-קטגוריה) as a dropdown list.
 */
export function ManufacturerModelInput({
  value,
  onChange,
  groupId,
  placeholder = "למשל: Apple MacBook Pro 16",
  className,
  disabled,
}: Props) {
  const { data: assets } = useAssets();
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suggestions = useMemo(() => {
    if (!groupId) return [] as string[];
    const set = new Set<string>();
    (assets ?? []).forEach((a: any) => {
      if (a.group_id === groupId && a.manufacturer_model?.trim()) {
        set.add(a.manufacturer_model.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "he"));
  }, [assets, groupId]);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter((s) => s.toLowerCase().includes(q) && s.toLowerCase() !== q);
  }, [suggestions, value]);

  const showList = open && filtered.length > 0;

  return (
    <div className="relative">
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 120); }}
        placeholder={placeholder}
        className={cn(
          "w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30",
          suggestions.length > 0 && "pl-8",
          className,
        )}
      />
      {suggestions.length > 0 && !disabled && (
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((o) => !o)}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="הצג ערכים קיימים"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      )}
      {showList && (
        <ul className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto bg-popover border border-border rounded-lg shadow-md py-1">
          {filtered.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  onChange(s);
                  setOpen(false);
                }}
                className="w-full text-right px-3 py-1.5 text-sm hover:bg-accent"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
