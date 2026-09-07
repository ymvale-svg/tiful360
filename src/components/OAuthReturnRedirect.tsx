import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Managed Google sign-in must return to a public same-origin URL (the app root).
 * Screens that trigger a re-authentication store the page the user came from in
 * sessionStorage; this component sends them back there once they land again.
 */
export function OAuthReturnRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== "/") return;
    const target = sessionStorage.getItem("oauth_return_path");
    if (!target || !target.startsWith("/") || target.startsWith("//") || target === "/") return;
    sessionStorage.removeItem("oauth_return_path");
    navigate(target, { replace: true });
  }, [location.pathname, navigate]);

  return null;
}
