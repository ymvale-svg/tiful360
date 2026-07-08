import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { CompanyProvider } from "@/hooks/useCompany";
import { ProtectedRoute } from "@/components/ProtectedRoute";

// Eager: critical entry pages and frequently-used screens (avoids Suspense flash on navigation)
import Login from "@/pages/Login";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Employees from "@/pages/Employees";
import EmployeeDetail from "@/pages/EmployeeDetail";
import AttendanceMap from "@/pages/AttendanceMap";

// Lazy: less-frequent pages — split into separate chunks loaded on demand
const Assets = lazy(() => import("@/pages/Assets"));
const AssetsDomainPage = lazy(() => import("@/pages/AssetsDomainPage"));
const ITTickets = lazy(() => import("@/pages/ITTickets"));
const Alerts = lazy(() => import("@/pages/Alerts"));
const EmployeePortal = lazy(() => import("@/pages/EmployeePortal"));
const Settings = lazy(() => import("@/pages/Settings"));
const CategoryManager = lazy(() => import("@/pages/CategoryManager"));
const Companies = lazy(() => import("@/pages/Companies"));
const SelectCompany = lazy(() => import("@/pages/SelectCompany"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Welcome = lazy(() => import("@/pages/Welcome"));
const SignHandover = lazy(() => import("@/pages/SignHandover"));
const SignOffboarding = lazy(() => import("@/pages/SignOffboarding"));
const SelectExperience = lazy(() => import("@/pages/SelectExperience"));
const LeaveRequests = lazy(() => import("@/pages/LeaveRequests"));
const AttendanceCorrections = lazy(() => import("@/pages/AttendanceCorrections"));
const Payroll = lazy(() => import("@/pages/Payroll"));
const Tax101TokenPage = lazy(() => import("@/pages/Tax101TokenPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <CompanyProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/welcome" element={<Welcome />} />
                <Route path="/handover/:token" element={<SignHandover />} />
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
                  <Route path="/employees" element={<ProtectedRoute requiredRoles={["admin", "super_admin", "operations", "payroll", "hr", "finance"]}><Employees /></ProtectedRoute>} />
                  <Route path="/employees/:id" element={<ProtectedRoute requiredRoles={["admin", "super_admin", "operations", "direct_manager", "payroll", "hr", "finance"]}><EmployeeDetail /></ProtectedRoute>} />
                  <Route path="/assets" element={<ProtectedRoute requiredRoles={["admin", "it_manager", "super_admin", "operations", "finance", "legal"]}><Assets /></ProtectedRoute>} />
                  <Route path="/assets/:domain/:itemId?" element={<ProtectedRoute requiredRoles={["admin", "it_manager", "super_admin", "operations", "finance", "legal"]}><AssetsDomainPage /></ProtectedRoute>} />

                  <Route path="/categories" element={<ProtectedRoute requiredRoles={["admin", "super_admin", "operations", "legal"]}><CategoryManager /></ProtectedRoute>} />
                  <Route path="/it-tickets" element={<ProtectedRoute requiredRoles={["admin", "it_manager", "super_admin", "operations"]}><ITTickets /></ProtectedRoute>} />
                  <Route path="/alerts" element={<ProtectedRoute requiredRoles={["admin", "it_manager", "super_admin"]}><Alerts /></ProtectedRoute>} />
                  <Route path="/user-management" element={<Navigate to="/employees?tab=users" replace />} />
                  <Route path="/companies" element={<ProtectedRoute requiredRoles={["super_admin"]}><Companies /></ProtectedRoute>} />
                  <Route path="/leave-requests" element={<ProtectedRoute requiredRoles={["admin", "super_admin", "direct_manager", "payroll", "hr"]}><LeaveRequests /></ProtectedRoute>} />
                  <Route path="/attendance-corrections" element={<ProtectedRoute requiredRoles={["admin", "super_admin", "direct_manager", "payroll", "hr"]}><AttendanceCorrections /></ProtectedRoute>} />
                  <Route path="/payroll" element={<ProtectedRoute requiredRoles={["admin", "super_admin", "payroll", "hr", "finance"]}><Payroll /></ProtectedRoute>} />
                  <Route path="/attendance-map" element={<ProtectedRoute requiredRoles={["admin", "super_admin", "payroll", "hr", "direct_manager"]}><AttendanceMap /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute requiredRoles={["admin", "super_admin"]}><Settings /></ProtectedRoute>} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </CompanyProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
