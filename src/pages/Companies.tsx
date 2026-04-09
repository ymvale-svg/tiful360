import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, Users, Pencil } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";

export default function Companies() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Count users per company
  const { data: accessCounts = [] } = useQuery({
    queryKey: ["company-access-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_company_access")
        .select("company_id");
      if (error) throw error;
      return data;
    },
  });

  const countForCompany = (companyId: string) =>
    accessCounts.filter((a) => a.company_id === companyId).length;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase.from("companies").update({ name }).eq("id", editId);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from("companies").insert({ name, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast({ title: editId ? "חברה עודכנה" : "חברה נוצרה בהצלחה" });
      setOpen(false);
      setName("");
      setEditId(null);
    },
    onError: (err: any) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

  const handleEdit = (company: any) => {
    setEditId(company.id);
    setName(company.name);
    setOpen(true);
  };

  const handleNew = () => {
    setEditId(null);
    setName("");
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ניהול חברות</h1>
          <p className="text-muted-foreground">יצירה וניהול של חברות במערכת</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleNew} className="gap-2">
              <Plus className="w-4 h-4" />
              חברה חדשה
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? "עריכת חברה" : "חברה חדשה"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>שם החברה</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="הכנס שם חברה"
                />
              </div>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!name.trim() || saveMutation.isPending}
                className="w-full"
              >
                {saveMutation.isPending ? "שומר..." : editId ? "עדכן" : "צור חברה"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">סה"כ חברות</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{companies.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">שם חברה</TableHead>
                <TableHead className="text-right">משתמשים</TableHead>
                <TableHead className="text-right">נוצרה בתאריך</TableHead>
                <TableHead className="text-right">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    טוען חברות...
                  </TableCell>
                </TableRow>
              ) : companies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    לא נמצאו חברות. צור חברה חדשה כדי להתחיל.
                  </TableCell>
                </TableRow>
              ) : (
                companies.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-primary" />
                        </div>
                        <span className="font-medium text-foreground">{c.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        <Users className="w-3 h-3" />
                        {countForCompany(c.id)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(c.created_at), "dd/MM/yyyy", { locale: he })}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(c)} className="gap-1">
                        <Pencil className="w-3 h-3" />
                        ערוך
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
