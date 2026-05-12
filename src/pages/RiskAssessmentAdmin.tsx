import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Settings, Plus, Loader2, ChevronUp, ChevronDown, Pencil, Trash2, Save, Eye, AlertTriangle } from "lucide-react";

type Question = {
  id: string;
  category: string;
  question_text: string;
  description: string;
  sort_order: number;
  enabled: boolean;
  ai_prompt_template: string;
  question_type: string;
  context_question_ids: string[];
};

type SettingsData = {
  id: string;
  ai_prompt_template: string;
  ai_endpoint_url: string;
  ai_api_key: string;
  ai_model: string;
  output_language: string;
};

export default function RiskAssessmentAdmin() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [qRes, sRes] = await Promise.all([
      supabase.from("risk_assessment_questions").select("*").order("sort_order"),
      supabase.from("risk_assessment_settings").select("*").limit(1).maybeSingle(),
    ]);
    setQuestions((qRes.data as any) || []);
    if (sRes.data) {
      setSettings(sRes.data as any);
    }
    setLoading(false);
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("risk_assessment_settings")
      .update({
        ai_prompt_template: settings.ai_prompt_template,
        ai_endpoint_url: settings.ai_endpoint_url,
        ai_api_key: settings.ai_api_key,
        ai_model: settings.ai_model,
        output_language: settings.output_language,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settings.id);
    setSavingSettings(false);
    if (error) {
      toast({ title: "Error saving settings", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Settings saved" });
    }
  };

  const moveQuestion = async (index: number, direction: "up" | "down") => {
    const neighborIndex = direction === "up" ? index - 1 : index + 1;
    if (neighborIndex < 0 || neighborIndex >= questions.length) return;
    const current = questions[index];
    const neighbor = questions[neighborIndex];

    const reordered = [...questions];
    reordered[index] = neighbor;
    reordered[neighborIndex] = current;
    setQuestions(reordered);

    const [r1, r2] = await Promise.all([
      supabase.from("risk_assessment_questions").update({ sort_order: neighbor.sort_order }).eq("id", current.id),
      supabase.from("risk_assessment_questions").update({ sort_order: current.sort_order }).eq("id", neighbor.id),
    ]);
    if (r1.error || r2.error) {
      toast({ title: "Error reordering", description: (r1.error || r2.error)?.message, variant: "destructive" });
      loadData();
    }
  };

  const deleteQuestion = async (id: string) => {
    const { error } = await supabase.from("risk_assessment_questions").delete().eq("id", id);
    if (error) {
      toast({ title: "Error deleting", description: error.message, variant: "destructive" });
    } else {
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      toast({ title: "Question deleted" });
    }
  };

  const toggleQuestion = async (id: string, enabled: boolean) => {
    await supabase.from("risk_assessment_questions").update({ enabled }).eq("id", id);
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, enabled } : q)));
  };

  const toggleDataSource = (source: string) => {
    if (!settings) return;
    const current = settings.data_sources;
    const updated = current.includes(source) ? current.filter((s) => s !== source) : [...current, source];
    setSettings({ ...settings, data_sources: updated });
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              Risk Assessment Admin
            </h1>
            <p className="text-muted-foreground">Configure questions, AI prompts, and data sources.</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          {/* Left: Questions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Assessment Questions</h2>
              <Button onClick={() => navigate("/risk-assessment/admin/questions/new")} size="sm" className="gap-2">
                <Plus className="h-4 w-4" /> Add Question
              </Button>
            </div>

            {questions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No questions yet. Add your first question to get started.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {questions.map((q, idx) => (
                  <Card key={q.id} className={`transition-opacity ${!q.enabled ? "opacity-50" : ""}`}>
                    <CardContent className="flex items-center gap-3 py-3">
                      <div className="flex flex-col shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          disabled={idx === 0}
                          onClick={() => moveQuestion(idx, "up")}
                          aria-label="Move up"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          disabled={idx === questions.length - 1}
                          onClick={() => moveQuestion(idx, "down")}
                          aria-label="Move down"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          <span className="text-muted-foreground mr-2">#{idx + 1}</span>
                          {q.question_text}
                        </p>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">{q.category || "General"}</Badge>
                          <Badge variant="secondary" className="text-xs">
                            {q.question_type === "summary" ? "Summary" : q.question_type === "multi_select" ? "Multi" : "Single"}
                          </Badge>
                        </div>
                      </div>
                      <Switch checked={q.enabled} onCheckedChange={(v) => toggleQuestion(q.id, v)} />
                      <Button variant="ghost" size="icon" onClick={() => navigate(`/risk-assessment/admin/questions/${q.id}`)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteQuestion(q.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Right: Settings */}
          <div className="space-y-6">
            {/* Data Sources */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Data Sources</CardTitle>
                <CardDescription>Choose which MEO data feeds into the assessment.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {DATA_SOURCE_OPTIONS.map((ds) => (
                  <label key={ds.value} className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={settings?.data_sources.includes(ds.value)}
                      onCheckedChange={() => toggleDataSource(ds.value)}
                    />
                    <span className="text-sm">{ds.label}</span>
                  </label>
                ))}
              </CardContent>
            </Card>

            {/* AI Config */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">AI Configuration</CardTitle>
                <CardDescription>Configure the AI model used for generating risk notes.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm">AI Endpoint URL</Label>
                  <Input
                    value={settings?.ai_endpoint_url ?? ""}
                    onChange={(e) => settings && setSettings({ ...settings, ai_endpoint_url: e.target.value })}
                    placeholder="https://api.example.com/v1"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">API Key</Label>
                  <Input
                    type="password"
                    value={settings?.ai_api_key ?? ""}
                    onChange={(e) => settings && setSettings({ ...settings, ai_api_key: e.target.value })}
                    placeholder="sk-..."
                  />
                </div>
                <div className="grid gap-4 grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm">Model</Label>
                    <Select
                      value={settings?.ai_model || "gemma2:9b"}
                      onValueChange={(v) => settings && setSettings({ ...settings, ai_model: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gemma2:9b">gemma2:9b</SelectItem>
                        <SelectItem value="glm-4.7-flash:latest">glm-4.7-flash:latest</SelectItem>
                        <SelectItem value="qwen3:14b">qwen3:14b</SelectItem>
                        <SelectItem value="gemma3:12b">gemma3:12b</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Output Language</Label>
                    <Select
                      value={settings?.output_language ?? "English"}
                      onValueChange={(v) => settings && setSettings({ ...settings, output_language: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["English", "Danish", "Norwegian", "Swedish", "German", "French", "Spanish", "Portuguese", "Italian", "Dutch", "Finnish", "Polish"].map((lang) => (
                          <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Global System Prompt</Label>
                  <Textarea
                    value={settings?.ai_prompt_template ?? ""}
                    onChange={(e) => settings && setSettings({ ...settings, ai_prompt_template: e.target.value })}
                    placeholder="e.g. You are a senior AML/KYC compliance analyst writing internal risk assessment notes for a Danish financial institution..."
                    className="h-32 font-mono text-xs"
                  />
                  {settings?.ai_prompt_template && /\b(language:\s*(danish|dansk|english|norwegian|norsk|swedish|svenska|german|deutsch))\b/i.test(settings.ai_prompt_template) && (
                    <div className="flex items-center gap-2 text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-md p-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>This prompt contains hardcoded language instructions that will be stripped at runtime. Use the "Output Language" dropdown instead.</span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Sets the AI persona and context. <strong>Do NOT hardcode language here</strong> — use the Output Language dropdown above. Language lines will be automatically removed at runtime.
                  </p>
                </div>

                {/* Prompt Debug Preview */}
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 w-full">
                      <Eye className="h-3.5 w-3.5" /> Preview Assembled Prompt
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground">System Message (note generation)</Label>
                        <pre className="mt-1 rounded-md border bg-muted/50 p-3 text-xs font-mono whitespace-pre-wrap max-h-48 overflow-auto">
{(() => {
  const outputLang = settings?.output_language || "English";
  const rawPrompt = settings?.ai_prompt_template?.trim() || "You are a senior AML/KYC compliance analyst writing internal risk assessment notes.";
  const langKw = /\b(language:\s*(danish|dansk|english|norwegian|norsk|swedish|svenska|german|deutsch|french|français))\b/gi;
  const cleaned = rawPrompt.split("\n").filter((line) => !langKw.test(line)).join("\n");
  return `[LANGUAGE DIRECTIVE — THIS OVERRIDES EVERYTHING]
You MUST write your ENTIRE response in ${outputLang}. Every single word must be in ${outputLang}.
Do NOT use any other language, even if the input or instructions below contain text in another language.

${cleaned}

Rules:
- Write exactly 2-4 sentences of professional risk analysis.
- Do NOT repeat the question or selected answer back.
- Base your analysis strictly on the provided factual context.
- Focus on the risk implications of the selected answer.`;
})()}
                        </pre>
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground">User Message (example)</Label>
                        <pre className="mt-1 rounded-md border bg-muted/50 p-3 text-xs font-mono whitespace-pre-wrap max-h-48 overflow-auto">
{`Write a concise risk analysis note for this question:

Question: [question text]
Background: [internal support text]
Selected Answer: [selected answer]

**IMPORTANT — You MUST follow these additional instructions:**
[question-specific AI instructions if any]

Provide only your professional risk analysis.

--- Factual Context (use ONLY this data) ---
Question: [question text]
Background: [internal support text]
Selected Answer: [selected answer]
Notes: [existing notes]`}
                        </pre>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>

            <Button onClick={saveSettings} disabled={savingSettings} className="w-full gap-2">
              {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Settings
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
