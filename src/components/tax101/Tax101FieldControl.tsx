import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { Tax101Field } from "@/lib/tax101/layout";
import { dateToCells, formatDmy } from "@/lib/tax101/format";

export type FieldState = "prefilled" | "changed" | "missing" | "plain";

interface Props {
  field: Tax101Field;
  value: unknown;
  scale: number;
  state: FieldState;
  readOnly: boolean;
  onChange: (value: unknown) => void;
}

/** Same ink on screen as in the PDF; the page image is white in both themes. */
const INK = "text-blue-900";

const STATE_CLASS: Record<FieldState, string> = {
  prefilled: "bg-sky-100/60",
  changed: "bg-amber-100/80",
  missing: "bg-red-100/80 ring-1 ring-red-500/70",
  plain: "bg-blue-50/40 hover:bg-blue-50/80",
};

/** "07032026" → "2026-03-07" when it is a real calendar date, else "". */
function cellsToIso(digits: string): string {
  if (!/^\d{8}$/.test(digits)) return "";
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const yyyy = digits.slice(4);
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(dd) || d.getUTCMonth() + 1 !== Number(mm)) return "";
  if (Number(yyyy) < 1900 || Number(yyyy) > 2100) return "";
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Typing buffer for dates: the stored value only changes when the date is complete
 * and valid, so a half-typed date stays on screen while the stored value is "".
 */
function useDateBuffer(iso: string, toText: (iso: string) => string) {
  const [text, setText] = useState(() => toText(iso));
  const emitted = useRef(iso);
  useEffect(() => {
    // Only an outside change (prefill, draft restore, mirrored field) replaces what is shown.
    if (iso !== emitted.current) {
      emitted.current = iso;
      setText(toText(iso));
    }
  }, [iso, toText]);
  const update = (nextText: string, nextIso: string) => {
    emitted.current = nextIso;
    setText(nextText);
  };
  return [text, update] as const;
}

const toCellsText = (iso: string) => dateToCells(iso);
const toLineText = (iso: string) => formatDmy(iso);

function lineMask(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export function Tax101FieldControl({ field: f, value, scale, state, readOnly, onChange }: Props) {
  const id = `t101-${f.id}`;
  const common = {
    id,
    "aria-label": f.label,
    "aria-invalid": state === "missing" || undefined,
    "data-path": f.path,
  };

  if (f.kind === "check") {
    const checked = f.value === undefined ? value === true : value === f.value;
    const w = (f.box.x1 - f.box.x0) * scale;
    const h = (f.box.bottom - f.box.top) * scale;
    const hit = Math.max(24, w, h);
    const style: CSSProperties = {
      left: f.box.x0 * scale + w / 2 - hit / 2,
      top: f.box.top * scale + h / 2 - hit / 2,
      width: hit,
      height: hit,
    };
    const isRadio = f.value !== undefined;
    const toggle = () => {
      if (readOnly) return;
      if (!isRadio) return onChange(!checked);
      if (checked && typeof f.value === "string") return onChange("");
      onChange(f.value);
    };
    return (
      <button
        type="button"
        {...common}
        role={isRadio ? "radio" : "checkbox"}
        aria-checked={checked}
        aria-disabled={readOnly || undefined}
        onClick={toggle}
        className={cn(
          "absolute grid place-items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          readOnly ? "cursor-default" : "cursor-pointer",
        )}
        style={style}
      >
        <span
          aria-hidden="true"
          className={cn("grid place-items-center rounded-[2px]", state === "missing" && "bg-red-100/80 ring-1 ring-red-500/70")}
          style={{ width: w * 0.8, height: h * 0.8 }}
        >
          {checked && (
            <svg viewBox="0 0 10 10" className={cn("h-full w-full", INK)} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.5 5.2 4 7.8 8.8 2" />
            </svg>
          )}
        </span>
      </button>
    );
  }

  // Box of every non-checkbox field
  const width =
    f.kind === "cells" ? f.pitch * f.n : f.kind === "dateCells" ? f.pitch * 8 : f.w;
  const box: CSSProperties = {
    left: f.x * scale,
    top: f.top * scale,
    width: width * scale,
    height: f.h * scale,
  };
  const fontPt = f.kind === "text" && f.size ? f.size : Math.min(9.5, f.h - 3);
  const fontSize = fontPt * scale;
  const inputClass = cn(
    "absolute rounded-[2px] border-0 p-0 outline-none focus-visible:ring-2 focus-visible:ring-primary",
    INK,
    readOnly ? "cursor-default" : "",
    STATE_CLASS[state],
  );

  if (f.mirror) {
    return (
      <div id={id} className={cn("absolute flex items-center px-0.5", INK)} style={{ ...box, fontSize }} dir="ltr" aria-hidden="true">
        {String(value ?? "")}
      </div>
    );
  }

  if (f.kind === "cells" || f.kind === "dateCells") {
    return <CellsInput f={f} value={value} scale={scale} fontSize={fontSize} box={box} className={inputClass} common={common} readOnly={readOnly} onChange={onChange} />;
  }

  if (f.kind === "dateLine") {
    return <DateLineInput f={f} value={value} fontSize={fontSize} box={box} className={inputClass} common={common} readOnly={readOnly} onChange={onChange} />;
  }

  if (f.kind === "phone") {
    return (
      <input
        {...common}
        type="tel"
        inputMode="tel"
        dir="ltr"
        autoComplete="off"
        readOnly={readOnly}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value.replace(/[^\d\-+ ]/g, "").slice(0, 15))}
        className={cn(inputClass, "bg-white px-1 text-left")}
        style={{ ...box, fontSize }}
      />
    );
  }

  // text
  const shown = value === undefined || value === null ? "" : String(value);
  const display = f.skipFirst ? shown.slice(1) : shown;
  return (
    <input
      {...common}
      type="text"
      dir={f.ltr ? "ltr" : "rtl"}
      inputMode={f.numeric ? "numeric" : undefined}
      autoComplete="off"
      readOnly={readOnly}
      maxLength={f.maxLength ? (f.skipFirst ? f.maxLength - 1 : f.maxLength) : undefined}
      value={display}
      onChange={(e) => {
        let v = e.target.value;
        if (f.numeric) {
          const digits = v.replace(/[^\d]/g, "");
          return onChange(digits === "" ? "" : Number(digits));
        }
        if (f.skipFirst) v = v ? `9${v.replace(/\D/g, "")}` : "";
        onChange(v);
      }}
      className={cn(inputClass, "px-1", f.numeric ? "text-center" : f.ltr ? "text-left" : "text-right")}
      style={{ ...box, fontSize }}
    />
  );
}

interface InnerProps {
  value: unknown;
  fontSize: number;
  box: CSSProperties;
  className: string;
  common: Record<string, unknown>;
  readOnly: boolean;
  onChange: (value: unknown) => void;
}

function CellsInput({
  f,
  scale,
  ...p
}: InnerProps & { f: Extract<Tax101Field, { kind: "cells" | "dateCells" }>; scale: number }) {
  const isDate = f.kind === "dateCells";
  const n = f.kind === "cells" ? f.n : 8;
  const skip = f.kind === "cells" && !!f.skipFirst;
  const [dateText, setDateText] = useDateBuffer(isDate ? String(p.value ?? "") : "", toCellsText);
  const raw = isDate ? dateText : String(p.value ?? "");
  const shown = skip ? raw.slice(1) : raw;

  // Monospace glyphs are ~0.6em wide; spread them so each digit sits in its printed cell.
  const cell = f.pitch * scale;
  const glyph = p.fontSize * 0.6;
  const style: CSSProperties = {
    ...p.box,
    fontSize: p.fontSize,
    letterSpacing: cell - glyph,
    paddingLeft: (cell - glyph) / 2,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  };

  return (
    <input
      {...p.common}
      type="text"
      dir="ltr"
      inputMode="numeric"
      autoComplete="off"
      readOnly={p.readOnly}
      maxLength={n}
      value={shown}
      placeholder={isDate ? "ddmmyyyy" : undefined}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, n);
        if (isDate) {
          const iso = cellsToIso(digits);
          setDateText(digits, iso);
          p.onChange(iso);
          return;
        }
        p.onChange(skip ? (digits ? `9${digits}` : "") : digits);
      }}
      className={cn(p.className, "overflow-hidden text-left placeholder:text-transparent")}
      style={style}
    />
  );
}

function DateLineInput({ f, ...p }: InnerProps & { f: Extract<Tax101Field, { kind: "dateLine" }> }) {
  const [text, setText] = useDateBuffer(String(p.value ?? ""), toLineText);
  return (
    <input
      {...p.common}
      type="text"
      dir="ltr"
      inputMode="numeric"
      autoComplete="off"
      placeholder="dd/mm/yyyy"
      readOnly={p.readOnly}
      value={text}
      onChange={(e) => {
        const masked = lineMask(e.target.value);
        const iso = cellsToIso(masked.replace(/\D/g, ""));
        setText(masked, iso);
        p.onChange(iso);
      }}
      className={cn(p.className, "px-0.5 text-center placeholder:text-slate-400/70", f.slashes && "bg-white")}
      style={{ ...p.box, fontSize: p.fontSize }}
    />
  );
}
