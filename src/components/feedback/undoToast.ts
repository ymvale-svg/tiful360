import { toast } from "sonner";

interface UndoToastOptions {
  /** Reverses the action. Its errors are shown as a toast of their own. */
  onUndo: () => unknown | Promise<unknown>;
  description?: string;
  /** How long "ביטול" stays available. */
  duration?: number;
}

/** A success toast with a "ביטול" button, for actions that apply at once (reassign, punch, status). */
export function undoToast(message: string, { onUndo, description, duration = 5000 }: UndoToastOptions) {
  return toast.success(message, {
    description,
    duration,
    action: {
      label: "ביטול",
      onClick: async () => {
        try {
          await onUndo();
          toast("הפעולה בוטלה");
        } catch (e) {
          toast.error(e instanceof Error && e.message ? e.message : "לא הצלחנו לבטל. נסו שוב.");
        }
      },
    },
  });
}
