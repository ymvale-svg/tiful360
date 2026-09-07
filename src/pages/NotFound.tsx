import { useLocation, Navigate } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  // Older invitation emails were sent with a malformed link (the sender page path
  // was glued in front of /welcome). Those links still carry the auth tokens in
  // the hash, so recover them instead of showing a dead 404.
  const hasAuthTokens = /access_token=|type=(invite|recovery|signup)|error_code=/.test(hash);

  useEffect(() => {
    if (!hasAuthTokens) {
      console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    }
  }, [location.pathname, hasAuthTokens]);

  if (hasAuthTokens) {
    return <Navigate to={`/welcome${hash}`} replace />;
  }

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-muted p-6">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-bold">404</h1>
        <p className="text-xl text-muted-foreground">הדף המבוקש לא נמצא</p>
        <a href="/login" className="text-primary underline hover:text-primary/90">
          חזרה למסך הכניסה
        </a>
      </div>
    </div>
  );
};

export default NotFound;
