import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save, Play, Globe, FileText, Users, Loader2, Search, Download, Eye } from "lucide-react";

const SOURCE_TYPES = [
  { value: "search", label: "Web Search", description: "Search the domain for relevant results using keywords", icon: Search },
  { value: "scrape", label: "Scrape Page", description: "Extract content directly from the URL", icon: Eye },
  { value: "file_download", label: "Download & Parse File", description: "Download a file (Excel, CSV, PDF) from the URL and search through it", icon: Download },
] as const;

type SourceType = typeof SOURCE_TYPES[number]["value"];

type SearchSource = {
  url: string;
  type: SourceType;
  description: string;
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
  search_urls: SearchSource[];
  prompt_template: string;
  client_fields: ClientField[];
};

type SearchResult = {
  id: string;
  client_data: Record<string, string>;
  results: any;
  status: string;
  created_at: string;
};

export default function AiSearchConfig() {
  const { functionId } = useParams<{ functionId: string }>();
  const [config, setConfig] = useState<SearchConfig | null>(null);
  const [functionName, setFunctionName] = useState("AI Function");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newSourceType, setNewSourceType] = useState<SourceType>("search");
  const [newSourceDesc, setNewSourceDesc] = useState("");
  const [testData, setTestData] = useState<Record<string, string>>({});
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [history, setHistory] = useState<SearchResult[]>([]);

  useEffect(() => {
    if (functionId) {
      fetchFunctionName();
      fetchConfig();
      fetchHistory();
    }
  }, [functionId]);

  const fetchFunctionName = async () => {
    const { data } = await supabase
      .from("ai_functions")
      .select("name")
      .eq("id", functionId!)
      .single();
    if (data) setFunctionName(data.name);
  };

  const fetchConfig = async () => {
    const { data, error } = await supabase
      .from("ai_search_configs")
      .select("*")
      .eq("function_id", functionId!)
      .limit(1)
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (data) {
      setConfig({
        ...data,
        search_urls: (data.search_urls as any) || [],
        client_fields: (data.client_fields as any) || [],
      });
    }
    setLoading(false);
  };

  const fetchHistory = async () => {
    const { data } = await supabase
      .from("ai_search_results")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    setHistory((data as any) || []);
  };

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    const { error } = await supabase
      .from("ai_search_configs")
      .update({
        search_urls: config.search_urls as any,
        prompt_template: config.prompt_template,
        client_fields: config.client_fields as any,
      })
      .eq("id", config.id);

    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configuration saved" });
    }
    setSaving(false);
  };

  const addUrl = () => {
    if (!newUrl.trim() || !config) return;
    setConfig({ ...config, search_urls: [...config.search_urls, newUrl.trim()] });
    setNewUrl("");
  };

  const removeUrl = (index: number) => {
    if (!config) return;
    setConfig({
      ...config,
      search_urls: config.search_urls.filter((_, i) => i !== index),
    });
  };

  const addField = () => {
    if (!config) return;
    setConfig({
      ...config,
      client_fields: [
        ...config.client_fields,
        { key: `field_${Date.now()}`, label: "New Field", type: "text", required: false },
      ],
    });
  };

  const updateField = (index: number, updates: Partial<ClientField>) => {
    if (!config) return;
    const fields = [...config.client_fields];
    fields[index] = { ...fields[index], ...updates };
    setConfig({ ...config, client_fields: fields });
  };

  const removeField = (index: number) => {
    if (!config) return;
    setConfig({
      ...config,
      client_fields: config.client_fields.filter((_, i) => i !== index),
    });
  };

  const runTest = async () => {
    if (!config) return;
    setTestRunning(true);
    setTestResult(null);

    try {
      // Call the ai-search edge function
      const { data: fnData, error: fnError } = await supabase.functions.invoke("ai-search", {
        body: {
          client_data: testData,
          search_urls: config.search_urls,
          prompt_template: config.prompt_template,
        },
      });

      if (fnError) {
        toast({ title: "Search failed", description: fnError.message, variant: "destructive" });
        setTestRunning(false);
        return;
      }

      if (fnData && !fnData.success) {
        toast({ title: "Search failed", description: fnData.error || "Unknown error", variant: "destructive" });
        setTestRunning(false);
        return;
      }

      setTestResult(fnData);

      // Save to history
      await supabase.from("ai_search_results").insert({
        config_id: config.id,
        client_data: testData as any,
        results: fnData as any,
        status: "completed",
      });

      toast({ title: "Search completed successfully" });
      fetchHistory();
    } catch (err: any) {
      toast({ title: "Search failed", description: err.message || "Unexpected error", variant: "destructive" });
    }

    setTestRunning(false);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!config) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">
          No search configuration found. Enable the External AI Search function first.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              {functionName} Config
            </h1>
            <p className="text-muted-foreground">
              Configure search sources, prompts, and client data fields.
            </p>
          </div>
          <Button onClick={saveConfig} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </div>

        <Tabs defaultValue="sources" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="sources" className="gap-2">
              <Globe className="h-4 w-4" />
              Sources
            </TabsTrigger>
            <TabsTrigger value="prompts" className="gap-2">
              <FileText className="h-4 w-4" />
              Prompts
            </TabsTrigger>
            <TabsTrigger value="fields" className="gap-2">
              <Users className="h-4 w-4" />
              Client Fields
            </TabsTrigger>
            <TabsTrigger value="test" className="gap-2">
              <Play className="h-4 w-4" />
              Test
            </TabsTrigger>
          </TabsList>

          {/* Search Sources */}
          <TabsContent value="sources">
            <Card>
              <CardHeader>
                <CardTitle>Search Sources</CardTitle>
                <CardDescription>
                  Define the URLs that will be scraped for client information.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="https://example.com"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addUrl()}
                  />
                  <Button onClick={addUrl} size="icon" variant="outline">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {config.search_urls.map((url, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border bg-card p-3"
                    >
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{url}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeUrl(i)}
                        className="h-8 w-8 text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {config.search_urls.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No search sources added yet.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Prompt Template */}
          <TabsContent value="prompts">
            <Card>
              <CardHeader>
                <CardTitle>Prompt Template</CardTitle>
                <CardDescription>
                  Configure the AI prompt. Use {"{{field_key}}"} to reference client fields.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={config.prompt_template}
                  onChange={(e) =>
                    setConfig({ ...config, prompt_template: e.target.value })
                  }
                  rows={8}
                  className="font-mono text-sm"
                  placeholder="Find information about {{name}} from {{company}}..."
                />
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs text-muted-foreground">Available variables:</span>
                  {config.client_fields.map((f) => (
                    <Badge key={f.key} variant="outline" className="font-mono text-xs">
                      {`{{${f.key}}}`}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Client Fields */}
          <TabsContent value="fields">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Client Information Fields</CardTitle>
                    <CardDescription>
                      Define what information is collected about the client before searching.
                    </CardDescription>
                  </div>
                  <Button onClick={addField} variant="outline" size="sm" className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    Add Field
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {config.client_fields.map((field, i) => (
                  <div key={i} className="grid grid-cols-4 gap-3 rounded-lg border p-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Key</Label>
                      <Input
                        value={field.key}
                        onChange={(e) => updateField(i, { key: e.target.value })}
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Label</Label>
                      <Input
                        value={field.label}
                        onChange={(e) => updateField(i, { label: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <Input
                        value={field.type}
                        onChange={(e) => updateField(i, { type: e.target.value })}
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <Button
                        variant={field.required ? "default" : "outline"}
                        size="sm"
                        onClick={() => updateField(i, { required: !field.required })}
                      >
                        {field.required ? "Required" : "Optional"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeField(i)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Test Panel */}
          <TabsContent value="test">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Test Search</CardTitle>
                  <CardDescription>
                    Enter sample client data and run a test search.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {config.client_fields.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <Label>
                        {field.label}
                        {field.required && <span className="text-destructive ml-1">*</span>}
                      </Label>
                      {field.type === "textarea" ? (
                        <Textarea
                          value={testData[field.key] || ""}
                          onChange={(e) =>
                            setTestData({ ...testData, [field.key]: e.target.value })
                          }
                          placeholder={`Enter ${field.label.toLowerCase()}`}
                        />
                      ) : (
                        <Input
                          value={testData[field.key] || ""}
                          onChange={(e) =>
                            setTestData({ ...testData, [field.key]: e.target.value })
                          }
                          placeholder={`Enter ${field.label.toLowerCase()}`}
                        />
                      )}
                    </div>
                  ))}
                  <Button
                    onClick={runTest}
                    disabled={testRunning}
                    className="w-full gap-2"
                  >
                    {testRunning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    Run Test Search
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Results</CardTitle>
                  <CardDescription>Test search output will appear here.</CardDescription>
                </CardHeader>
                <CardContent>
                  {testResult ? (
                    <pre className="overflow-auto rounded-lg bg-muted p-4 text-xs font-mono max-h-96">
                      {JSON.stringify(testResult, null, 2)}
                    </pre>
                  ) : (
                    <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
                      Run a test to see results
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* History */}
            {history.length > 0 && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Recent Searches</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {history.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between rounded-lg border p-3 text-sm"
                      >
                        <div className="flex items-center gap-3">
                          <Badge variant={h.status === "completed" ? "default" : "secondary"}>
                            {h.status}
                          </Badge>
                          <span className="text-muted-foreground">
                            {Object.values(h.client_data).filter(Boolean).join(" · ")}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(h.created_at).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
