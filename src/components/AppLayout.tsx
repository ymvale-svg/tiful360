import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { Bell, Search } from "lucide-react";

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      
      {/* Main content area */}
      <div className="mr-[240px] min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-card/80 backdrop-blur-md border-b border-border flex items-center justify-between px-6">
          <div className="flex items-center gap-3 bg-muted rounded-lg px-3 py-2 w-80">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="חיפוש עובדים, ציוד, משימות..."
              className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex items-center gap-4">
            <button className="relative p-2 rounded-lg hover:bg-muted transition-colors">
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="absolute top-1.5 left-1.5 w-2 h-2 bg-destructive rounded-full animate-pulse-dot" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <span className="text-xs font-bold text-primary-foreground">מנ</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">מנהל תפעול</p>
                <p className="text-[11px] text-muted-foreground">ניהול ראשי</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
