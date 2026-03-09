import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Brain, FileText, Sparkles, Settings } from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  "globe-search": Search,
  search: Search,
  brain: Brain,
  file: FileText,
  sparkles: Sparkles,
};

type AiFunction = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  enabled: boolean;
  icon: string | null;
  created_at: string;
};

export default function AiAdmin() {
  const [functions, setFunctions] = useState<AiFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchFunctions = async () => {
    const { data, error } = await supabase
      .from("ai_functions")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      toast({ title: "Error loading functions", description: error.message, variant: "destructive" });
    } else {
      setFunctions(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchFunctions();
  }, []);

  const toggleFunction = async (id: string, enabled: boolean) => {
    const { error } = await supabase
      .from("ai_functions")
      .update({ enabled })
      .eq("id", id);

    if (error) {
      toast({ title: "Error updating", description: error.message, variant: "destructive" });
    } else {
      setFunctions((prev) =>
        prev.map((f) => (f.id === id ? { ...f, enabled } : f))
      );
      toast({ title: enabled ? "Function enabled" : "Function disabled" });
    }
  };

  const getConfigRoute = (type: string) => {
    if (type === "external_search") return "/ai-admin/search";
    return "/ai-admin";
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Hero */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            AI Functions
          </h1>
          <p className="text-muted-foreground text-lg">
            Enable and configure AI-powered services for your MEO workspace.
          </p>
        </div>

        {/* Function cards */}
        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="space-y-3">
                  <div className="h-10 w-10 rounded-lg bg-muted" />
                  <div className="h-5 w-32 rounded bg-muted" />
                  <div className="h-4 w-48 rounded bg-muted" />
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {functions.map((fn) => {
              const Icon = iconMap[fn.icon || "search"] || Search;
              return (
                <Card
                  key={fn.id}
                  className={`relative overflow-hidden transition-all duration-200 hover:shadow-lg ${
                    fn.enabled ? "border-primary/30 shadow-md" : ""
                  }`}
                >
                  {fn.enabled && (
                    <div className="absolute inset-x-0 top-0 h-1 bg-primary" />
                  )}
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                          fn.enabled
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <Switch
                        checked={fn.enabled}
                        onCheckedChange={(checked) => toggleFunction(fn.id, checked)}
                      />
                    </div>
                    <CardTitle className="mt-3 text-lg">{fn.name}</CardTitle>
                    <CardDescription>{fn.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between pt-0">
                    <Badge variant={fn.enabled ? "default" : "secondary"}>
                      {fn.enabled ? "Active" : "Inactive"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(getConfigRoute(fn.type))}
                      className="gap-1.5"
                    >
                      <Settings className="h-4 w-4" />
                      Configure
                    </Button>
                  </CardContent>
                </Card>
              );
            })}

            {/* Add new function card */}
            <Card className="flex cursor-pointer items-center justify-center border-dashed transition-colors hover:border-primary/50 hover:bg-muted/50 min-h-[200px]">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Sparkles className="h-8 w-8" />
                <span className="text-sm font-medium">Add AI Function</span>
                <span className="text-xs">Coming soon</span>
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
