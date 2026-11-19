import { Component, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AlertCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InnerProps {
  resetKey: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches a screen that failed to load or render, so the app never turns into a blank page. */
class Inner extends Component<InnerProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Screen failed to render:", error);
  }

  componentDidUpdate(prev: InnerProps) {
    // Navigating elsewhere gives the next screen a fresh chance.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" dir="rtl" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-destructive/10 text-destructive" aria-hidden="true">
          <AlertCircle className="h-6 w-6" />
        </span>
        <p className="text-base font-semibold text-foreground">המסך לא נטען</p>
        <p className="max-w-[44ch] text-sm text-muted-foreground">
          ייתכן שפורסמה גרסה חדשה של המערכת או שהחיבור לאינטרנט נקטע. רענון הדף יטען את הגרסה העדכנית.
        </p>
        <Button type="button" onClick={() => window.location.reload()} className="mt-1 gap-2">
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          רענן את הדף
        </Button>
      </div>
    );
  }
}

export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <Inner resetKey={pathname}>{children}</Inner>;
}
