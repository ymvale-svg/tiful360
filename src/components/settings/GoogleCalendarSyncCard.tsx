import { CalendarPlus, Link2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

/**
 * Google Calendar sync settings.
 * Auto-sync requires connecting an organisational Google account, which is not
 * available yet — so the switch is shown disabled and nothing is saved. Until
 * then approved leave requests expose a manual "add to calendar" button.
 */
export function GoogleCalendarSyncCard() {
  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 space-y-4 max-w-xl">
      <div className="flex items-center gap-3">
        <CalendarPlus className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">סנכרון יומן גוגל</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        עם אישור חופשה / מחלה / מילואים נשלח אוטומטית זימון ליומן (קובץ ICS + קישור ליומן Google)
        לכתובות המזכירות שמוגדרות בהגדרות הנמענים. כמו כן כל בקשה מאושרת מציגה כפתור "הוסף ליומן".
        סנכרון ישיר ליומן ארגוני (יצירה, עדכון וביטול אוטומטיים) דורש חיבור חשבון גוגל ארגוני.
      </p>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3">
        <div>
          <p id="calendar-auto-sync-label" className="text-sm font-medium">סנכרון אוטומטי לכל בקשה מאושרת</p>
          <p id="calendar-auto-sync-hint" className="text-xs text-muted-foreground">
            לא זמין עדיין — האפשרות תיפתח אחרי חיבור חשבון גוגל ארגוני. בינתיים מוסיפים ליומן בכפתור שליד כל חופשה מאושרת.
          </p>
        </div>
        <Switch
          checked={false}
          disabled
          aria-labelledby="calendar-auto-sync-label"
          aria-describedby="calendar-auto-sync-hint"
        />
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link2 className="w-3.5 h-3.5" />
        לחיבור חשבון גוגל ארגוני יש לפנות למנהל המערכת.
      </div>
    </div>
  );
}
