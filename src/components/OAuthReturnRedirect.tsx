import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { oauthReturnPath } from "@/lib/oauth-return-path";
import { useAuth } from "@/hooks/useAuth";

/**
 * Managed Google sign-in must return to a public same-origin URL (the app root).
 * Screens that trigger a re-authentication store the page the user came from in
 * sessionStorage; this component sends them back there once they land again.
 */
export function OAuthReturnRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, user } = useAuth();

  useEffect(() => {
    if (location.pathname !== "/" || loading || !user) return;
    const target = oauthReturnPath(sessionStorage.getItem("oauth_return_path"));
    sessionStorage.removeItem("oauth_return_path");
    if (target === "/") return;
    navigate(target, { replace: true });
  }, [location.pathname, navigate, loading, user]);

  return null;
}
