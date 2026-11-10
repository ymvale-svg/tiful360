import { useState } from "react";
import { Copy, KeyRound, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/feedback/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { useScanKey, useScanStatus } from "@/hooks/useSystemAccess";
import { formatIsraelDateTime } from "@/domain/systemAccess/protocol";
import type { AccessSystem } from "@/domain/systemAccess/types";

/** The office agent's automatic scan of this system's folder tree: status, key, revoke. */
export function TreeScanPanel({ system }: { system: AccessSystem }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { data: status, isLoading, error, refetch } = useScanStatus(system.id);
  const { create, revoke } = useScanKey(system.id);
  const [shownKey, setShownKey] = useState<string | null>(null);

  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text);
    toast({ title: `${what} הועתק` });
  };

  const newKey = () =>
    confirm({
      title: status?.connected ? "ליצור מפתח חדש?" : `חיבור סריקה אוטומטית ל${system.name}`,
      description: status?.connected
        ? "המפתח הקיים יפסיק לעבוד, וצריך לעדכן את ה-Agent במפתח החדש."
        : "נוצר מפתח שמאפשר ל-Agent במשרד לשלוח את עץ התיקיות של המערכת הזו בלבד. המפתח יוצג פעם אחת.",
      confirmLabel: "צור מפתח",
      onConfirm: async () => setShownKey(await create.mutateAsync()),
    });

  const disconnect = () =>
    confirm({
      title: "לנתק את הסריקה האוטומטית?",
      description: "ה-Agent לא יוכל לשלוח יותר את העץ. העץ הקיים נשאר כמו שהוא.",
      confirmLabel: "נתק",
      destructive: true,
      onConfirm: async () => {
        await revoke.mutateAsync();
        setShownKey(null);
      },
    });

  return (
    <div className="rounded-lg bg-muted/40 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><RefreshCw className="w-4 h-4" aria-hidden="true" /> סריקה אוטומטית</h3>
        {!isLoading && !error && <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => { void newKey(); }} loading={create.isPending} loadingText="יוצר…">
            <KeyRound className="w-4 h-4" /> {status?.connected ? "מפתח חדש" : "חיבור סריקה אוטומטית"}
          </Button>
          {status?.connected && <Button size="sm" variant="ghost" onClick={() => { void disconnect(); }}>נתק</Button>}
        </div>}
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground" role="status">בודק את מצב הסריקה…</p>
      ) : error ? (
        <p className="text-xs text-destructive-text" role="alert">
          לא הצלחנו לבדוק את מצב הסריקה.{" "}
          <button type="button" onClick={() => { void refetch(); }} className="font-medium underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">נסו שוב</button>
        </p>
      ) : (
      <p className="text-xs text-muted-foreground tabular-nums">
        {status?.connected
          ? status.last_at
            ? `סריקה אחרונה ${formatIsraelDateTime(status.last_at)}${status.agent ? ` מ-${status.agent}` : ""}: `
              + `${status.last_result?.added ?? 0} חדשות, ${status.last_result?.missing ?? 0} לא נמצאו, ${status.last_result?.total ?? 0} בסך הכול`
            : "מחובר. עוד לא התקבלה סריקה מה-Agent."
          : "ה-Agent במשרד יכול לסרוק את הכונן כל לילה במקום ייבוא ידני. נשלחים רק שמות תיקיות."}
      </p>
      )}
      {shownKey && (
        <div role="status" className="rounded-lg border border-warning/50 bg-background p-3 space-y-2 text-sm">
          <p className="font-medium">שמרו את הפרטים עכשיו: המפתח לא יוצג שוב.</p>
          {[
            ["ACCESS_TREE_SYSTEM_ID", system.id, "מזהה המערכת"],
            ["ACCESS_TREE_TOKEN", shownKey, "המפתח"],
          ].map(([name, value, label]) => (
            <div key={name} className="flex flex-wrap items-center gap-2">
              <code dir="ltr" className="flex-1 min-w-0 break-all text-xs bg-muted rounded p-1.5">{name}={value}</code>
              <Button size="sm" variant="outline" onClick={() => copy(`${name}=${value}`, label)}>
                <Copy className="w-4 h-4" /> העתק
              </Button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            מוסיפים לקובץ ‎.env של ה-Agent יחד עם ACCESS_TREE_ROOT (למשל P:\), ומריצים python access_tree.py --once לבדיקה.
          </p>
        </div>
      )}
    </div>
  );
}
