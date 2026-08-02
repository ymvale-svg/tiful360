import { useState } from "react";
import { CalendarPlus, Link2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const STORAGE_KEY = "leaveCalendarAutoSync";

/**
 * Google Calendar sync settings.
 * Auto-sync is offered as an option but requires connecting a Google account —
 * until then approved leave requests expose a manual "add to calendar" button.
 */
export function GoogleCalendarSyncCard() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(() => localStorage.getItem(STORAGE_KEY) === "1");

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 space-y-4 max-w-xl">
      <div className="flex items-center gap-3">
        <CalendarPlus className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">סנכרון יומן גוגל</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        כרגע כל חופשה מאושרת מציגה כפתור "הוסף ליומן" שמוסיף את האירוע ליומן הגוגל האישי של המנהל.
        סנכרון אוטומטי (יצירה, עדכון וביטול של אירועים) דורש חיבור חשבון גוגל ארגוני.
      </p>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3">
        <div>
          <p className="text-sm font-medium">סנכרון אוטומטי לכל בקשה מאושרת</p>
          <p className="text-xs text-muted-foreground">לא פעיל — דורש חיבור חשבון גוגל</p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => {
            setEnabled(v);
            localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
            toast({
              title: v ? "הבקשה נרשמה" : "הסנכרון האוטומטי כובה",
              description: v
                ? "עד לחיבור חשבון גוגל ארגוני ההוספה ליומן נעשית בכפתור שליד כל חופשה מאושרת."
                : undefined,
            });
          }}
        />
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link2 className="w-3.5 h-3.5" />
        לחיבור חשבון גוגל ארגוני יש לפנות למנהל המערכת.
      </div>
    </div>
  );
}
