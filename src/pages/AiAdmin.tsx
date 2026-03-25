import { useCallback, useEffect, useRef, useState } from "react";
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
import { getMeoToken, getMeoUserId } from "@/lib/meoToken";
import { Search, Brain, FileText, Sparkles, Settings, Play, Loader2, ChevronUp, Database, Plus, RefreshCw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import ReactMarkdown from "react-markdown";

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
  ai_endpoint_url?: string;
  ai_api_key?: string;
  ai_model?: string;
  output_language?: string;
};

type TestDataEntry = {
  id: string;
  label: string;
  field_values: Record<string, string>;
};

type WorkspaceOption = {
  id: string;
  name: string;
};

type CaseOption = {
  id: string;
  label: string;
  status: string;
};

type EntityOption = {
  id: string;
  name: string;
  type: string;
};

export default function AiAdmin() {
  const [functions, setFunctions] = useState<AiFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [configMap, setConfigMap] = useState<Record<string, SearchConfig>>({});
  const [allTestData, setAllTestData] = useState<TestDataEntry[]>([]);
  const [selectedTestData, setSelectedTestData] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [streamedText, setStreamedText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newFn, setNewFn] = useState({ name: "", description: "", type: "external_search" as string, icon: "search" });
  const [creating, setCreating] = useState(false);
  const [meoToken, setMeoToken] = useState("");
  const [meoUserId, setMeoUserId] = useState("");
  const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceOption[]>([]);
  const [caseOptions, setCaseOptions] = useState<CaseOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [loadingWorkspaceParams, setLoadingWorkspaceParams] = useState(false);
  const [loadingCases, setLoadingCases] = useState(false);
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

  useEffect(() => {
    const storedToken = getMeoToken() || "";
    const storedUserId = getMeoUserId() || "";
    const storedCustomerId = localStorage.getItem("selectedCustomerId") || "";

    setMeoToken(storedToken);
    setMeoUserId(storedUserId);
    setSelectedCustomerId(storedCustomerId);

    if (storedCustomerId) {
      setSelectedCaseId(localStorage.getItem(`meo_case_id:${storedCustomerId}`) || "");
    }
  }, []);

  const fetchAllTestData = async () => {
    const { data } = await supabase
      .from("ai_test_data")
      .select("*")
      .order("created_at", { ascending: false });
    setAllTestData((data as any) || []);
  };

  const invokeMeoAction = useCallback(async (action: string, payload: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke("meo-api-test", {
      body: { action, payload },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const loadCasesForWorkspace = useCallback(async (customerId: string, preferredCaseId?: string) => {
    if (!customerId || !meoToken) return;

    setLoadingCases(true);

    try {
      const data = await invokeMeoAction("getCases", {
        customerId,
        page: 1,
        personToken: meoToken,
        limit: 100,
        statuses: ["Open", "Approved", "Rejected"],
      });

      const nextCases: CaseOption[] = Array.isArray(data?.data)
        ? data.data.map((entry: any) => ({
            id: String(entry.id),
            label: [entry.title, entry.externalId].filter(Boolean).join(" · ") || String(entry.id),
            status: entry.status || "Unknown",
          }))
        : [];

      setCaseOptions(nextCases);

      const savedCaseId = localStorage.getItem(`meo_case_id:${customerId}`) || "";
      const nextCase = nextCases.find((entry) => entry.id === preferredCaseId)
        || nextCases.find((entry) => entry.id === savedCaseId)
        || nextCases[0];

      const nextCaseId = nextCase?.id || "";
      setSelectedCaseId(nextCaseId);

      if (nextCaseId) {
        localStorage.setItem(`meo_case_id:${customerId}`, nextCaseId);
      }
    } catch (error) {
      setCaseOptions([]);
      setSelectedCaseId("");
      toast({
        title: "Unable to load cases",
        description: error instanceof Error ? error.message : "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setLoadingCases(false);
    }
  }, [invokeMeoAction, meoToken]);

  const loadWorkspaceParams = useCallback(async (preferredCustomerId?: string) => {
    if (!meoToken || !meoUserId) return;

    setLoadingWorkspaceParams(true);

    try {
      const data = await invokeMeoAction("getAccount", {
        personToken: meoToken,
        userId: meoUserId,
      });

      const adminMemberships = Array.isArray(data?.result?.isAdminAt) ? data.result.isAdminAt : [];
      if (adminMemberships.length === 0) {
        throw new Error("No customer workspaces were found on this account.");
      }

      const nextWorkspaces: WorkspaceOption[] = adminMemberships
        .filter((entry: any) => entry?.customerId)
        .map((entry: any) => ({
          id: String(entry.customerId),
          name: entry.name || String(entry.customerId),
        }));

      setWorkspaceOptions(nextWorkspaces);

      const savedCustomerId = localStorage.getItem("selectedCustomerId") || "";
      const nextWorkspace = nextWorkspaces.find((entry) => entry.id === preferredCustomerId)
        || nextWorkspaces.find((entry) => entry.id === savedCustomerId)
        || nextWorkspaces[0];

      if (!nextWorkspace) {
        throw new Error("No workspaces were returned.");
      }

      setSelectedCustomerId(nextWorkspace.id);
      localStorage.setItem("selectedCustomerId", nextWorkspace.id);
      await loadCasesForWorkspace(nextWorkspace.id, selectedCaseId || undefined);
    } catch (error) {
      toast({
        title: "Unable to load workspaces",
        description: error instanceof Error ? error.message : "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setLoadingWorkspaceParams(false);
    }
  }, [invokeMeoAction, loadCasesForWorkspace, meoToken, meoUserId, selectedCaseId]);

  useEffect(() => {
    if (expandedId && meoToken && meoUserId && workspaceOptions.length === 0) {
      void loadWorkspaceParams(selectedCustomerId || undefined);
    }
  }, [expandedId, loadWorkspaceParams, meoToken, meoUserId, selectedCustomerId, workspaceOptions.length]);

  const handleWorkspaceChange = async (customerId: string) => {
    setSelectedCustomerId(customerId);
    localStorage.setItem("selectedCustomerId", customerId);
    await loadCasesForWorkspace(customerId);
  };

  const handleCaseChange = (caseId: string) => {
    setSelectedCaseId(caseId);

    if (selectedCustomerId) {
      localStorage.setItem(`meo_case_id:${selectedCustomerId}`, caseId);
    }
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
        .from("ai_search_configs_safe" as any)
        .select("*")
        .eq("function_id", fn.id)
        .limit(1)
        .maybeSingle();

      if (data) {
        const configData = data as any;
        setConfigMap((prev) => ({
          ...prev,
          [fn.id]: {
            ...configData,
            search_urls: configData.search_urls || [],
            client_fields: configData.client_fields || [],
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

  const runFunction = async (fn: AiFunction) => {
    const config = configMap[fn.id];
    if (!config) return;

    if (!meoToken) {
      toast({ title: "Sign in required", description: "Sign in with your MEO account first.", variant: "destructive" });
      return;
    }

    if (!selectedCustomerId || !selectedCaseId) {
      toast({ title: "Select a case first", description: "Choose a workspace and case before running the function.", variant: "destructive" });
      return;
    }

    setRunning(true);
    setResult(null);
    setStreamedText("");
    setIsStreaming(true);

    try {
      const riskAssessmentData = await invokeMeoAction("getRiskAssessments", {
        caseId: selectedCaseId,
        customerId: selectedCustomerId,
        personToken: meoToken,
        page: 1,
        limit: 100,
        orderColumn: "createdAt",
        orderDirection: "desc",
      });

      const clientData = {
        ...getSelectedInputData(fn.id),
        risk_text: JSON.stringify(riskAssessmentData, null, 2),
        customer_id: selectedCustomerId,
        case_id: selectedCaseId,
      };

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const session = (await supabase.auth.getSession()).data.session;

      const response = await fetch(`${supabaseUrl}/functions/v1/ai-search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseKey,
          "Authorization": `Bearer ${session?.access_token || supabaseKey}`,
        },
        body: JSON.stringify({
          config_id: config.id,
          client_data: clientData,
          search_urls: config.search_urls,
          prompt_template: config.prompt_template,
          ai_endpoint_url: config.ai_endpoint_url || undefined,
          ai_model: config.ai_model || undefined,
          output_language: config.output_language || "English",
        }),
      });

      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream")) {
        // Streaming response
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";
        let meta: any = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();

            // Handle custom meta event
            if (trimmed.startsWith("event: meta")) continue;
            if (trimmed.startsWith("data: ") && meta === "pending") {
              try {
                meta = JSON.parse(trimmed.slice(6));
              } catch { /* skip */ }
              continue;
            }

            if (trimmed === "event: meta") {
              meta = "pending";
              continue;
            }

            if (!trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullText += delta;
                setStreamedText(fullText);
              }
            } catch { /* skip */ }
          }
        }

        // Handle meta event detection properly
        // Re-parse buffer for any remaining meta
        if (buffer.trim()) {
          const remaining = buffer.trim();
          if (remaining.startsWith("data: ") && remaining.length > 6) {
            try {
              const parsed = JSON.parse(remaining.slice(6));
              if (parsed.sources) meta = parsed;
            } catch { /* skip */ }
          }
        }

        setIsStreaming(false);

        const finalResult = {
          success: true,
          synthesis: fullText || "No synthesis generated",
          sources: meta?.sources || [],
          prompt_used: meta?.prompt_used || "",
        };
        setResult(finalResult);

        await supabase.from("ai_search_results").insert({
          config_id: config.id,
          client_data: clientData as any,
          results: finalResult as any,
          status: "completed",
        });

        const riskAssessmentCount = Array.isArray(riskAssessmentData?.data) ? riskAssessmentData.data.length : 0;
        toast({
          title: "Search completed",
          description: `Used ${riskAssessmentCount} risk assessment${riskAssessmentCount === 1 ? "" : "s"} from the selected case.`,
        });
      } else {
        // JSON error response
        const data = await response.json();
        if (!data.success) {
          toast({ title: "Search failed", description: data.error || "Unknown error", variant: "destructive" });
        }
        setIsStreaming(false);
      }
    } catch (err: any) {
      setIsStreaming(false);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }

    setRunning(false);
  };

  const getConfigRoute = (fnId: string) => {
    return `/ai-admin/config/${fnId}`;
  };

  const selectedCase = caseOptions.find((entry) => entry.id === selectedCaseId);
  const hasMeoSession = Boolean(meoToken && meoUserId);

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
                            {isExpanded ? "Close" : "Test"}
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
                            <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="space-y-1">
                                  <Label className="text-sm font-medium">Risk assessment source</Label>
                                  <p className="text-xs text-muted-foreground">
                                    Select a workspace and case. The function will fetch the risk assessment automatically and inject it as <span className="font-mono">{"{{risk_text}}"}</span>.
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void loadWorkspaceParams(selectedCustomerId || undefined)}
                                  disabled={!hasMeoSession || loadingWorkspaceParams || loadingCases}
                                  className="gap-2"
                                >
                                  {loadingWorkspaceParams || loadingCases ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-4 w-4" />
                                  )}
                                  Refresh MEO data
                                </Button>
                              </div>

                              {!hasMeoSession ? (
                                <div className="rounded-md border border-dashed bg-background/60 p-3 text-sm text-muted-foreground">
                                  Sign in to your MEO account first to load workspaces and cases.
                                </div>
                              ) : (
                                <div className="grid gap-4 md:grid-cols-2">
                                  <div className="space-y-2">
                                    <Label className="text-sm font-medium">Workspace</Label>
                                    <Select
                                      value={selectedCustomerId}
                                      onValueChange={(value) => void handleWorkspaceChange(value)}
                                      disabled={loadingWorkspaceParams || workspaceOptions.length === 0}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder={loadingWorkspaceParams ? "Loading workspaces..." : "Select workspace"} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {workspaceOptions.map((workspace) => (
                                          <SelectItem key={workspace.id} value={workspace.id}>
                                            {workspace.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div className="space-y-2">
                                    <Label className="text-sm font-medium">Case</Label>
                                    <Select
                                      value={selectedCaseId}
                                      onValueChange={handleCaseChange}
                                      disabled={!selectedCustomerId || loadingCases || caseOptions.length === 0}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder={loadingCases ? "Loading cases..." : "Select case"} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {caseOptions.map((entry) => (
                                          <SelectItem key={entry.id} value={entry.id}>
                                            {entry.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              )}

                              {selectedCase && (
                                <div className="flex flex-wrap gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    Case ID: {selectedCaseId}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    Status: {selectedCase.status}
                                  </Badge>
                                </div>
                              )}
                            </div>

                            <div className="space-y-3">
                              <Label className="text-sm font-medium">Optional saved input data</Label>
                              <p className="text-xs text-muted-foreground">
                                Use saved datasets for reusable fields only. The selected case now supplies <span className="font-mono">{"{{risk_text}}"}</span> automatically.
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
                              disabled={running || loadingCases || loadingWorkspaceParams || !selectedCustomerId || !selectedCaseId}
                              className="gap-2"
                            >
                              {running ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                              {running ? "Running..." : fn.type === "summarizer" ? "Generate Summary" : "Run Function"}
                            </Button>
                          </>
                        )}

                        {(isStreaming && streamedText) && (
                          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                            <h4 className="text-sm font-semibold flex items-center gap-2">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Streaming response...
                            </h4>
                            <div className="prose prose-sm max-w-none text-foreground text-sm">
                              <ReactMarkdown>{streamedText}</ReactMarkdown>
                            </div>
                          </div>
                        )}

                        {result && !isStreaming && (
                          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                            <h4 className="text-sm font-semibold">Results</h4>
                            {result.synthesis ? (
                              <div className="prose prose-sm max-w-none text-foreground text-sm">
                                <ReactMarkdown>{result.synthesis}</ReactMarkdown>
                              </div>
                            ) : (
                              <pre className="overflow-auto text-xs font-mono max-h-96">
                                {JSON.stringify(result, null, 2)}
                              </pre>
                            )}
                            {result.sources && result.sources.length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-2 border-t">
                                {result.sources.map((s: any, i: number) => (
                                  <Badge key={i} variant={s.hasContent ? "default" : "secondary"} className="text-xs">
                                    {s.url.startsWith("http") ? new URL(s.url).hostname : s.url}
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
