import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

const SESSION_FLAG = "tiful360-session-active";

/** In-app routes that reset to the home screen when a brand-new browser session opens them. */
const APP_ROUTE_PREFIXES = ["/employees", "/requests", "/payroll", "/assets", "/it-tickets", "/settings"];

/**
 * On the first load of a browser session (new tab / reopened app), any in-app
 * screen resets to the home dashboard. Switching to another window or app and
 * coming back keeps the current screen, because the session flag survives.
 * Public links (signing pages, login, invites) are never redirected.
 */
export function SessionHomeRedirect() {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [freshSession, setFreshSession] = useState(false);

  useEffect(() => {
    try {
      setFreshSession(!sessionStorage.getItem(SESSION_FLAG));
      sessionStorage.setItem(SESSION_FLAG, "1");
    } catch {
      // Storage unavailable (private mode) — never redirect.
    }
    setReady(true);
  }, []);

  if (!ready || !freshSession) return null;

  const isAppRoute = APP_ROUTE_PREFIXES.some(
    (prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`),
  );
  if (!isAppRoute) return null;

  return <Navigate to="/" replace />;
}
