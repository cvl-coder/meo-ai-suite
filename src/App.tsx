import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import AiAdmin from "./pages/AiAdmin";
import AiSearchConfig from "./pages/AiSearchConfig";
import AiTestData from "./pages/AiTestData";
import Integration from "./pages/Integration";
import ChatPlayground from "./pages/ChatPlayground";
import ApiTest from "./pages/ApiTest";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const guarded = (element: JSX.Element) => <ProtectedRoute>{element}</ProtectedRoute>;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/ai-admin" replace />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/ai-admin" element={guarded(<AiAdmin />)} />
            <Route path="/ai-admin/config/:functionId" element={guarded(<AiSearchConfig />)} />
            <Route path="/ai-admin/test-data" element={guarded(<AiTestData />)} />
            <Route path="/integration" element={guarded(<Integration />)} />
            <Route path="/chat" element={guarded(<ChatPlayground />)} />
            <Route path="/api-test" element={guarded(<ApiTest />)} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
