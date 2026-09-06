import { Eye, EyeOff, RotateCcw, Expand, Shrink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WIDGET_LABELS, type WidgetKey } from "@/lib/dashboardConfig";
import type { DashboardPrefs } from "@/hooks/useDashboardPrefs";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Widgets available to the user's role(s), in display order. */
  widgets: WidgetKey[];
  prefs: DashboardPrefs;
  onToggleHidden: (key: WidgetKey) => void;
  onToggleWide: (key: WidgetKey) => void;
  onReset: () => void;
}

export function CustomizeDashboardDialog({
  open, onOpenChange, widgets, prefs, onToggleHidden, onToggleWide, onReset,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>התאמה אישית של לוח הבקרה</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          הסתירו חלונות שאינם רלוונטיים, או הגדילו חלון לרוחב מלא. ההגדרות נשמרות עבור המשתמש שלכם בלבד.
        </p>
        <div className="divide-y divide-border/50 border border-border/50 rounded-lg overflow-hidden">
          {widgets.map((key) => {
            const hidden = prefs.hidden.includes(key);
            const wide = prefs.wide.includes(key);
            return (
              <div
                key={key}
                className={cn(
                  "flex items-center justify-between gap-2 p-3",
                  hidden && "opacity-50 bg-muted/30",
                )}
              >
                <span className="text-sm font-medium">{WIDGET_LABELS[key]}</span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs gap-1"
                    disabled={hidden}
                    onClick={() => onToggleWide(key)}
                    title={wide ? "רוחב רגיל" : "רוחב מלא"}
                  >
                    {wide ? <Shrink className="w-3.5 h-3.5" /> : <Expand className="w-3.5 h-3.5" />}
                    {wide ? "רגיל" : "רחב"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs gap-1"
                    onClick={() => onToggleHidden(key)}
                    title={hidden ? "הצג" : "הסתר"}
                  >
                    {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {hidden ? "מוסתר" : "מוצג"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between items-center pt-1">
          <Button variant="outline" size="sm" onClick={onReset} className="gap-1">
            <RotateCcw className="w-3.5 h-3.5" />
            איפוס לברירת מחדל
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>סיום</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
