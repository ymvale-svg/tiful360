import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type GateState = "checking" | "allowed" | "blocked";

/**
 * Blocks the whole app unless the visitor's IP is on the allowed list.
 * Fails open on network/function errors so a misconfiguration can't lock everyone out.
 */
export function IpGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("check-access-ip", {
          method: "GET",
        });
        if (cancelled) return;
        if (error || !data) {
          setState("allowed");
          return;
        }
        setState(data.allowed ? "allowed" : "blocked");
      } catch {
        if (!cancelled) setState("allowed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (state === "blocked") {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">הגישה למערכת חסומה</h1>
          <p className="text-sm text-muted-foreground">
            הכניסה למערכת תפעול 360 מותרת כרגע מכתובות מאושרות בלבד.
            לבירורים נא לפנות למנהל המערכת.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
