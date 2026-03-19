import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { clearMeoTokens, isMeoTokenValid } from "@/lib/meoToken";
import { useAuth } from "@/contexts/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate("/auth", {
        replace: true,
        state: { from: location.pathname },
      });
      return;
    }

    if (!isMeoTokenValid()) {
      clearMeoTokens();
      void supabase.auth.signOut();
      toast({
        title: "Session expired",
        description: "Please sign in again to continue.",
        variant: "destructive",
      });
      navigate("/auth", {
        replace: true,
        state: { from: location.pathname },
      });
    }
  }, [loading, location.pathname, navigate, user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (!user || !isMeoTokenValid()) {
    return null;
  }

  return <>{children}</>;
}
