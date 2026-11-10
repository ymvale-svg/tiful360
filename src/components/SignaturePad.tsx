import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";

// react-signature-canvas ships class-component types that clash with
// @types/react 18.3's JSX check (TS2786). Runtime is fine — cast only.
// Its UMD build exports `{ __esModule: true, default: Component }`, and Vite's
// optimized copy hands that whole object to the default import — so unwrap it,
// otherwise React receives an object and the entire screen crashes to blank.
export function unwrapComponent(mod: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = mod as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (m && typeof m === "object" && "default" in m ? m.default : m) as any;
}
export const SignatureCanvasView = unwrapComponent(SignatureCanvas);
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Eraser, Keyboard, PenLine } from "lucide-react";

export interface SignaturePadHandle {
  getDataUrl: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
}

interface Props {
  label?: string;
  height?: number;
}

type Mode = "draw" | "type";

/** Ink colour of the signature image (the PDF/print output, not a UI colour). */
const PEN_COLOR = "#111827";
const TYPED_FONT = `Heebo, "Segoe Script", "Brush Script MT", cursive`;

/**
 * Renders a typed name onto the signature canvas so keyboard and assistive-technology
 * users can sign (WCAG 2.1.1). The output is the same canvas, so callers see no difference.
 */
function drawTypedSignature(canvas: HTMLCanvasElement, name: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  const text = name.trim();
  if (!text) return;
  let size = Math.min(48, Math.floor(height * 0.45));
  const maxWidth = width * 0.9;
  const setFont = () => { ctx.font = `italic 500 ${size}px ${TYPED_FONT}`; };
  setFont();
  while (size > 12 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    setFont();
  }
  ctx.fillStyle = PEN_COLOR;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = "rtl";
  ctx.fillText(text, width / 2, height / 2, maxWidth);
}

export const SignaturePad = forwardRef<SignaturePadHandle, Props>(
  ({ label = "חתימה", height = 160 }, ref) => {
    const sigRef = useRef<SignatureCanvas>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState<{ w: number; h: number } | null>(null);
    const [mode, setMode] = useState<Mode>("draw");
    const [typedName, setTypedName] = useState("");
    const uid = useId();
    const labelId = `sig-label${uid}`;
    const hintId = `${labelId}-hint`;
    const nameId = `${labelId}-name`;
    const modeName = `${labelId}-mode`;

    useEffect(() => {
      if (!containerRef.current) return;
      const el = containerRef.current;
      const update = () => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0) setSize({ w: Math.floor(rect.width), h: height });
      };
      update();
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }, [height]);

    const paintTyped = useCallback((name: string) => {
      const canvas = sigRef.current?.getCanvas();
      if (canvas) drawTypedSignature(canvas, name);
    }, []);

    // Typed mode: no freehand strokes, the canvas shows the typed name. Redraw when the
    // name changes, when the canvas is resized (resizing wipes it) and once fonts load.
    useEffect(() => {
      const pad = sigRef.current;
      if (!pad) return;
      if (mode === "type") {
        pad.off();
        paintTyped(typedName);
        let alive = true;
        document.fonts?.ready.then(() => { if (alive) paintTyped(typedName); }).catch(() => {});
        return () => { alive = false; };
      }
      pad.on();
    }, [mode, typedName, size, paintTyped]);

    const typedIsEmpty = () => typedName.trim() === "";

    const clearAll = () => {
      sigRef.current?.clear();
      setTypedName("");
    };

    const changeMode = (next: Mode) => {
      if (next === mode) return;
      // The canvas only ever holds the active mode's signature.
      sigRef.current?.clear();
      setMode(next);
    };

    useImperativeHandle(ref, () => ({
      getDataUrl: () => {
        const pad = sigRef.current;
        if (!pad) return null;
        if (mode === "type") {
          if (typedIsEmpty()) return null;
          paintTyped(typedName);
          return pad.getCanvas().toDataURL("image/png");
        }
        if (pad.isEmpty()) return null;
        return pad.getCanvas().toDataURL("image/png");
      },
      clear: clearAll,
      isEmpty: () => (mode === "type" ? typedIsEmpty() : sigRef.current?.isEmpty() ?? true),
    }));

    const modeOption = (value: Mode, text: string, Icon: typeof PenLine) => (
      <label
        className={cn(
          "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors duration-200",
          "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-1",
          mode === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <input
          type="radio"
          className="sr-only"
          name={modeName}
          value={value}
          checked={mode === value}
          onChange={() => changeMode(value)}
        />
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        {text}
      </label>
    );

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span id={labelId} className="text-sm font-medium">{label}</span>
          <div className="flex items-center gap-2">
            <fieldset className="inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5">
              <legend className="sr-only">{`אופן ${label}`}</legend>
              {modeOption("draw", "ציור", PenLine)}
              {modeOption("type", "הקלדה", Keyboard)}
            </fieldset>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={clearAll}
              aria-label={`נקה ${label}`}
            >
              <Eraser className="w-3 h-3" aria-hidden="true" />
              נקה
            </Button>
          </div>
        </div>
        {mode === "type" && (
          <div className="space-y-1.5">
            <label htmlFor={nameId} className="text-sm">הקלדת שם מלא</label>
            <Input
              id={nameId}
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              autoComplete="name"
              aria-describedby={hintId}
            />
          </div>
        )}
        <div
          ref={containerRef}
          role="img"
          aria-labelledby={labelId}
          aria-describedby={hintId}
          className="border-2 border-dashed border-border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
          style={{ height, backgroundColor: "hsl(var(--signature-surface))" }}
        >
          {size && (
            <SignatureCanvasView
              ref={sigRef}
              penColor={PEN_COLOR}
              backgroundColor="rgba(255,255,255,0)"
              canvasProps={{
                width: size.w,
                height: size.h,
                "aria-label": label,
                className: mode === "type" ? "pointer-events-none" : "cursor-crosshair touch-none",
                style: { width: "100%", height: "100%", display: "block" },
              } as React.CanvasHTMLAttributes<HTMLCanvasElement>}
            />
          )}
        </div>
        <span id={hintId} className="sr-only">
          {mode === "type"
            ? "השם המוקלד יוצג כחתימה בתוך המסגרת"
            : "השתמש בעכבר או באצבע על מסך מגע כדי לחתום בתוך המסגרת, או בחר הקלדה כדי לחתום בהקלדת השם"}
        </span>
      </div>
    );
  },
);
SignaturePad.displayName = "SignaturePad";
