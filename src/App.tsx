import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { CompanyProvider } from "@/hooks/useCompany";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Employees from "@/pages/Employees";
import EmployeeDetail from "@/pages/EmployeeDetail";
import Assets from "@/pages/Assets";
import ITTickets from "@/pages/ITTickets";
import Alerts from "@/pages/Alerts";
import EmployeePortal from "@/pages/EmployeePortal";
import Settings from "@/pages/Settings";
import Login from "@/pages/Login";
import CategoryManager from "@/pages/CategoryManager";
import { Navigate } from "react-router-dom";
import Companies from "@/pages/Companies";
import SelectCompany from "@/pages/SelectCompany";
import ResetPassword from "@/pages/ResetPassword";
import SignHandover from "@/pages/SignHandover";
import SignOffboarding from "@/pages/SignOffboarding";
import LeaveRequests from "@/pages/LeaveRequests";
import AttendanceCorrections from "@/pages/AttendanceCorrections";
import Payroll from "@/pages/Payroll";
import Tax101TokenPage from "@/pages/Tax101TokenPage";
import AttendanceMap from "@/pages/AttendanceMap";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <CompanyProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/handover/:token" element={<SignHandover />} />
              <Route path="/sign-offboarding/:token" element={<SignOffboarding />} />
              <Route path="/portal/tax101/:token" element={<Tax101TokenPage />} />
              <Route path="/select-company" element={<SelectCompany />} />
              <Route path="/portal" element={<ProtectedRoute><EmployeePortal /></ProtectedRoute>} />
              <Route element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }>
                <Route path="/" element={<Dashboard />} />
                <Route path="/employees" element={<ProtectedRoute requiredRoles={["admin", "super_admin", "operations"]}><Employees /></ProtectedRoute>} />
                <Route path="/employees/:id" element={<ProtectedRoute requiredRoles={["admin", "super_admin", "operations", "direct_manager", "payroll"]}><EmployeeDetail /></ProtectedRoute>} />
                <Route path="/assets" element={<ProtectedRoute requiredRoles={["admin", "it_manager", "super_admin", "operations"]}><Assets /></ProtectedRoute>} />
                <Route path="/categories" element={<ProtectedRoute requiredRoles={["admin", "super_admin", "operations"]}><CategoryManager /></ProtectedRoute>} />
                <Route path="/it-tickets" element={<ProtectedRoute requiredRoles={["admin", "it_manager", "super_admin", "operations"]}><ITTickets /></ProtectedRoute>} />
                <Route path="/alerts" element={<ProtectedRoute requiredRoles={["admin", "it_manager", "super_admin"]}><Alerts /></ProtectedRoute>} />
                <Route path="/user-management" element={<Navigate to="/employees?tab=users" replace />} />
                <Route path="/companies" element={<ProtectedRoute requiredRoles={["super_admin"]}><Companies /></ProtectedRoute>} />
                <Route path="/leave-requests" element={<ProtectedRoute requiredRoles={["admin", "super_admin", "direct_manager", "payroll"]}><LeaveRequests /></ProtectedRoute>} />
                <Route path="/attendance-corrections" element={<ProtectedRoute requiredRoles={["admin", "super_admin", "direct_manager", "payroll"]}><AttendanceCorrections /></ProtectedRoute>} />
                <Route path="/payroll" element={<ProtectedRoute requiredRoles={["admin", "super_admin", "payroll"]}><Payroll /></ProtectedRoute>} />
                <Route path="/attendance-map" element={<ProtectedRoute requiredRoles={["admin", "super_admin", "payroll", "direct_manager"]}><AttendanceMap /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute requiredRoles={["admin", "super_admin"]}><Settings /></ProtectedRoute>} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </CompanyProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
