import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AiAdmin from "./pages/AiAdmin";
import AiSearchConfig from "./pages/AiSearchConfig";
import AiTestData from "./pages/AiTestData";
import Integration from "./pages/Integration";
import ChatPlayground from "./pages/ChatPlayground";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/ai-admin" replace />} />
          <Route path="/ai-admin" element={<AiAdmin />} />
          <Route path="/ai-admin/config/:functionId" element={<AiSearchConfig />} />
          <Route path="/ai-admin/test-data" element={<AiTestData />} />
          <Route path="/integration" element={<Integration />} />
          <Route path="/chat" element={<ChatPlayground />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
