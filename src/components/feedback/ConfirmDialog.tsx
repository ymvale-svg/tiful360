import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for deletes and other actions that can't be undone. */
  destructive?: boolean;
  /** The user must type this exact text before confirming (e.g. a company name). */
  requireText?: string;
  /**
   * The action itself. When given, it runs inside the dialog: the dialog stays open with a
   * spinner until it settles, closes on success, and shows the error and stays open on failure.
   */
  onConfirm?: () => unknown | Promise<unknown>;
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

/**
 * Promise-based confirmation, replacing window.confirm / window.prompt:
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "למחוק את המסמך?", destructive: true }))) return;
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const queue = useRef<Pending[]>([]);

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => {
    const next = { ...opts, resolve };
    setCurrent((cur) => {
      if (cur) { queue.current.push(next); return cur; }
      return next;
    });
  }), []);

  const finish = (ok: boolean) => {
    current?.resolve(ok);
    setBusy(false);
    setError(null);
    setTyped("");
    setCurrent(queue.current.shift() ?? null);
  };

  const accept = async () => {
    if (!current) return;
    if (!current.onConfirm) return finish(true);
    setBusy(true);
    setError(null);
    try {
      await current.onConfirm();
      finish(true);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error && e.message ? e.message : "הפעולה נכשלה. נסו שוב.");
    }
  };

  const blocked = !!current?.requireText && typed.trim() !== current.requireText.trim();

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={!!current}
        onOpenChange={(open) => { if (!open && !busy) finish(false); }}
      >
        <AlertDialogContent dir="rtl" onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}>
          <AlertDialogHeader>
            <AlertDialogTitle>{current?.title}</AlertDialogTitle>
            {current?.description && <AlertDialogDescription asChild={typeof current.description !== "string"}>
              {typeof current.description === "string" ? current.description : <div>{current.description}</div>}
            </AlertDialogDescription>}
          </AlertDialogHeader>
          {current?.requireText && (
            <div className="space-y-1.5">
              <label htmlFor="confirm-require-text" className="text-sm">
                כדי לאשר, הקלידו <b className="font-semibold">{current.requireText}</b>
              </label>
              <Input id="confirm-require-text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" disabled={busy} />
            </div>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={busy}>{current?.cancelLabel ?? "ביטול"}</AlertDialogCancel>
            <Button
              variant={current?.destructive ? "destructive" : "default"}
              onClick={() => { void accept(); }}
              disabled={busy || blocked}
              aria-busy={busy || undefined}
            >
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
              {current?.confirmLabel ?? "אישור"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}
