import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getMeoToken, getMeoUserId } from "@/lib/meoToken";
import { ShieldCheck, Play, Loader2, RefreshCw, Settings, ClipboardList, Plus, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import ReactMarkdown from "react-markdown";

const RISK_FUNCTION_ID = "c0b2de3e-0bb0-459d-a1da-1947d2ab9862";

type WorkspaceOption = { id: string; name: string };
type CaseOption = { id: string; label: string; status: string };
type EntityOption = { id: string; name: string; type: string };

type Session = {
  id: string;
  customer_id: string;
  case_id: string;
  total_score: number;
  max_possible_score: number;
  risk_level: string;
  status: string;
  created_at: string;
};

const riskBadge = (level: string) => {
  switch (level) {
    case "low": return <Badge className="bg-green-100 text-green-700 border-green-200">Low</Badge>;
    case "medium": return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Medium</Badge>;
    case "high": return <Badge className="bg-red-100 text-red-700 border-red-200">High</Badge>;
    default: return <Badge variant="secondary">Pending</Badge>;
  }
};

export default function RiskAssessment() {
  const navigate = useNavigate();

  const [meoToken, setMeoToken] = useState("");
  const [meoUserId, setMeoUserId] = useState("");
  const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceOption[]>([]);
  const [caseOptions, setCaseOptions] = useState<CaseOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [loadingWorkspaceParams, setLoadingWorkspaceParams] = useState(false);
  const [loadingCases, setLoadingCases] = useState(false);

  const [caseEntities, setCaseEntities] = useState<EntityOption[]>([]);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);

  // AI generation state
  const [config, setConfig] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [streamedText, setStreamedText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // Past sessions
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const hasMeoSession = Boolean(meoToken && meoUserId);
  const selectedCase = caseOptions.find((c) => c.id === selectedCaseId);

  useEffect(() => {
    setMeoToken(getMeoToken() || "");
    setMeoUserId(getMeoUserId() || "");
    setSelectedCustomerId(localStorage.getItem("selectedCustomerId") || "");
  }, []);

  useEffect(() => {
    if (selectedCustomerId) {
      setSelectedCaseId(localStorage.getItem(`meo_case_id:${selectedCustomerId}`) || "");
    }
  }, [selectedCustomerId]);

  // Load AI config
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("ai_search_configs_safe" as any)
        .select("*")
        .eq("function_id", RISK_FUNCTION_ID)
        .limit(1)
        .maybeSingle();
      if (data) {
        const d = data as any;
        setConfig({ ...d, search_urls: d.search_urls || [], client_fields: d.client_fields || [] });
      }
    })();
  }, []);

  // Load past sessions
  useEffect(() => {
    if (selectedCaseId) {
      setLoadingSessions(true);
      supabase
        .from("risk_assessment_sessions")
        .select("*")
        .eq("case_id", selectedCaseId)
        .order("created_at", { ascending: false })
        .limit(10)
        .then(({ data }) => {
          setSessions((data as any) || []);
          setLoadingSessions(false);
        });
    } else {
      setSessions([]);
    }
  }, [selectedCaseId]);

  const invokeMeoAction = useCallback(async (action: string, payload: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke("meo-api-test", { body: { action, payload } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const loadCasesForWorkspace = useCallback(async (customerId: string, preferredCaseId?: string) => {
    if (!customerId || !meoToken) return;
    setLoadingCases(true);
    try {
      const data = await invokeMeoAction("getCases", { customerId, page: 1, personToken: meoToken, limit: 100, statuses: ["Open", "Approved", "Rejected"] });
      const nextCases: CaseOption[] = Array.isArray(data?.data) ? data.data.map((e: any) => ({ id: String(e.id), label: [e.title, e.externalId].filter(Boolean).join(" · ") || String(e.id), status: e.status || "Unknown" })) : [];
      setCaseOptions(nextCases);
      const saved = localStorage.getItem(`meo_case_id:${customerId}`) || "";
      const next = nextCases.find((e) => e.id === preferredCaseId) || nextCases.find((e) => e.id === saved) || nextCases[0];
      const nextId = next?.id || "";
      setSelectedCaseId(nextId);
      if (nextId) localStorage.setItem(`meo_case_id:${customerId}`, nextId);
    } catch (err) {
      setCaseOptions([]);
      setSelectedCaseId("");
      toast({ title: "Unable to load cases", description: err instanceof Error ? err.message : "Unexpected error", variant: "destructive" });
    } finally { setLoadingCases(false); }
  }, [invokeMeoAction, meoToken]);

  const loadWorkspaceParams = useCallback(async (preferredCustomerId?: string) => {
    if (!meoToken || !meoUserId) return;
    setLoadingWorkspaceParams(true);
    try {
      const data = await invokeMeoAction("getAccount", { personToken: meoToken, userId: meoUserId });
      const memberships = Array.isArray(data?.result?.isAdminAt) ? data.result.isAdminAt : [];
      if (!memberships.length) throw new Error("No customer workspaces found.");
      const ws: WorkspaceOption[] = memberships.filter((e: any) => e?.customerId).map((e: any) => ({ id: String(e.customerId), name: e.name || String(e.customerId) }));
      setWorkspaceOptions(ws);
      const saved = localStorage.getItem("selectedCustomerId") || "";
      const next = ws.find((e) => e.id === preferredCustomerId) || ws.find((e) => e.id === saved) || ws[0];
      if (!next) throw new Error("No workspaces returned.");
      setSelectedCustomerId(next.id);
      localStorage.setItem("selectedCustomerId", next.id);
      await loadCasesForWorkspace(next.id, selectedCaseId || undefined);
    } catch (err) {
      toast({ title: "Unable to load workspaces", description: err instanceof Error ? err.message : "Unexpected error", variant: "destructive" });
    } finally { setLoadingWorkspaceParams(false); }
  }, [invokeMeoAction, loadCasesForWorkspace, meoToken, meoUserId, selectedCaseId]);

  useEffect(() => {
    if (meoToken && meoUserId && workspaceOptions.length === 0) void loadWorkspaceParams(selectedCustomerId || undefined);
  }, [loadWorkspaceParams, meoToken, meoUserId, selectedCustomerId, workspaceOptions.length]);

  const fetchEntitiesForCase = useCallback(async (caseId: string) => {
    if (!caseId || !selectedCustomerId || !meoToken) { setCaseEntities([]); setSelectedEntityIds([]); return; }
    setLoadingEntities(true);
    try {
      const data = await invokeMeoAction("getCase", { caseId, customerId: selectedCustomerId, personToken: meoToken });
      const cd = data?.data || data;
      const individuals = Array.isArray(cd?.individuals) ? cd.individuals : [];
      const companies = Array.isArray(cd?.affiliatedCompanies) ? cd.affiliatedCompanies : [];
      const mapped: EntityOption[] = [...individuals, ...companies].map((e: any) => ({ id: e.id || e.entityId, name: e.name || e.relationsIdentifier || "Unnamed", type: e.type || (individuals.includes(e) ? "Individual" : "Company") })).filter((e) => e.id);
      setCaseEntities(mapped);
      setSelectedEntityIds(mapped.map((e) => e.id));
    } catch { setCaseEntities([]); setSelectedEntityIds([]); }
    finally { setLoadingEntities(false); }
  }, [invokeMeoAction, meoToken, selectedCustomerId]);

  useEffect(() => {
    if (selectedCaseId && selectedCustomerId && meoToken && caseEntities.length === 0) void fetchEntitiesForCase(selectedCaseId);
  }, [selectedCaseId, selectedCustomerId, meoToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWorkspaceChange = async (customerId: string) => {
    setSelectedCustomerId(customerId);
    localStorage.setItem("selectedCustomerId", customerId);
    // Clear stale case/entities from previous workspace to avoid cross-workspace getCase 404s
    setSelectedCaseId("");
    setCaseOptions([]);
    setCaseEntities([]);
    setSelectedEntityIds([]);
    localStorage.removeItem(`meo_case_id:${customerId}`);
    await loadCasesForWorkspace(customerId);
  };

  const handleCaseChange = (caseId: string) => {
    setSelectedCaseId(caseId);
    if (selectedCustomerId) localStorage.setItem(`meo_case_id:${selectedCustomerId}`, caseId);
    void fetchEntitiesForCase(caseId);
  };

  const toggleEntitySelection = (entityId: string) => {
    setSelectedEntityIds((prev) => prev.includes(entityId) ? prev.filter((id) => id !== entityId) : [...prev, entityId]);
  };

  const toggleAllEntities = () => {
    setSelectedEntityIds(selectedEntityIds.length === caseEntities.length ? [] : caseEntities.map((e) => e.id));
  };

  const runAiSummary = async () => {
    if (!config) return;
    if (!meoToken) { toast({ title: "Sign in required", variant: "destructive" }); return; }
    if (!selectedCustomerId || !selectedCaseId) { toast({ title: "Select a case first", variant: "destructive" }); return; }
    setRunning(true); setResult(null); setStreamedText(""); setIsStreaming(true);
    try {
      const riskData = await invokeMeoAction("getRiskAssessments", { caseId: selectedCaseId, customerId: selectedCustomerId, personToken: meoToken, page: 1, limit: 100, orderColumn: "createdAt", orderDirection: "desc" });
      const entityResults: Array<{ entityId: string; entityName: string; data: any }> = [];
      if (selectedEntityIds.length > 0) {
        const promises = selectedEntityIds.map(async (eid) => {
          const entity = caseEntities.find((e) => e.id === eid);
          try {
            const d = await invokeMeoAction("getEntityRiskAssessments", { entityId: eid, customerId: selectedCustomerId, personToken: meoToken, page: 1, limit: 100, orderColumn: "createdAt", orderDirection: "desc" });
            return { entityId: eid, entityName: entity?.name || eid, data: d };
          } catch { return { entityId: eid, entityName: entity?.name || eid, data: { error: "Failed to fetch" } }; }
        });
        entityResults.push(...(await Promise.all(promises)));
      }
      const combinedRiskData = { caseRiskAssessments: riskData, entityRiskAssessments: entityResults };
      const clientData = { risk_text: JSON.stringify(combinedRiskData, null, 2), customer_id: selectedCustomerId, case_id: selectedCaseId };
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch(`${supabaseUrl}/functions/v1/ai-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: supabaseKey, Authorization: `Bearer ${session?.access_token || supabaseKey}` },
        body: JSON.stringify({ config_id: config.id, client_data: clientData, search_urls: config.search_urls, prompt_template: config.prompt_template, ai_endpoint_url: config.ai_endpoint_url || undefined, ai_model: config.ai_model || undefined, output_language: config.output_language || "English" }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream")) {
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");
        const decoder = new TextDecoder();
        let buffer = "", fullText = "", meta: any = null;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const t = line.trim();
            if (t === "event: meta") { meta = "pending"; continue; }
            if (t.startsWith("data: ") && meta === "pending") { try { meta = JSON.parse(t.slice(6)); } catch {} continue; }
            if (!t.startsWith("data: ")) continue;
            const d = t.slice(6);
            if (d === "[DONE]") continue;
            try { const p = JSON.parse(d); const delta = p.choices?.[0]?.delta?.content; if (delta) { fullText += delta; setStreamedText(fullText); } } catch {}
          }
        }
        if (buffer.trim().startsWith("data: ")) { try { const p = JSON.parse(buffer.trim().slice(6)); if (p.sources) meta = p; } catch {} }
        setIsStreaming(false);
        const finalResult = { success: true, synthesis: fullText || "No synthesis generated", sources: meta?.sources || [], prompt_used: meta?.prompt_used || "" };
        setResult(finalResult);
        await supabase.from("ai_search_results").insert({ config_id: config.id, client_data: clientData as any, results: finalResult as any, status: "completed" });
        toast({ title: "AI summary completed" });
      } else {
        const data = await response.json();
        if (!data.success) toast({ title: "Failed", description: data.error || "Unknown error", variant: "destructive" });
        setIsStreaming(false);
      }
    } catch (err: any) {
      setIsStreaming(false);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setRunning(false);
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                Risk Assessment Support
              </h1>
              <p className="text-muted-foreground">Manage risk assessments and generate AI-powered summaries.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/risk-assessment/admin")} className="gap-2">
              <Settings className="h-4 w-4" /> Admin
            </Button>
          </div>
        </div>

        {/* Workspace / Case / Entity selector */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Select Case</CardTitle>
            <CardDescription>Choose a workspace and case to assess.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-end">
              <Button variant="outline" size="sm" onClick={() => void loadWorkspaceParams(selectedCustomerId || undefined)} disabled={!hasMeoSession || loadingWorkspaceParams || loadingCases} className="gap-2">
                {loadingWorkspaceParams || loadingCases ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </Button>
            </div>

            {!hasMeoSession ? (
              <div className="rounded-md border border-dashed bg-muted/50 p-4 text-sm text-muted-foreground">
                Sign in to your MEO account first.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm">Workspace</Label>
                  <Select value={selectedCustomerId} onValueChange={(v) => void handleWorkspaceChange(v)} disabled={loadingWorkspaceParams || workspaceOptions.length === 0}>
                    <SelectTrigger><SelectValue placeholder={loadingWorkspaceParams ? "Loading..." : "Select workspace"} /></SelectTrigger>
                    <SelectContent>{workspaceOptions.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Case</Label>
                  <Select value={selectedCaseId} onValueChange={handleCaseChange} disabled={!selectedCustomerId || loadingCases || caseOptions.length === 0}>
                    <SelectTrigger><SelectValue placeholder={loadingCases ? "Loading..." : "Select case"} /></SelectTrigger>
                    <SelectContent>{caseOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {selectedCase && caseEntities.length > 0 && (
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Entities</Label>
                  <div className="flex items-center gap-2">
                    {loadingEntities && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    <Button variant="ghost" size="sm" onClick={toggleAllEntities} className="text-xs">
                      {selectedEntityIds.length === caseEntities.length ? "Deselect all" : "Select all"}
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {caseEntities.map((entity) => (
                    <label key={entity.id} className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                      <Checkbox checked={selectedEntityIds.includes(entity.id)} onCheckedChange={() => toggleEntitySelection(entity.id)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{entity.name}</p>
                        <p className="text-xs text-muted-foreground">{entity.type}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        {selectedCase && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/risk-assessment/process")}>
              <CardContent className="flex items-center gap-4 py-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ClipboardList className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold">Start New Assessment</p>
                  <p className="text-sm text-muted-foreground">Score risk questions and calculate risk level.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={runAiSummary}>
              <CardContent className="flex items-center gap-4 py-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {running ? <Loader2 className="h-6 w-6 animate-spin" /> : <Play className="h-6 w-6" />}
                </div>
                <div>
                  <p className="font-semibold">{running ? "Generating..." : "Generate AI Summary"}</p>
                  <p className="text-sm text-muted-foreground">Fetch risk data and generate an AI-powered summary.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* AI Streaming / Result */}
        {(isStreaming && streamedText) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Streaming AI Response...
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none text-foreground"><ReactMarkdown>{streamedText}</ReactMarkdown></div>
            </CardContent>
          </Card>
        )}

        {result && !isStreaming && (
          <Card>
            <CardHeader><CardTitle className="text-base">AI Summary</CardTitle></CardHeader>
            <CardContent>
              {result.synthesis ? (
                <div className="prose prose-sm max-w-none text-foreground"><ReactMarkdown>{result.synthesis}</ReactMarkdown></div>
              ) : (
                <pre className="overflow-auto text-xs font-mono max-h-96">{JSON.stringify(result, null, 2)}</pre>
              )}
            </CardContent>
          </Card>
        )}

        {/* Past assessments */}
        {sessions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Past Assessments</CardTitle>
              <CardDescription>Previous risk assessments for this case.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/risk-assessment/process/${s.id}`)}
                >
                  <div className="flex items-center gap-3">
                    {riskBadge(s.risk_level)}
                    <span className="text-sm">
                      {s.total_score}/{s.max_possible_score} ({s.max_possible_score > 0 ? ((s.total_score / s.max_possible_score) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
