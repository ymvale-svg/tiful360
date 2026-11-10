import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Timer } from "lucide-react";
import { StateView } from "@/components/feedback/StateView";
import { TICKET_PRIORITIES, TICKET_SUBJECTS as BASE_SUBJECTS, defaultSlaHours, ONBOARDING_SUBJECT, OFFBOARDING_SUBJECT } from "@/lib/serviceTickets";

const TICKET_SUBJECTS = [
  ...BASE_SUBJECTS,
  { value: ONBOARDING_SUBJECT, label: "קליטת עובד" },
  { value: OFFBOARDING_SUBJECT, label: "ניתוקים / סיום העסקה" },
];
import { useSaveSlaSettings, useSlaSettings } from "@/hooks/useServiceTickets";

type Draft = Record<string, { hours: number; notify: boolean }>;

const key = (subject: string, priority: string) => `${subject}|${priority}`;

export function SlaSettingsCard() {
  const { data: settings, isLoading, error, refetch } = useSlaSettings();
  const saveSettings = useSaveSlaSettings();
  const [draft, setDraft] = useState<Draft>({});

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

  // All rows go in a single upsert: either every target is saved or none is, never a partial set.
  const save = async () => {
    const rows = TICKET_SUBJECTS.flatMap((s) => TICKET_PRIORITIES.flatMap((p) => {
      const d = draft[key(s.value, p.value)];
      return d ? [{
        subject_category: s.value,
        priority: p.value,
        target_hours: Math.max(1, Number(d.hours) || 1),
        notify_on_breach: d.notify,
      }] : [];
    }));
    try {
      await saveSettings.mutateAsync(rows);
      toast.success(`זמני התקן נשמרו (${rows.length} הגדרות)`);
    } catch (err: any) {
      toast.error("זמני התקן לא נשמרו", { description: `${err?.message ?? "שגיאה לא ידועה"} — אף הגדרה לא שונתה, נסו שוב.` });
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
          זמן היעד לטיפול בשעות עבודה (א׳-ה׳ 08:00-17:00, ללא חגי החברה) לכל נושא ורמת דחיפות. בפתיחת קריאה מחושב תאריך יעד לפי ההגדרה.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <StateView loading={isLoading} error={error} onRetry={() => { void refetch(); }} label="את זמני התקן">
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
            <Button onClick={save} loading={saveSettings.isPending} loadingText="שומר…" className="gap-2">
              שמור זמני תקן
            </Button>
          </>
        </StateView>
      </CardContent>
    </Card>
  );
}
