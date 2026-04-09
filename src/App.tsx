import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }>
              <Route path="/" element={<Dashboard />} />
              <Route path="/employees" element={<Employees />} />
              <Route path="/employees/:id" element={<EmployeeDetail />} />
              <Route path="/assets" element={<Assets />} />
              <Route path="/categories" element={<CategoryManager />} />
              <Route path="/it-tickets" element={<ITTickets />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/portal" element={<EmployeePortal />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
