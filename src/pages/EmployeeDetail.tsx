import { useParams, Link } from "react-router-dom";
import {
  ArrowRight, Shield, Key, Clock, AlertTriangle, UserMinus,
  FileText, RefreshCw, Package, User, Mail, Phone, Calendar, Building2, IdCard,
  Pencil, Plus, Trash2, Upload, Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useEmployee, useEmployeeAssets, useEmployeeDigitalAccess, useActivityLog, useAssets } from "@/hooks/useData";
import { useDeleteDigitalAccess, useUnassignAsset } from "@/hooks/useMutations";
import { useToast } from "@/hooks/use-toast";
import { OffboardingDialog } from "@/components/OffboardingDialog";
import { TransferAssetDialog } from "@/components/TransferAssetDialog";
import { HandoverFormsList } from "@/components/HandoverFormsList";
import { EditEmployeeDialog } from "@/components/EditEmployeeDialog";
import { AddDigitalAccessDialog } from "@/components/AddDigitalAccessDialog";
import { UploadSignedFormDialog } from "@/components/UploadSignedFormDialog";
import { AssignAssetWithFormDialog } from "@/components/AssignAssetWithFormDialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const tabs = [
  { id: "personal", label: "פרטים אישיים", icon: User },
  { id: "assets", label: "ציוד משויך", icon: Package },
  { id: "digital", label: "גישות דיגיטליות", icon: Key },
  { id: "forms", label: "טפסים חתומים", icon: FileText },
  { id: "history", label: "היסטוריית פעילות", icon: Clock },
];

const statusLabels: Record<string, string> = {
  active: "פעיל", onboarding: "בקליטה", leaving: "בעזיבה", inactive: "לא פעיל",
};
const statusClasses: Record<string, string> = {
  active: "status-active", onboarding: "status-onboarding", leaving: "status-leaving", inactive: "status-inactive",
};
const assetStatusLabels: Record<string, string> = {
  in_use: "בשימוש", in_stock: "במלאי", in_repair: "בתיקון", lost: "אבד",
};
const accessStatusLabels: Record<string, string> = {
  active: "פעיל", suspended: "מושהה", blocked: "נחסם",
};
const permissionLabels: Record<string, string> = {
  read: "קריאה", write: "עריכה", admin: "מנהל",
};

function InfoRow({ icon: Icon, label, value, mono }: { icon: any; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className={cn("text-sm font-medium mt-0.5 break-words", mono && "font-mono")}>{value || "—"}</dd>
      </div>
    </div>
  );
}

export default function EmployeeDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("personal");
  const [offboardingOpen, setOffboardingOpen] = useState(false);
  const [transferAsset, setTransferAsset] = useState<any>(null);
  const [editEmployeeOpen, setEditEmployeeOpen] = useState(false);
  const [addAccessOpen, setAddAccessOpen] = useState(false);
  const [editAccess, setEditAccess] = useState<any>(null);
  const [uploadFormOpen, setUploadFormOpen] = useState(false);
  const [assignAssetOpen, setAssignAssetOpen] = useState(false);
  const [pickAssetId, setPickAssetId] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data: employee, isLoading } = useEmployee(id!);
  const { data: assets } = useEmployeeAssets(id!);
  const { data: allAssets } = useAssets();
  const { data: digitalAccess } = useEmployeeDigitalAccess(id!);
  const { data: activityLog } = useActivityLog(id);
  const deleteAccess = useDeleteDigitalAccess();
  const unassignAsset = useUnassignAsset();

  const stockAssets = (allAssets ?? []).filter((a: any) => !a.current_owner_id);
  const pickedAsset = stockAssets.find((a: any) => a.id === pickAssetId) ?? null;

  if (isLoading) {
    return <div className="flex items-center justify-center p-12 text-muted-foreground">טוען...</div>;
  }

  if (!employee) {
    return <div className="text-center p-12 text-muted-foreground">עובד לא נמצא</div>;
  }

  const initials = employee.full_name.split(" ").map(w => w[0]).join("").slice(0, 2);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/employees" className="hover:text-foreground transition-colors">עובדים</Link>
        <ArrowRight className="w-3 h-3 rotate-180" />
        <span className="text-foreground font-medium">{employee.full_name}</span>
      </div>

      {/* Header */}
      <div className="bg-card rounded-xl border border-border/50 shadow-card p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="text-2xl font-bold text-primary">{initials}</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">{employee.full_name}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{employee.role} • {employee.department}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className={`status-badge ${statusClasses[employee.status] ?? ""}`}>
                  {statusLabels[employee.status] ?? employee.status}
                </span>
                <span className="text-xs text-muted-foreground">ת.ז: {employee.id_number}</span>
                <span className="text-xs text-muted-foreground">{employee.employee_code}</span>
                {employee.birth_date && (
                  <span className="text-xs text-muted-foreground">
                    תאריך לידה: {new Date(employee.birth_date).toLocaleDateString("he-IL")}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  תחילת עבודה: {new Date(employee.start_date).toLocaleDateString("he-IL")}
                </span>
              </div>
            </div>
          </div>
          {employee.status !== "leaving" && employee.status !== "inactive" && (
            <Button variant="destructive" className="gap-2" onClick={() => setOffboardingOpen(true)}>
              <UserMinus className="w-4 h-4" />
              התנעת עזיבה
            </Button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-border/50">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{assets?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">פריטי ציוד</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-info">{digitalAccess?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">הרשאות דיגיטליות</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{activityLog?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">פעולות בהיסטוריה</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Assets tab */}
      {activeTab === "assets" && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={() => setPickerOpen(true)}>
              <Plus className="w-4 h-4" />
              שייך ציוד חדש
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(assets ?? []).map((asset) => (
              <div key={asset.id} className="bg-card rounded-xl border border-border/50 shadow-card p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{asset.asset_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(asset as any).asset_categories?.category_name} • {asset.asset_code}
                    </p>
                    {asset.serial_number && <p className="text-xs text-muted-foreground">SN: {asset.serial_number}</p>}
                  </div>
                  <span className="status-badge status-active">{assetStatusLabels[asset.status] ?? asset.status}</span>
                </div>
                {asset.expiry_date && (
                  <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-2 text-xs text-muted-foreground">
                    <AlertTriangle className="w-3 h-3 text-warning" />
                    <span>תפוגה: {new Date(asset.expiry_date).toLocaleDateString("he-IL")}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setTransferAsset(asset)}>
                    <RefreshCw className="w-3 h-3" />
                    העבר בעלות
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={async () => {
                      if (!confirm(`לבטל את שיוך הפריט "${asset.asset_name}"?`)) return;
                      try {
                        await unassignAsset.mutateAsync(asset.id);
                        toast({ title: "השיוך בוטל" });
                      } catch (err: any) {
                        toast({ title: "שגיאה", description: err.message, variant: "destructive" });
                      }
                    }}
                  >
                    <Unlink className="w-3 h-3" />
                    בטל שיוך
                  </Button>
                </div>
              </div>
            ))}
            {(!assets || assets.length === 0) && (
              <div className="col-span-2 text-center py-8 text-muted-foreground">אין ציוד רשום</div>
            )}
          </div>

        </div>
      )}

      {/* Personal info tab */}
      {activeTab === "personal" && (
        <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              פרטים אישיים
            </h2>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditEmployeeOpen(true)}>
              <Pencil className="w-4 h-4" />
              ערוך
            </Button>
          </div>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <InfoRow icon={User} label="שם מלא" value={employee.full_name} />
            <InfoRow icon={IdCard} label="מספר עובד" value={employee.employee_code} mono />
            <InfoRow icon={IdCard} label="תעודת זהות" value={employee.id_number} mono />
            <InfoRow icon={Building2} label="מחלקה" value={employee.department} />
            <InfoRow icon={Shield} label="תפקיד" value={employee.role} />
            <InfoRow icon={Mail} label="אימייל" value={(employee as any).email ?? "—"} />
            <InfoRow icon={Phone} label="טלפון" value={(employee as any).phone ?? "—"} />
            <InfoRow
              icon={Calendar}
              label="תאריך התחלה"
              value={new Date(employee.start_date).toLocaleDateString("he-IL")}
            />
            {employee.birth_date && (
              <InfoRow
                icon={Calendar}
                label="תאריך לידה"
                value={new Date(employee.birth_date).toLocaleDateString("he-IL")}
              />
            )}
            {employee.end_date && (
              <InfoRow
                icon={Calendar}
                label="תאריך סיום"
                value={new Date(employee.end_date).toLocaleDateString("he-IL")}
              />
            )}
          </dl>
        </div>
      )}

      {/* Forms tab */}
      {activeTab === "forms" && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={() => setUploadFormOpen(true)}>
              <Upload className="w-4 h-4" />
              העלה טופס חתום
            </Button>
          </div>
          <HandoverFormsList employeeId={id!} />
        </div>
      )}

      {/* Digital access tab */}
      {activeTab === "digital" && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={() => { setEditAccess(null); setAddAccessOpen(true); }}>
              <Plus className="w-4 h-4" />
              הוסף גישה
            </Button>
          </div>
          <div className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>סוג גישה</th>
                  <th>משאב</th>
                  <th>רמת הרשאה</th>
                  <th>סטטוס</th>
                  <th className="w-32">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {(digitalAccess ?? []).map((access) => (
                  <tr key={access.id}>
                    <td>{access.access_type}</td>
                    <td className="font-mono text-xs">{access.resource_path}</td>
                    <td>{permissionLabels[access.permission_level] ?? access.permission_level}</td>
                    <td><span className="status-badge status-active">{accessStatusLabels[access.status] ?? access.status}</span></td>
                    <td>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => { setEditAccess(access); setAddAccessOpen(true); }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive"
                          onClick={async () => {
                            if (!confirm("למחוק את הגישה?")) return;
                            try {
                              await deleteAccess.mutateAsync({ id: access.id, employee_id: id! });
                              toast({ title: "הגישה נמחקה" });
                            } catch (err: any) {
                              toast({ title: "שגיאה", description: err.message, variant: "destructive" });
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!digitalAccess || digitalAccess.length === 0) && (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">אין הרשאות</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* History tab */}
      {activeTab === "history" && (
        <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 animate-fade-in">
          {(activityLog ?? []).length > 0 ? (
            <div className="relative">
              <div className="absolute top-0 bottom-0 right-[17px] w-0.5 bg-border" />
              <div className="space-y-6">
                {(activityLog ?? []).map((item) => (
                  <div key={item.id} className="flex items-start gap-5 relative">
                    <div className="timeline-dot mt-1 z-10 shrink-0" />
                    <div className="flex-1 pb-2">
                      <p className="text-sm">{item.action}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.created_at).toLocaleDateString("he-IL")}
                        </span>
                        {item.details && <span className="text-xs text-muted-foreground">{item.details}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">אין היסטוריה עדיין</div>
          )}
        </div>
      )}

      {/* Offboarding dialog */}
      <OffboardingDialog
        open={offboardingOpen}
        onOpenChange={setOffboardingOpen}
        employee={employee}
        assets={(assets ?? []).map(a => ({
          id: a.id,
          asset_name: a.asset_name,
          asset_code: a.asset_code,
          serial_number: a.serial_number,
          asset_categories: (a as any).asset_categories,
        }))}
        digitalAccess={(digitalAccess ?? []).map(da => ({
          id: da.id,
          access_type: da.access_type,
          resource_path: da.resource_path,
          permission_level: da.permission_level,
        }))}
      />

      {/* Transfer dialog */}
      {transferAsset && (
        <TransferAssetDialog
          open={!!transferAsset}
          onOpenChange={(open) => { if (!open) setTransferAsset(null); }}
          asset={transferAsset}
          currentOwnerName={employee.full_name}
        />
      )}

      {/* Edit employee */}
      <EditEmployeeDialog
        open={editEmployeeOpen}
        onOpenChange={setEditEmployeeOpen}
        employee={employee}
      />

      {/* Add/edit digital access */}
      <AddDigitalAccessDialog
        open={addAccessOpen}
        onOpenChange={(o) => { setAddAccessOpen(o); if (!o) setEditAccess(null); }}
        employeeId={id!}
        existing={editAccess}
      />

      {/* Upload signed form */}
      <UploadSignedFormDialog
        open={uploadFormOpen}
        onOpenChange={setUploadFormOpen}
        employeeId={id!}
      />

      {/* Pick available asset to assign */}
      <Dialog open={pickerOpen} onOpenChange={(o) => { setPickerOpen(o); if (!o) setPickAssetId(""); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>בחר פריט ציוד לשיוך</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <SearchableSelect
              value={pickAssetId}
              onChange={setPickAssetId}
              options={stockAssets.map((a: any) => ({
                value: a.id,
                label: `${a.asset_name} (${a.asset_code})`,
              }))}
              placeholder="בחר פריט מהמלאי..."
            />
            {stockAssets.length === 0 && (
              <p className="text-xs text-muted-foreground">אין פריטים פנויים במלאי</p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPickerOpen(false)}>ביטול</Button>
              <Button
                className="flex-1"
                disabled={!pickAssetId}
                onClick={() => { setPickerOpen(false); setAssignAssetOpen(true); }}
              >
                המשך
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign with form (preassigned to this employee) */}
      {pickedAsset && (
        <AssignAssetWithFormDialog
          open={assignAssetOpen}
          onOpenChange={(o) => { setAssignAssetOpen(o); if (!o) setPickAssetId(""); }}
          asset={{ ...pickedAsset, current_owner_id: id! } as any}
        />
      )}
    </div>
  );
}
