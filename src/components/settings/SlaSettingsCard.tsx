import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Timer, Loader2 } from "lucide-react";
import { TICKET_PRIORITIES, TICKET_SUBJECTS, defaultSlaHours } from "@/lib/serviceTickets";
import { useSaveSlaSetting, useSlaSettings } from "@/hooks/useServiceTickets";

type Draft = Record<string, { hours: number; notify: boolean }>;

const key = (subject: string, priority: string) => `${subject}|${priority}`;

export function SlaSettingsCard() {
  const { data: settings, isLoading } = useSlaSettings();
  const saveSetting = useSaveSlaSetting();
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next: Draft = {};
    for (const s of TICKET_SUBJECTS) {
      for (const p of TICKET_PRIORITIES) {
        const row = settings?.find((x) => x.subject_category === s.value && x.priority === p.value);
        next[key(s.value, p.value)] = {
          hours: row?.target_hours ?? defaultSlaHours(s.value, p.value),
          notify: row?.notify_on_breach ?? false,
        };
      }
    }
    setDraft(next);
  }, [settings]);

  const update = (k: string, patch: Partial<{ hours: number; notify: boolean }>) =>
    setDraft((prev) => ({ ...prev, [k]: { ...prev[k], ...patch } }));

  const save = async () => {
    setSaving(true);
    try {
      for (const s of TICKET_SUBJECTS) {
        for (const p of TICKET_PRIORITIES) {
          const d = draft[key(s.value, p.value)];
          if (!d) continue;
          await saveSetting.mutateAsync({
            subject_category: s.value,
            priority: p.value,
            target_hours: Math.max(1, Number(d.hours) || 1),
            notify_on_breach: d.notify,
          });
        }
      }
      toast.success("זמני התקן נשמרו");
    } catch (err: any) {
      toast.error(err?.message ?? "שגיאה בשמירת זמני התקן");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-primary" aria-hidden="true" />
          זמני תקן לקריאות שירות (SLA)
        </CardTitle>
        <CardDescription>
          זמן היעד לטיפול בשעות לכל נושא ורמת דחיפות. בפתיחת קריאה מחושב תאריך יעד לפי ההגדרה.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">טוען...</p>
        ) : (
          <>
            {TICKET_SUBJECTS.map((s) => (
              <div key={s.value} className="rounded-lg border border-border/60 p-3 space-y-3">
                <p className="font-medium text-sm">{s.label}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {TICKET_PRIORITIES.map((p) => {
                    const k = key(s.value, p.value);
                    const d = draft[k] ?? { hours: 24, notify: false };
                    return (
                      <div key={p.value} className="space-y-2">
                        <Label htmlFor={`sla-${k}`} className="text-xs text-muted-foreground">
                          {p.label} — שעות יעד
                        </Label>
                        <Input
                          id={`sla-${k}`}
                          type="number"
                          min={1}
                          value={d.hours}
                          onChange={(e) => update(k, { hours: Number(e.target.value) })}
                        />
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`sla-notify-${k}`}
                            checked={d.notify}
                            onCheckedChange={(v) => update(k, { notify: v })}
                          />
                          <Label htmlFor={`sla-notify-${k}`} className="text-xs">
                            התראת מייל לתפעול בחריגה
                          </Label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              שמור זמני תקן
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
