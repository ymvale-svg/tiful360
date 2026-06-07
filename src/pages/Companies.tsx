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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Building2, Plus, Users, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { ExportExcelButton } from "@/components/ExcelActionButtons";
import { exportToExcel } from "@/lib/exportExcel";

export default function Companies() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [portalName, setPortalName] = useState("");
  const [portalLogoUrl, setPortalLogoUrl] = useState("");
  const [portalPrimaryColor, setPortalPrimaryColor] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, logo_url, created_at, portal_name, portal_logo_url, portal_primary_color")
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
      const payload = {
        name,
        portal_name: portalName.trim() || null,
        portal_logo_url: portalLogoUrl.trim() || null,
        portal_primary_color: portalPrimaryColor.trim() || null,
      };
      if (editId) {
        const { error } = await supabase.from("companies").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from("companies").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast({ title: editId ? "חברה עודכנה" : "חברה נוצרה בהצלחה" });
      setOpen(false);
      setName("");
      setPortalName("");
      setPortalLogoUrl("");
      setPortalPrimaryColor("");
      setEditId(null);
    },
    onError: (err: any) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (companyId: string) => {
      const { error } = await supabase.rpc("delete_company_cascade", { _company_id: companyId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["company-access-counts"] });
      toast({ title: "חברה נמחקה בהצלחה" });
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      toast({ title: "שגיאה במחיקה", description: err.message, variant: "destructive" });
    },
  });

  const handleLogoFile = async (file: File) => {
    if (!file) return;
    try {
      setLogoUploading(true);
      const ext = file.name.split(".").pop() || "png";
      const path = `portal/${editId || "new"}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("company-logos").upload(path, file, {
        upsert: true, contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("company-logos").getPublicUrl(path);
      setPortalLogoUrl(pub.publicUrl);
      toast({ title: "הלוגו הועלה" });
    } catch (e: any) {
      toast({ title: "שגיאה בהעלאת לוגו", description: e.message, variant: "destructive" });
    } finally {
      setLogoUploading(false);
    }
  };

  const handleEdit = (company: any) => {
    setEditId(company.id);
    setName(company.name);
    setPortalName(company.portal_name || "");
    setPortalLogoUrl(company.portal_logo_url || "");
    setPortalPrimaryColor(company.portal_primary_color || "");
    setOpen(true);
  };

  const handleNew = () => {
    setEditId(null);
    setName("");
    setPortalName("");
    setPortalLogoUrl("");
    setPortalPrimaryColor("");
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ניהול חברות</h1>
          <p className="text-muted-foreground">יצירה וניהול של חברות במערכת</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportExcelButton
            disabled={!companies.length}
            onClick={() => {
              if (!companies.length) return;
              exportToExcel(
                companies.map((c: any) => ({
                  name: c.name,
                  users: countForCompany(c.id),
                  created_at: format(new Date(c.created_at), "dd-MM-yyyy"),
                })),
                [
                  { key: "name", label: "שם חברה" },
                  { key: "users", label: "משתמשים" },
                  { key: "created_at", label: "נוצרה בתאריך" },
                ],
                "חברות"
              );
            }}
          />
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
            <div className="space-y-4 pt-4 max-h-[70vh] overflow-y-auto">
              <div>
                <Label htmlFor="company-name">שם החברה</Label>
                <Input
                  id="company-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="הכנס שם חברה"
                />
              </div>

              <div className="border-t pt-4 space-y-3">
                <h3 className="text-sm font-semibold">מיתוג פורטל עובדים</h3>
                <div>
                  <Label htmlFor="portal-name">שם הפורטל</Label>
                  <Input
                    id="portal-name"
                    value={portalName}
                    onChange={(e) => setPortalName(e.target.value)}
                    placeholder='לדוגמה: "אשל שלי" (ברירת מחדל: פורטל עובדים)'
                  />
                </div>
                <div>
                  <Label htmlFor="portal-logo">לוגו הפורטל</Label>
                  <div className="flex items-center gap-3">
                    {portalLogoUrl && (
                      <img src={portalLogoUrl} alt="לוגו" className="w-12 h-12 rounded-lg object-contain bg-white border" />
                    )}
                    <Input
                      id="portal-logo"
                      type="file"
                      accept="image/*"
                      onChange={(e) => e.target.files?.[0] && handleLogoFile(e.target.files[0])}
                      disabled={logoUploading}
                    />
                    {portalLogoUrl && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setPortalLogoUrl("")}>
                        הסר
                      </Button>
                    )}
                  </div>
                  <Input
                    className="mt-2"
                    value={portalLogoUrl}
                    onChange={(e) => setPortalLogoUrl(e.target.value)}
                    placeholder="או הדבק כתובת URL ללוגו"
                  />
                </div>
                <div>
                  <Label htmlFor="portal-color">צבע ראשי (HEX)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="portal-color"
                      type="color"
                      value={portalPrimaryColor || "#3b82f6"}
                      onChange={(e) => setPortalPrimaryColor(e.target.value)}
                      className="w-16 h-10 p-1"
                    />
                    <Input
                      value={portalPrimaryColor}
                      onChange={(e) => setPortalPrimaryColor(e.target.value)}
                      placeholder="#3b82f6 (אופציונלי)"
                    />
                  </div>
                </div>
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
                <TableHead className="text-start">שם חברה</TableHead>
                <TableHead className="text-start">משתמשים</TableHead>
                <TableHead className="text-start">נוצרה בתאריך</TableHead>
                <TableHead className="text-start">פעולות</TableHead>
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
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(c)} className="gap-1 text-destructive hover:text-destructive">
                        <Trash2 className="w-3 h-3" />
                        מחק
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת חברה</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך למחוק את החברה "{deleteTarget?.name}"? פעולה זו תמחק את כל הנתונים הקשורים לחברה (עובדים, נכסים, קטגוריות ועוד) ולא ניתן לשחזר אותם.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "מוחק..." : "מחק חברה"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
