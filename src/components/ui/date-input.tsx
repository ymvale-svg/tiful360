import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** ISO yyyy-mm-dd -> dd/mm/yyyy */
export function isoToDmy(iso?: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** dd/mm/yyyy -> ISO yyyy-mm-dd, or null when incomplete/invalid */
export function dmyToIso(dmy: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dmy.trim());
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function mask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += "/" + digits.slice(2, 4);
  if (digits.length > 4) out += "/" + digits.slice(4, 8);
  return out;
}

type Props = React.ComponentProps<"input">;

/**
 * Date field that always shows and accepts DD/MM/YYYY regardless of browser
 * language, while keeping value/onChange in ISO yyyy-mm-dd like a native date input.
 */
export const DateInput = React.forwardRef<HTMLInputElement, Props>(
  ({ className, type: _type, value, defaultValue, onChange, onBlur, min, max, name, id, disabled, required, placeholder, style, ...rest }, ref) => {
    const iso = value !== undefined ? String(value ?? "") : undefined;
    const [text, setText] = React.useState(() => isoToDmy(iso ?? String(defaultValue ?? "")));
    const pickerRef = React.useRef<HTMLInputElement>(null);
    const lastEmitted = React.useRef<string | undefined>(iso);

    React.useEffect(() => {
      if (iso !== undefined && iso !== lastEmitted.current) {
        setText(isoToDmy(iso));
        lastEmitted.current = iso;
      }
    }, [iso]);

    const emit = (v: string) => {
      lastEmitted.current = v;
      const target = { value: v, name: name ?? "", id: id ?? "", type: "date" } as unknown as HTMLInputElement;
      onChange?.({ target, currentTarget: target } as React.ChangeEvent<HTMLInputElement>);
    };

    const handleText = (e: React.ChangeEvent<HTMLInputElement>) => {
      const t = mask(e.target.value);
      setText(t);
      if (t === "") emit("");
      else {
        const parsed = dmyToIso(t);
        if (parsed) emit(parsed);
      }
    };

    return (
      <div className={cn("relative w-full", className?.includes("w-") ? "" : "")} style={style}>
        <input
          {...rest}
          ref={ref}
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          dir="ltr"
          disabled={disabled}
          required={required}
          placeholder={placeholder ?? "DD/MM/YYYY"}
          value={text}
          onChange={handleText}
          onBlur={(e) => {
            if (text && !dmyToIso(text)) setText(isoToDmy(lastEmitted.current));
            onBlur?.(e);
          }}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pl-9 text-base text-right ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            className,
            "pl-9",
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="בחירת תאריך"
          className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50"
          onClick={() => {
            const p = pickerRef.current;
            if (!p) return;
            try { (p as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { p.click(); }
          }}
        >
          <CalendarIcon className="h-4 w-4" />
        </button>
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 bottom-0 h-0 w-0 opacity-0"
          value={lastEmitted.current ?? dmyToIso(text) ?? ""}
          min={min as string | undefined}
          max={max as string | undefined}
          onChange={(e) => {
            setText(isoToDmy(e.target.value));
            emit(e.target.value);
          }}
        />
      </div>
    );
  },
);
DateInput.displayName = "DateInput";
