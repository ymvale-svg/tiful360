import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

const SESSION_FLAG = "tiful360-session-active";

/** In-app routes that reset to the home screen when a brand-new browser session opens them. */
const APP_ROUTE_PREFIXES = ["/employees", "/requests", "/payroll", "/assets", "/it-tickets", "/settings"];

function isAppRoute(pathname: string): boolean {
  return APP_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Reads and sets the session flag once; true only for the first load of a browser session. */
function consumeFreshSession(): boolean {
  try {
    const fresh = !sessionStorage.getItem(SESSION_FLAG);
    sessionStorage.setItem(SESSION_FLAG, "1");
    return fresh;
  } catch {
    // Storage unavailable (private mode) — never redirect.
    return false;
  }
}

/**
 * On the first load of a browser session (new tab / reopened app), the in-app
 * screen it opened on resets to the home dashboard. The decision is made once,
 * for the initial URL only: later in-app navigation (sidebar links etc.) is
 * never redirected. Public links (signing pages, login, invites) are never
 * redirected.
 */
export function SessionHomeRedirect() {
  const location = useLocation();
  const [initialPath] = useState(() => location.pathname);
  const [redirectInitial] = useState(() => consumeFreshSession() && isAppRoute(location.pathname));
  const [done, setDone] = useState(!redirectInitial);

  useEffect(() => {
    if (location.pathname !== initialPath) setDone(true);
  }, [location.pathname, initialPath]);

  if (done || location.pathname !== initialPath) return null;
  return <Navigate to="/" replace />;
}
