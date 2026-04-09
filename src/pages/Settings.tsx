import { Settings as SettingsIcon, Bell, Shield, Database, Users } from "lucide-react";

export default function Settings() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">הגדרות</h1>
        <p className="page-subtitle">ניהול הגדרות המערכת, התראות ואבטחה</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { icon: SettingsIcon, title: "הגדרות כלליות", desc: "שם חברה, לוגו, אזור זמן" },
          { icon: Bell, title: "חוקי התראות", desc: "הגדרת תזכורות וסיפי מלאי" },
          { icon: Shield, title: "אבטחה והרשאות", desc: "ניהול תפקידים ורמות גישה" },
          { icon: Database, title: "מחולל קטגוריות", desc: "הוספה ועריכת סוגי ציוד" },
          { icon: Users, title: "ניהול משתמשים", desc: "הוספת מנהלי מערכת" },
        ].map((item) => (
          <div key={item.title} className="bg-card rounded-xl border border-border/50 p-5 hover:shadow-md transition-shadow cursor-pointer flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <item.icon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-medium">{item.title}</p>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
