import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Shield, Lock, KeyRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { storeMeoToken, clearMeoTokens } from "@/lib/meoToken";
import { useAuth } from "@/contexts/AuthContext";

const MEO_LOGIN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meo-login`;
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const from =
    typeof location.state === "object" &&
    location.state &&
    "from" in location.state &&
    location.state.from &&
    location.state.from !== "/auth"
      ? String(location.state.from)
      : "/ai-admin";

  useEffect(() => {
    if (!loading && user) {
      navigate(from, { replace: true });
    }
  }, [from, loading, navigate, user]);

  const handleCredentialChange = (field: "email" | "password", value: string) => {
    if (field === "email") {
      setEmail(value);
    } else {
      setPassword(value);
    }

    if (showTwoFactor) {
      setShowTwoFactor(false);
      setTwoFactorCode("");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim() || !password) {
      toast({
        title: "Missing details",
        description: "Enter both your email and password.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(MEO_LOGIN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PUBLISHABLE_KEY}`,
          apikey: PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
          personToken: twoFactorCode.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (data.requires2FA) {
        setShowTwoFactor(true);
        toast({
          title: "Verification required",
          description: "Enter the code from your authenticator app.",
        });
        return;
      }

      if (!response.ok || !data.success || !data.meoAccessToken) {
        throw new Error(data.error || `Login failed (${response.status})`);
      }

      storeMeoToken(data.meoAccessToken, data.meoUserId);

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError || !authData.session) {
        clearMeoTokens();
        throw new Error("Your identity was verified, but the app session could not be created. Please try again.");
      }

      toast({
        title: "Signed in",
        description: "Welcome back.",
      });

      navigate(from, { replace: true });
    } catch (error) {
      clearMeoTokens();
      toast({
        title: "Login failed",
        description: error instanceof Error ? error.message : "Unable to sign in right now.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.16),transparent_34%),radial-gradient(circle_at_bottom_right,hsl(var(--accent)/0.14),transparent_28%)]" />
      <Card className="relative z-10 w-full max-w-md border-border/70 bg-card/95 shadow-2xl backdrop-blur-sm">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Shield className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold tracking-tight">MEO AI Access</CardTitle>
            <CardDescription className="text-sm leading-6">
              Sign in with your MEO credentials to access the secure AI workspace.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                value={email}
                onChange={(event) => handleCredentialChange("email", event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => handleCredentialChange("password", event.target.value)}
              />
            </div>

            {showTwoFactor && (
              <div className="space-y-2 rounded-xl border bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <KeyRound className="h-4 w-4 text-primary" />
                  Two-factor authentication
                </div>
                <Label htmlFor="two-factor-code">Verification code</Label>
                <Input
                  id="two-factor-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Enter 6-digit code"
                  value={twoFactorCode}
                  onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </div>
            )}

            <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
              <Lock className="h-4 w-4" />
              {isSubmitting ? "Signing in..." : showTwoFactor ? "Verify code" : "Sign in"}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Protected access for verified MEO users only.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
