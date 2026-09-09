import { useState } from "react";
import { Eye, EyeOff, RotateCcw, Expand, Shrink, GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WIDGET_LABELS, type WidgetKey } from "@/lib/dashboardConfig";
import type { DashboardPrefs } from "@/hooks/useDashboardPrefs";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Widgets available to the user's role(s), already in the current display order. */
  widgets: WidgetKey[];
  prefs: DashboardPrefs;
  onToggleHidden: (key: WidgetKey) => void;
  onToggleWide: (key: WidgetKey) => void;
  onSetOrder: (order: WidgetKey[]) => void;
  onReset: () => void;
}

export function CustomizeDashboardDialog({
  open, onOpenChange, widgets, prefs, onToggleHidden, onToggleWide, onSetOrder, onReset,
}: Props) {
  const [dragKey, setDragKey] = useState<WidgetKey | null>(null);

  const move = (key: WidgetKey, target: number) => {
    const next = widgets.filter((w) => w !== key);
    const clamped = Math.max(0, Math.min(next.length, target));
    next.splice(clamped, 0, key);
    onSetOrder(next);
  };

  const shift = (key: WidgetKey, delta: number) => {
    move(key, widgets.indexOf(key) + delta);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>התאמה אישית של לוח הבקרה</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          גררו חלונות כדי לשנות את הסדר (או השתמשו בחיצים), הסתירו חלונות שאינם רלוונטיים, והגדילו חלון לרוחב מלא.
          ההגדרות נשמרות עבור המשתמש שלכם בלבד.
        </p>
        <div className="divide-y divide-border/50 border border-border/50 rounded-lg overflow-hidden max-h-[55vh] overflow-y-auto">
          {widgets.map((key, index) => {
            const hidden = prefs.hidden.includes(key);
            const wide = prefs.wide.includes(key);
            return (
              <div
                key={key}
                draggable
                onDragStart={() => setDragKey(key)}
                onDragEnd={() => setDragKey(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragKey && dragKey !== key) move(dragKey, index);
                  setDragKey(null);
                }}
                className={cn(
                  "flex items-center justify-between gap-2 p-3 bg-background",
                  hidden && "opacity-50 bg-muted/30",
                  dragKey === key && "ring-1 ring-primary/50",
                )}
              >
                <div className="flex items-center gap-1 min-w-0">
                  <GripVertical className="w-4 h-4 text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing" />
                  <div className="flex flex-col">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={index === 0}
                      onClick={() => shift(key, -1)}
                      aria-label="הזז למעלה"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={index === widgets.length - 1}
                      onClick={() => shift(key, 1)}
                      aria-label="הזז למטה"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="text-sm font-medium truncate">{WIDGET_LABELS[key]}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
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
