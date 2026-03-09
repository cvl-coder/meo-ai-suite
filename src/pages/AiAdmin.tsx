import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Brain, FileText, Sparkles, Settings, Play, Loader2, ChevronUp, Database, Plus } from "lucide-react";

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

type ClientField = {
  key: string;
  label: string;
  type: string;
  required: boolean;
};

type SearchConfig = {
  id: string;
  function_id: string;
  search_urls: string[];
  prompt_template: string;
  client_fields: ClientField[];
};

type TestDataEntry = {
  id: string;
  label: string;
  field_values: Record<string, string>;
};

export default function AiAdmin() {
  const [functions, setFunctions] = useState<AiFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [configMap, setConfigMap] = useState<Record<string, SearchConfig>>({});
  const [testDataMap, setTestDataMap] = useState<Record<string, TestDataEntry[]>>({});
  const [selectedTestData, setSelectedTestData] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
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

  const loadConfig = async (fn: AiFunction) => {
    if (expandedId === fn.id) {
      setExpandedId(null);
      setResult(null);
      return;
    }

    // Load config and test data in parallel
    const [configRes, testDataRes] = await Promise.all([
      configMap[fn.id]
        ? Promise.resolve(null)
        : supabase
            .from("ai_search_configs")
            .select("*")
            .eq("function_id", fn.id)
            .limit(1)
            .single(),
      testDataMap[fn.id]
        ? Promise.resolve(null)
        : supabase
            .from("ai_test_data")
            .select("*")
            .eq("function_id", fn.id)
            .order("created_at", { ascending: false }),
    ]);

    if (configRes?.data) {
      setConfigMap((prev) => ({
        ...prev,
        [fn.id]: {
          ...configRes.data,
          search_urls: (configRes.data.search_urls as any) || [],
          client_fields: (configRes.data.client_fields as any) || [],
        },
      }));
    }

    if (testDataRes?.data) {
      setTestDataMap((prev) => ({
        ...prev,
        [fn.id]: (testDataRes.data as any) || [],
      }));
    }

    setExpandedId(fn.id);
    setResult(null);
  };

  const getSelectedInputData = (fnId: string): Record<string, string> => {
    const entryId = selectedTestData[fnId];
    const entries = testDataMap[fnId] || [];
    const entry = entries.find((e) => e.id === entryId);
    return entry?.field_values || {};
  };

  const runFunction = async (fn: AiFunction) => {
    const config = configMap[fn.id];
    if (!config) return;

    const clientData = getSelectedInputData(fn.id);
    if (!selectedTestData[fn.id]) {
      toast({ title: "Select test data first", variant: "destructive" });
      return;
    }

    setRunning(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("ai-search", {
        body: {
          client_data: clientData,
          search_urls: config.search_urls,
          prompt_template: config.prompt_template,
        },
      });

      if (error) {
        toast({ title: "Search failed", description: error.message, variant: "destructive" });
      } else if (data && !data.success) {
        toast({ title: "Search failed", description: data.error || "Unknown error", variant: "destructive" });
      } else {
        setResult(data);
        await supabase.from("ai_search_results").insert({
          config_id: config.id,
          client_data: clientData as any,
          results: data as any,
          status: "completed",
        });
        toast({ title: "Search completed" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }

    setRunning(false);
  };

  const getConfigRoute = (fnId: string) => {
    return `/ai-admin/config/${fnId}`;
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
          <Button variant="outline" size="sm" onClick={() => navigate("/ai-admin/test-data")} className="gap-2 mt-2">
            <Database className="h-4 w-4" />
            Manage Test Data
          </Button>
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
          <div className="space-y-6">
            {functions.map((fn) => {
              const Icon = iconMap[fn.icon || "search"] || Search;
              const isExpanded = expandedId === fn.id;
              const config = configMap[fn.id];

              return (
                <Card
                  key={fn.id}
                  className={`relative overflow-hidden transition-all duration-200 ${
                    fn.enabled ? "border-primary/30 shadow-md" : ""
                  }`}
                >
                  {fn.enabled && (
                    <div className="absolute inset-x-0 top-0 h-1 bg-primary" />
                  )}
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                            fn.enabled
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{fn.name}</CardTitle>
                          <CardDescription>{fn.description}</CardDescription>
                        </div>
                      </div>
                      <Switch
                        checked={fn.enabled}
                        onCheckedChange={(checked) => toggleFunction(fn.id, checked)}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={fn.enabled ? "default" : "secondary"}>
                          {fn.enabled ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(getConfigRoute(fn.id))}
                          className="gap-1.5"
                        >
                          <Settings className="h-4 w-4" />
                          Configure
                        </Button>
                        {fn.enabled && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => loadConfig(fn)}
                            className="gap-1.5"
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                            {isExpanded ? "Close" : "Run"}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Expanded inline run panel */}
                    {isExpanded && fn.enabled && (
                      <div className="border-t pt-4 space-y-4">
                        {!config ? (
                          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Loading configuration...
                          </div>
                        ) : (
                          <>
                            <div className="space-y-3">
                              <Label className="text-sm font-medium">Select Test Data</Label>
                              {(testDataMap[fn.id] || []).length === 0 ? (
                                <div className="flex items-center gap-3 py-4">
                                  <p className="text-sm text-muted-foreground">No test data available.</p>
                                  <Button variant="outline" size="sm" onClick={() => navigate("/ai-admin/test-data")} className="gap-1.5">
                                    <Database className="h-3.5 w-3.5" />
                                    Add Test Data
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <Select
                                    value={selectedTestData[fn.id] || ""}
                                    onValueChange={(val) =>
                                      setSelectedTestData((prev) => ({ ...prev, [fn.id]: val }))
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Choose a test data set..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(testDataMap[fn.id] || []).map((entry) => (
                                        <SelectItem key={entry.id} value={entry.id}>
                                          {entry.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>

                                  {/* Preview selected data */}
                                  {selectedTestData[fn.id] && (
                                    <div className="flex flex-wrap gap-2">
                                      {Object.entries(getSelectedInputData(fn.id)).map(([key, val]) => {
                                        if (!val) return null;
                                        const field = config.client_fields.find((f) => f.key === key);
                                        return (
                                          <Badge key={key} variant="outline" className="text-xs">
                                            {field?.label || key}: {val}
                                          </Badge>
                                        );
                                      })}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>

                            <Button
                              onClick={() => runFunction(fn)}
                              disabled={running || !selectedTestData[fn.id]}
                              className="gap-2"
                            >
                              {running ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                              {running ? "Running..." : "Run Search"}
                            </Button>
                          </>
                        )}

                        {/* Results */}
                        {result && (
                          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                            <h4 className="text-sm font-semibold">Results</h4>
                            {result.synthesis ? (
                              <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap text-sm">
                                {result.synthesis}
                              </div>
                            ) : (
                              <pre className="overflow-auto text-xs font-mono max-h-96">
                                {JSON.stringify(result, null, 2)}
                              </pre>
                            )}
                            {result.sources && (
                              <div className="flex flex-wrap gap-2 pt-2 border-t">
                                {result.sources.map((s: any, i: number) => (
                                  <Badge key={i} variant={s.hasContent ? "default" : "secondary"} className="text-xs">
                                    {new URL(s.url).hostname}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
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
