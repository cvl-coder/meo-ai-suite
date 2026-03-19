import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Brain, Plug, Database, MessageSquare, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { href: "/ai-admin", label: "AI Functions", icon: Brain },
  { href: "/ai-admin/test-data", label: "Test Data", icon: Database },
  { href: "/integration", label: "Integration", icon: Plug },
  { href: "/chat", label: "Chat", icon: MessageSquare },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/85 backdrop-blur-md">
        <div className="container flex min-h-16 flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center justify-between gap-4">
            <Link to="/ai-admin" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
                <Brain className="h-5 w-5" />
              </div>
              <div>
                <span className="block text-lg font-bold tracking-tight" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                  MEO AI
                </span>
                <span className="block text-xs text-muted-foreground">Secure workspace controls</span>
              </div>
            </Link>

            <Button variant="outline" size="sm" onClick={() => void signOut()} className="gap-2 lg:hidden">
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <nav className="flex flex-wrap items-center gap-1.5">
              {navItems.map(({ href, label, icon: Icon }) => {
                const isActive = location.pathname === href || location.pathname.startsWith(`${href}/`);

                return (
                  <Link
                    key={href}
                    to={href}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-3 self-end lg:self-auto">
              <div className="hidden rounded-lg border bg-muted/50 px-3 py-2 text-right lg:block">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Signed in as</p>
                <p className="text-sm font-medium text-foreground">{user?.email}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void signOut()} className="hidden gap-2 lg:inline-flex">
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-8">{children}</main>
    </div>
  );
}
