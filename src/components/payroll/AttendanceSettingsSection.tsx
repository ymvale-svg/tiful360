import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, CalendarDays, Settings } from "lucide-react";

export function AttendanceSettingsSection() {
  const { activeCompanyId } = useCompany();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");

  const { data: company } = useQuery({
    queryKey: ["company-settings", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return null;
      const { data, error } = await supabase
        .from("companies")
        .select("id, attendance_corrections_auto_approve" as any)
        .eq("id", activeCompanyId)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!activeCompanyId,
  });

  const { data: holidays = [] } = useQuery({
    queryKey: ["company_holidays", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from("company_holidays" as any)
        .select("*")
        .eq("company_id", activeCompanyId)
        .order("holiday_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!activeCompanyId,
  });

  const setAuto = useMutation({
    mutationFn: async (v: boolean) => {
      if (!activeCompanyId) return;
      const { error } = await supabase
        .from("companies")
        .update({ attendance_corrections_auto_approve: v } as any)
        .eq("id", activeCompanyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-settings"] });
      toast({ title: "ההגדרה נשמרה" });
    },
    onError: (e: any) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const addHoliday = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId || !newDate || !newName.trim()) throw new Error("נא למלא תאריך ושם");
      const { error } = await supabase.from("company_holidays" as any).insert({
        company_id: activeCompanyId, holiday_date: newDate, name: newName.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company_holidays"] });
      setNewDate(""); setNewName("");
      toast({ title: "החג נוסף" });
    },
    onError: (e: any) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const removeHoliday = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("company_holidays" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company_holidays"] }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4" /> הגדרות נוכחות
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 p-3 rounded-lg border">
            <div className="flex-1">
              <Label htmlFor="auto-approve" className="font-medium cursor-pointer">
                תיקוני נוכחות עוברים אוטומטית לשכר
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                כאשר עובד מגיש בקשת תיקון, השעות המבוקשות מוחלות מיידית על דוח הנוכחות ללא צורך באישור מנהל.
              </p>
            </div>
            <Switch
              id="auto-approve"
              checked={!!company?.attendance_corrections_auto_approve}
              onCheckedChange={(v) => setAuto.mutate(v)}
              disabled={setAuto.isPending}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="w-4 h-4" /> חגי חברה
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            ימים שמוגדרים כאן לא ייחשבו כפער החתמה בדוח, גם אם הם ימי עבודה רגילים של העובד.
          </p>
          <div className="flex flex-wrap items-end gap-2 mb-4">
            <div>
              <Label className="text-xs">תאריך</Label>
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-40" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">שם החג</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="לדוג׳ ל״ג בעומר" />
            </div>
            <Button size="sm" onClick={() => addHoliday.mutate()} disabled={addHoliday.isPending}>
              <Plus className="w-4 h-4 ml-1" />הוסף
            </Button>
          </div>

          {holidays.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">אין חגים מוגדרים.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="p-2 text-right">תאריך</th>
                    <th className="p-2 text-right">שם</th>
                    <th className="p-2 text-right w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {holidays.map((h) => (
                    <tr key={h.id} className="border-b">
                      <td className="p-2 font-mono">{new Date(h.holiday_date).toLocaleDateString("en-GB")}</td>
                      <td className="p-2">{h.name}</td>
                      <td className="p-2">
                        <Button size="icon" variant="ghost"
                          onClick={() => removeHoliday.mutate(h.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
