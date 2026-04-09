import { useParams, Link } from "react-router-dom";
import { 
  ArrowRight, Shield, Key, Clock, AlertTriangle, UserMinus, 
  FileText, RefreshCw, Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useEmployee, useEmployeeAssets, useEmployeeDigitalAccess, useActivityLog } from "@/hooks/useData";
import { OffboardingDialog } from "@/components/OffboardingDialog";

const tabs = [
  { id: "assets", label: "משאבים חומריים", icon: Package },
  { id: "digital", label: "הרשאות דיגיטליות", icon: Key },
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

export default function EmployeeDetail() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState("assets");
  const [offboardingOpen, setOffboardingOpen] = useState(false);
  const { data: employee, isLoading } = useEmployee(id!);
  const { data: assets } = useEmployeeAssets(id!);
  const { data: digitalAccess } = useEmployeeDigitalAccess(id!);
  const { data: activityLog } = useActivityLog(id);

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
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
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <RefreshCw className="w-3 h-3" />
                  העבר בעלות
                </Button>
              </div>
            </div>
          ))}
          {(!assets || assets.length === 0) && (
            <div className="col-span-2 text-center py-8 text-muted-foreground">אין ציוד רשום</div>
          )}
        </div>
      )}

      {/* Digital access tab */}
      {activeTab === "digital" && (
        <div className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden animate-fade-in">
          <table className="data-table">
            <thead>
              <tr>
                <th>סוג גישה</th>
                <th>משאב</th>
                <th>רמת הרשאה</th>
                <th>סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {(digitalAccess ?? []).map((access) => (
                <tr key={access.id}>
                  <td>{access.access_type}</td>
                  <td className="font-mono text-xs">{access.resource_path}</td>
                  <td>{permissionLabels[access.permission_level] ?? access.permission_level}</td>
                  <td><span className="status-badge status-active">{accessStatusLabels[access.status] ?? access.status}</span></td>
                </tr>
              ))}
              {(!digitalAccess || digitalAccess.length === 0) && (
                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">אין הרשאות</td></tr>
              )}
            </tbody>
          </table>
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
    </div>
  );
}
