import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";
import { UserPlus } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLE_OPTIONS = [
  { value: "admin", label: "מנהל מערכת" },
  { value: "it_manager", label: "מנהל IT" },
  { value: "payroll", label: "חשב/ת שכר" },
  { value: "operations", label: "עובד תפעול" },
  { value: "direct_manager", label: "מנהל ישיר" },
];

export function InviteExternalUserDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { companies, activeCompanyId } = useCompany();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("");
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setFullName("");
      setEmail("");
      setRole("");
      setSelectedCompanies(activeCompanyId ? [activeCompanyId] : []);
    }
  }, [open, activeCompanyId]);

  const toggleCompany = (id: string) => {
    setSelectedCompanies((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users?action=invite-external`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            email,
            full_name: fullName,
            role,
            company_ids: selectedCompanies,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      return json;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      toast({
        title: data.status === "already_exists" ? "המשתמש קיים — נוספה גישה" : "הזמנה נשלחה בהצלחה",
      });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "שגיאה בהזמנת משתמש", description: err.message, variant: "destructive" });
    },
  });

  const canSubmit =
    !!email.trim() &&
    !!fullName.trim() &&
    !!role &&
    selectedCompanies.length > 0 &&
    !inviteMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            הזמן משתמש חיצוני
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="ext-name">שם מלא</Label>
            <Input
              id="ext-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="ישראל ישראלי"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ext-email">אימייל</Label>
            <Input
              id="ext-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label>תפקיד במערכת</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue placeholder="בחר תפקיד" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>גישה לחברות</Label>
            <div className="border border-border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
              {companies.length === 0 ? (
                <p className="text-sm text-muted-foreground">אין חברות זמינות</p>
              ) : (
                companies.map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`co-${c.id}`}
                      checked={selectedCompanies.includes(c.id)}
                      onCheckedChange={() => toggleCompany(c.id)}
                    />
                    <Label htmlFor={`co-${c.id}`} className="cursor-pointer font-normal">
                      {c.name}
                    </Label>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button onClick={() => inviteMutation.mutate()} disabled={!canSubmit}>
            {inviteMutation.isPending ? "שולח..." : "שלח הזמנה"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
