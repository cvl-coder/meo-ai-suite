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
  const [allTestData, setAllTestData] = useState<TestDataEntry[]>([]);
  const [selectedTestData, setSelectedTestData] = useState<Record<string, string>>({});
  const [inlineRiskText, setInlineRiskText] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newFn, setNewFn] = useState({ name: "", description: "", type: "external_search" as string, icon: "search" });
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const createFunction = async () => {
    if (!newFn.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setCreating(true);
    const { data, error } = await supabase
      .from("ai_functions")
      .insert({ name: newFn.name, description: newFn.description || null, type: newFn.type as any, icon: newFn.icon })
      .select()
      .single();
    setCreating(false);

    if (error) {
      toast({ title: "Error creating function", description: error.message, variant: "destructive" });
    } else {
      setFunctions((prev) => [...prev, data as any]);
      setShowAddDialog(false);
      setNewFn({ name: "", description: "", type: "external_search", icon: "search" });
      toast({ title: "Function created" });
    }
  };

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
    fetchAllTestData();
  }, []);

  const fetchAllTestData = async () => {
    const { data } = await supabase
      .from("ai_test_data")
      .select("*")
      .order("created_at", { ascending: false });
    setAllTestData((data as any) || []);
  };

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

    if (!configMap[fn.id]) {
      const { data } = await supabase
        .from("ai_search_configs")
        .select("*")
        .eq("function_id", fn.id)
        .limit(1)
        .maybeSingle();

      if (data) {
        setConfigMap((prev) => ({
          ...prev,
          [fn.id]: {
            ...data,
            search_urls: (data.search_urls as any) || [],
            client_fields: (data.client_fields as any) || [],
          },
        }));
      }
    }

    setExpandedId(fn.id);
    setResult(null);
  };

  const getSelectedInputData = (fnId: string): Record<string, string> => {
    const entryId = selectedTestData[fnId];
    const entry = allTestData.find((e) => e.id === entryId);
    return entry?.field_values || {};
  };

  const getRunInputData = (fnId: string): Record<string, string> => ({
    ...getSelectedInputData(fnId),
    risk_text: inlineRiskText[fnId]?.trim() || "",
  });

  const runFunction = async (fn: AiFunction) => {
    const config = configMap[fn.id];
    if (!config) return;

    const riskText = inlineRiskText[fn.id]?.trim();
    if (!riskText) {
      toast({ title: "Enter risk text first", variant: "destructive" });
      return;
    }

    const clientData = getRunInputData(fn.id);

    setRunning(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("ai-search", {
        body: {
          client_data: clientData,
          search_urls: config.search_urls,
          prompt_template: config.prompt_template,
          ai_endpoint_url: (config as any).ai_endpoint_url || undefined,
          ai_api_key: (config as any).ai_api_key || undefined,
          ai_model: (config as any).ai_model || undefined,
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

                    {isExpanded && fn.enabled && (
                      <div className="border-t pt-4 space-y-4">
                        {!config ? (
                          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Loading configuration...
                          </div>
                        ) : (
                          <>
                            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                              <div className="space-y-1">
                                <Label className="text-sm font-medium">Risk text</Label>
                                <p className="text-xs text-muted-foreground">
                                  This is entered per run from the AI function and is available in the prompt as <span className="font-mono">{"{{risk_text}}"}</span>.
                                </p>
                              </div>
                              <Textarea
                                value={inlineRiskText[fn.id] || ""}
                                onChange={(e) =>
                                  setInlineRiskText((prev) => ({ ...prev, [fn.id]: e.target.value }))
                                }
                                placeholder="Paste the risk assessment text for this run..."
                                rows={8}
                                className="min-h-40"
                              />
                            </div>

                            <div className="space-y-3">
                              <Label className="text-sm font-medium">Optional saved input data</Label>
                              <p className="text-xs text-muted-foreground">
                                Use saved datasets only for reusable structured fields. Risk text is always entered here in the function runner.
                              </p>
                              {allTestData.length === 0 ? (
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
                                      <SelectValue placeholder="Choose a saved data set (optional)..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {allTestData.map((entry) => (
                                        <SelectItem key={entry.id} value={entry.id}>
                                          {entry.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>

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
                              disabled={running || !inlineRiskText[fn.id]?.trim()}
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

            <Card
              className="flex cursor-pointer items-center justify-center border-dashed transition-colors hover:border-primary/50 hover:bg-muted/50 min-h-[200px]"
              onClick={() => setShowAddDialog(true)}
            >
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Plus className="h-8 w-8" />
                <span className="text-sm font-medium">Add AI Function</span>
              </div>
            </Card>
          </div>
        )}
      </div>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New AI Function</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="e.g. Board Member Search"
                value={newFn.name}
                onChange={(e) => setNewFn((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="What does this function do?"
                value={newFn.description}
                onChange={(e) => setNewFn((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={newFn.type} onValueChange={(v) => setNewFn((p) => ({ ...p, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="external_search">External Search</SelectItem>
                  <SelectItem value="summarizer">Summarizer</SelectItem>
                  <SelectItem value="classifier">Classifier</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <Select value={newFn.icon} onValueChange={(v) => setNewFn((p) => ({ ...p, icon: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="search">Search</SelectItem>
                  <SelectItem value="brain">Brain</SelectItem>
                  <SelectItem value="file">File</SelectItem>
                  <SelectItem value="sparkles">Sparkles</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={createFunction} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
