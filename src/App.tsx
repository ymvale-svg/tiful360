import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { UploadProgressCenter } from "@/components/UploadProgressCenter";
import { SaveProgressBar } from "@/components/SaveProgressBar";
import { ConfirmProvider } from "@/components/feedback/ConfirmDialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { CompanyProvider } from "@/hooks/useCompany";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt";
import { OAuthReturnRedirect } from "@/components/OAuthReturnRedirect";
import { SplashScreen } from "@/components/SplashScreen";
import { LEGACY_REDIRECTS, SCREEN_ROLES, legacyTarget, type LegacyRedirect } from "@/lib/screenAccess";

// Eager: critical entry pages and frequently-used screens (avoids Suspense flash on navigation)
import Login from "@/pages/Login";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Employees from "@/pages/Employees";
import EmployeeDetail from "@/pages/EmployeeDetail";

// Lazy: less-frequent pages — split into separate chunks loaded on demand
// Merged screens (leave, corrections, map, onboarding, hand-over, subscriptions, categories,
// companies, announcements, alerts) are tabs of the hubs below and load their own chunks.
const Assets = lazy(() => import("@/pages/Assets"));
const AssetsDomainPage = lazy(() => import("@/pages/AssetsDomainPage"));
const ITTickets = lazy(() => import("@/pages/ITTickets"));
const Requests = lazy(() => import("@/pages/Requests"));
const EmployeePortal = lazy(() => import("@/pages/EmployeePortal"));
const Settings = lazy(() => import("@/pages/Settings"));
const SelectCompany = lazy(() => import("@/pages/SelectCompany"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Welcome = lazy(() => import("@/pages/Welcome"));
const SignHandover = lazy(() => import("@/pages/SignHandover"));
const SignOffboarding = lazy(() => import("@/pages/SignOffboarding"));
const SelectExperience = lazy(() => import("@/pages/SelectExperience"));
const Payroll = lazy(() => import("@/pages/Payroll"));
const Tax101TokenPage = lazy(() => import("@/pages/Tax101TokenPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const OAuthConsent = lazy(() => import("@/pages/OAuthConsent"));

import { ThemeProvider } from "next-themes";

const queryClient = new QueryClient();

/** Old URL of a merged screen → its hub tab, keeping the query string (e.g. links in emails). */
function LegacyRedirectRoute({ redirect }: { redirect: LegacyRedirect }) {
  const { search } = useLocation();
  return <Navigate to={legacyTarget(redirect, search)} replace />;
}


const App = () => (
  <QueryClientProvider client={queryClient}>
    {/* attribute="class" matches darkMode: ["class"] in tailwind.config.ts.
        Defaults to the OS preference; the header switch overrides and stores it. */}
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <PwaUpdatePrompt />
      <UploadProgressCenter />
      <SaveProgressBar />
      <ConfirmProvider>
      <BrowserRouter>
        <AuthProvider>
          <CompanyProvider>
            <OAuthReturnRedirect />
            <Suspense fallback={<SplashScreen />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/welcome" element={<Welcome />} />
                <Route path="/handover/:token" element={<SignHandover />} />
                <Route path="/h/:code" element={<SignHandover />} />
                <Route path="/sign-offboarding/:token" element={<SignOffboarding />} />
                <Route path="/portal/tax101/:token" element={<Tax101TokenPage />} />
                <Route path="/select-company" element={<SelectCompany />} />
                <Route path="/select-experience" element={<ProtectedRoute><SelectExperience /></ProtectedRoute>} />
                <Route path="/portal" element={<ProtectedRoute><EmployeePortal /></ProtectedRoute>} />
                <Route element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/employees" element={<ProtectedRoute requiredRoles={SCREEN_ROLES.employees}><Employees /></ProtectedRoute>} />
                  <Route path="/employees/:id" element={<ProtectedRoute requiredRoles={SCREEN_ROLES.employeeDetail}><EmployeeDetail /></ProtectedRoute>} />
                  <Route path="/requests" element={<ProtectedRoute requiredRoles={SCREEN_ROLES.requests}><Requests /></ProtectedRoute>} />
                  <Route path="/payroll" element={<ProtectedRoute requiredRoles={SCREEN_ROLES.payroll}><Payroll /></ProtectedRoute>} />
                  <Route path="/assets" element={<ProtectedRoute requiredRoles={SCREEN_ROLES.assets}><Assets /></ProtectedRoute>} />
                  <Route path="/assets/:domain/:itemId?" element={<ProtectedRoute requiredRoles={SCREEN_ROLES.assetDomain}><AssetsDomainPage /></ProtectedRoute>} />
                  <Route path="/it-tickets" element={<ProtectedRoute requiredRoles={SCREEN_ROLES.tickets}><ITTickets /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute requiredRoles={SCREEN_ROLES.settings}><Settings /></ProtectedRoute>} />
                  {LEGACY_REDIRECTS.map((r) => (
                    <Route key={r.from} path={r.from} element={<LegacyRedirectRoute redirect={r} />} />
                  ))}
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </CompanyProvider>
        </AuthProvider>
      </BrowserRouter>
      </ConfirmProvider>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
