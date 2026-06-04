import { useEffect, useState } from "react";
import { Cake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { HEBREW_MONTHS, formatHebrewBirthGematriya } from "@/lib/hebrewBirthday";

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
  const [day, setDay] = useState<string>("");
  const [month, setMonth] = useState<string>("");
  const [year, setYear] = useState<string>("");

  useEffect(() => {
    if (!employee) return;
    setPref(employee.birthday_calendar_preference || "gregorian");
    setDay(employee.hebrew_birth_day ? String(employee.hebrew_birth_day) : "");
    setMonth(employee.hebrew_birth_month ? String(employee.hebrew_birth_month) : "");
    setYear(employee.hebrew_birth_year ? String(employee.hebrew_birth_year) : "");
  }, [employee]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = { _preference: pref };
      if (pref === "hebrew") {
        const d = parseInt(day, 10);
        const m = parseInt(month, 10);
        const y = parseInt(year, 10);
        if (!d || !m || !y) throw new Error("נא למלא יום, חודש ושנה עבריים");
        if (d < 1 || d > 30) throw new Error("יום עברי לא תקין");
        if (m < 1 || m > 13) throw new Error("חודש עברי לא תקין");
        if (y < 5000 || y > 6000) throw new Error("שנה עברית לא תקינה");
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

  const preview = pref === "hebrew" && day && month && year
    ? formatHebrewBirthGematriya(parseInt(day, 10), parseInt(month, 10), parseInt(year, 10))
    : "";

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
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">יום</Label>
              <Input type="number" min={1} max={30} value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">חודש</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue placeholder="חודש" /></SelectTrigger>
                <SelectContent>
                  {HEBREW_MONTHS.map((m) => (
                    <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">שנה</Label>
              <Input type="number" min={5000} max={6000} value={year} onChange={(e) => setYear(e.target.value)} placeholder="לדוג׳ 5745" />
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
