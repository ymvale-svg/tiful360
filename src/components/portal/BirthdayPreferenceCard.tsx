import { useEffect, useMemo, useState } from "react";
import { Cake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getHebrewMonthsForYear,
  formatHebrewBirthGematriya,
  formatHebrewYearGematriya,
  parseHebrewYearGematriya,
  parseHebrewDayGematriya,
  formatHebrewDayGematriya,
} from "@/lib/hebrewBirthday";

interface Props {
  employee: {
    id: string;
    birthday_calendar_preference?: "gregorian" | "hebrew" | null;
    hebrew_birth_day?: number | null;
    hebrew_birth_month?: number | null;
    hebrew_birth_year?: number | null;
  } | null | undefined;
}

export function BirthdayPreferenceCard({ employee }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [pref, setPref] = useState<"gregorian" | "hebrew">("gregorian");
  const [dayText, setDayText] = useState<string>("");
  const [month, setMonth] = useState<string>("");
  // Year is stored numerically but entered in Hebrew letters
  const [yearText, setYearText] = useState<string>("");

  useEffect(() => {
    if (!employee) return;
    setPref(employee.birthday_calendar_preference || "gregorian");
    setDayText(employee.hebrew_birth_day ? formatHebrewDayGematriya(employee.hebrew_birth_day) : "");
    setMonth(employee.hebrew_birth_month ? String(employee.hebrew_birth_month) : "");
    setYearText(employee.hebrew_birth_year ? formatHebrewYearGematriya(employee.hebrew_birth_year) : "");
  }, [employee]);

  const dayNum = useMemo(() => parseHebrewDayGematriya(dayText), [dayText]);
  const yearNum = useMemo(() => parseHebrewYearGematriya(yearText), [yearText]);
  const monthOptions = useMemo(() => getHebrewMonthsForYear(yearNum ?? undefined), [yearNum]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = { _preference: pref };
      if (pref === "hebrew") {
        const d = dayNum;
        const m = parseInt(month, 10);
        const y = yearNum;
        if (!d || !m || !y) throw new Error("נא למלא יום, חודש ושנה עבריים");
        payload._hebrew_day = d;
        payload._hebrew_month = m;
        payload._hebrew_year = y;
      }
      const { error } = await supabase.rpc("update_my_birthday_preference", payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my_employee"] });
      qc.invalidateQueries({ queryKey: ["birthdays"] });
      toast({ title: "ההעדפה נשמרה" });
    },
    onError: (e: any) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  if (!employee) return null;

  const preview = pref === "hebrew" && dayNum && month && yearNum
    ? formatHebrewBirthGematriya(dayNum, parseInt(month, 10), yearNum)
    : "";

  const yearInvalid = pref === "hebrew" && yearText.length > 0 && !yearNum;
  const dayInvalid = pref === "hebrew" && dayText.length > 0 && !dayNum;

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Cake className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">הגדרות יום הולדת</h3>
      </div>

      <RadioGroup value={pref} onValueChange={(v) => setPref(v as any)} className="flex gap-4">
        <div className="flex items-center gap-2">
          <RadioGroupItem value="gregorian" id="cal-greg" />
          <Label htmlFor="cal-greg" className="text-sm cursor-pointer">לועזי (ברירת מחדל)</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="hebrew" id="cal-heb" />
          <Label htmlFor="cal-heb" className="text-sm cursor-pointer">עברי</Label>
        </div>
      </RadioGroup>

      {pref === "hebrew" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-2.5 leading-relaxed">
            התאריך העברי נשמר כפי שמוזן ולא מומר מהתאריך הלועזי שלך.
          </p>
          <div className="grid grid-cols-3 gap-2 text-right">
            <div>
              <Label className="text-xs block text-right">יום</Label>
              <Input
                type="text"
                inputMode="text"
                value={dayText}
                onChange={(e) => setDayText(e.target.value)}
                placeholder='לדוג׳ כ"ב'
                aria-invalid={dayInvalid}
                className="text-right"
              />
              {dayInvalid && (
                <p className="text-[11px] text-destructive mt-1 text-right">יום לא תקין</p>
              )}
            </div>
            <div>
              <Label className="text-xs block text-right">חודש</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="text-right"><SelectValue placeholder="חודש" /></SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs block text-right">שנה (עברית)</Label>
              <Input
                type="text"
                inputMode="text"
                value={yearText}
                onChange={(e) => setYearText(e.target.value)}
                placeholder='לדוג׳ תשמ"ה'
                aria-invalid={yearInvalid}
                className="text-right"
              />
              {yearInvalid && (
                <p className="text-[11px] text-destructive mt-1 text-right">שנה לא תקינה</p>
              )}
            </div>
          </div>
          {preview && (
            <div className="text-sm text-foreground">תצוגה מקדימה: <span className="font-semibold">{preview}</span></div>
          )}
        </div>
      )}

      <div className="pt-1">
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "שומר..." : "שמור"}
        </Button>
      </div>
    </div>
  );
}
