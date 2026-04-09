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
import UserManagement from "@/pages/UserManagement";
import Companies from "@/pages/Companies";
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
              <Route element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }>
                <Route path="/" element={<Dashboard />} />
                <Route path="/employees" element={<ProtectedRoute requiredRoles={["admin", "super_admin"]}><Employees /></ProtectedRoute>} />
                <Route path="/employees/:id" element={<ProtectedRoute requiredRoles={["admin", "super_admin"]}><EmployeeDetail /></ProtectedRoute>} />
                <Route path="/assets" element={<ProtectedRoute requiredRoles={["admin", "it_manager", "super_admin"]}><Assets /></ProtectedRoute>} />
                <Route path="/categories" element={<ProtectedRoute requiredRoles={["admin", "super_admin"]}><CategoryManager /></ProtectedRoute>} />
                <Route path="/it-tickets" element={<ProtectedRoute requiredRoles={["admin", "it_manager", "super_admin"]}><ITTickets /></ProtectedRoute>} />
                <Route path="/alerts" element={<ProtectedRoute requiredRoles={["admin", "it_manager", "super_admin"]}><Alerts /></ProtectedRoute>} />
                <Route path="/portal" element={<EmployeePortal />} />
                <Route path="/user-management" element={<ProtectedRoute requiredRoles={["admin", "super_admin"]}><UserManagement /></ProtectedRoute>} />
                <Route path="/companies" element={<ProtectedRoute requiredRoles={["super_admin"]}><Companies /></ProtectedRoute>} />
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
