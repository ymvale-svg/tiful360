import { useCallback } from "react";
import { useConfirm } from "./ConfirmDialog";

/**
 * Wraps a dialog's onOpenChange so closing it (Esc, outside click, X, "ביטול") with unsaved
 * changes asks first:
 *   const guard = useDirtyGuard(isDirty);
 *   <Dialog open={open} onOpenChange={guard(setOpen)}>
 * Pass `busy` to block closing entirely while a save or upload runs.
 */
export function useDirtyGuard(dirty: boolean, busy = false) {
  const confirm = useConfirm();
  return useCallback(
    (onOpenChange: (open: boolean) => void) => (open: boolean) => {
      if (open) return onOpenChange(true);
      if (busy) return;
      if (!dirty) return onOpenChange(false);
      void confirm({
        title: "לסגור בלי לשמור?",
        description: "השינויים שהזנתם יאבדו.",
        confirmLabel: "סגור בלי לשמור",
        cancelLabel: "המשך לערוך",
        destructive: true,
      }).then((ok) => { if (ok) onOpenChange(false); });
    },
    [busy, confirm, dirty],
  );
}
