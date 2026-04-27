import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Settings, Plus, Loader2, ChevronUp, ChevronDown, Pencil, Trash2, Save, X, Eye, AlertTriangle } from "lucide-react";

type AnswerOption = {
  id?: string;
  question_id?: string;
  label: string;
  score: number;
  sort_order: number;
};

type Question = {
  id: string;
  category: string;
  question_text: string;
  description: string;
  max_score: number;
  sort_order: number;
  enabled: boolean;
  ai_prompt_template: string;
  question_type: string;
  context_question_ids: string[];
};

type SettingsData = {
  id: string;
  low_threshold: number;
  medium_threshold: number;
  ai_prompt_template: string;
  ai_endpoint_url: string;
  ai_api_key: string;
  ai_model: string;
  output_language: string;
  data_sources: string[];
};

const DATA_SOURCE_OPTIONS = [
  { value: "case_risk", label: "Case Risk Assessments" },
  { value: "entity_risk", label: "Entity Risk Assessments" },
  { value: "case_data", label: "Case Data" },
  { value: "entity_data", label: "Entity Data" },
];

export default function RiskAssessmentAdmin() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [formData, setFormData] = useState({
    category: "",
    question_text: "",
    description: "",
    max_score: 5,
    sort_order: 0,
    enabled: true,
    ai_prompt_template: "",
    question_type: "single_select",
    context_question_ids: [] as string[],
  });
  const [answerOptions, setAnswerOptions] = useState<AnswerOption[]>([]);
  const [savingQuestion, setSavingQuestion] = useState(false);

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
      const s = sRes.data as any;
      setSettings({ ...s, data_sources: Array.isArray(s.data_sources) ? s.data_sources : ["case_risk", "entity_risk"] });
    }
    setLoading(false);
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("risk_assessment_settings")
      .update({
        low_threshold: settings.low_threshold,
        medium_threshold: settings.medium_threshold,
        ai_prompt_template: settings.ai_prompt_template,
        ai_endpoint_url: settings.ai_endpoint_url,
        ai_api_key: settings.ai_api_key,
        ai_model: settings.ai_model,
        output_language: settings.output_language,
        data_sources: settings.data_sources as any,
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

  const openAddDialog = () => {
    setEditingQuestion(null);
    setFormData({ category: "", question_text: "", description: "", max_score: 5, sort_order: questions.length, enabled: true, ai_prompt_template: "", question_type: "single_select", context_question_ids: [] });
    setAnswerOptions([]);
    setShowAddDialog(true);
  };

  const openEditDialog = async (q: Question) => {
    setEditingQuestion(q);
    setFormData({ category: q.category, question_text: q.question_text, description: q.description, max_score: q.max_score, sort_order: q.sort_order, enabled: q.enabled, ai_prompt_template: q.ai_prompt_template || "", question_type: q.question_type || "single_select", context_question_ids: Array.isArray(q.context_question_ids) ? q.context_question_ids : [] });
    
    // Load existing answer options
    const { data } = await supabase
      .from("risk_assessment_answer_options")
      .select("*")
      .eq("question_id", q.id)
      .order("sort_order");
    setAnswerOptions((data as any[]) || []);
    setShowAddDialog(true);
  };

  const addAnswerOption = () => {
    setAnswerOptions((prev) => [
      ...prev,
      { label: "", score: 0, sort_order: prev.length },
    ]);
  };

  const updateAnswerOption = (index: number, updates: Partial<AnswerOption>) => {
    setAnswerOptions((prev) => prev.map((o, i) => (i === index ? { ...o, ...updates } : o)));
  };

  const removeAnswerOption = (index: number) => {
    setAnswerOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const saveQuestion = async () => {
    if (!formData.question_text.trim()) {
      toast({ title: "Question text required", variant: "destructive" });
      return;
    }
    setSavingQuestion(true);

    // Derive max_score: for multi_select sum all scores, for single_select take highest
    const derivedMaxScore = answerOptions.length > 0
      ? (formData.question_type === "multi_select"
        ? answerOptions.reduce((sum, o) => sum + o.score, 0)
        : Math.max(...answerOptions.map((o) => o.score), 0))
      : formData.max_score;

    const questionPayload = { ...formData, max_score: derivedMaxScore };

    let questionId = editingQuestion?.id;

    if (editingQuestion) {
      const { error } = await supabase
        .from("risk_assessment_questions")
        .update({ ...questionPayload, updated_at: new Date().toISOString() })
        .eq("id", editingQuestion.id);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        setSavingQuestion(false);
        return;
      }
    } else {
      const { data, error } = await supabase.from("risk_assessment_questions").insert(questionPayload).select().single();
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        setSavingQuestion(false);
        return;
      }
      questionId = (data as any).id;
    }

    // Save answer options: delete existing, then insert new
    if (questionId) {
      await supabase.from("risk_assessment_answer_options").delete().eq("question_id", questionId);
      if (answerOptions.length > 0) {
        const rows = answerOptions.map((o, i) => ({
          question_id: questionId!,
          label: o.label,
          score: o.score,
          sort_order: i,
        }));
        await supabase.from("risk_assessment_answer_options").insert(rows);
      }
    }

    toast({ title: editingQuestion ? "Question updated" : "Question added" });
    setSavingQuestion(false);
    setShowAddDialog(false);
    loadData();
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
            <p className="text-muted-foreground">Configure questions, scoring thresholds, AI prompts, and data sources.</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          {/* Left: Questions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Assessment Questions</h2>
              <Button onClick={openAddDialog} size="sm" className="gap-2">
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
                {questions.map((q) => (
                  <Card key={q.id} className={`transition-opacity ${!q.enabled ? "opacity-50" : ""}`}>
                    <CardContent className="flex items-center gap-3 py-3">
                      <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{q.question_text}</p>
                        <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">{q.category || "General"}</Badge>
                          <Badge variant="secondary" className="text-xs">{q.question_type === "multi_select" ? "Multi" : "Single"}</Badge>
                          <Badge variant="secondary" className="text-xs">Max: {q.max_score}</Badge>
                        </div>
                      </div>
                      <Switch checked={q.enabled} onCheckedChange={(v) => toggleQuestion(q.id, v)} />
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(q)}>
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
            {/* Thresholds */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Risk Thresholds</CardTitle>
                <CardDescription>Define score percentage thresholds for risk levels.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm">Low → Medium (%)</Label>
                    <Input
                      type="number"
                      value={settings?.low_threshold ?? 30}
                      onChange={(e) => settings && setSettings({ ...settings, low_threshold: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Medium → High (%)</Label>
                    <Input
                      type="number"
                      value={settings?.medium_threshold ?? 60}
                      onChange={(e) => settings && setSettings({ ...settings, medium_threshold: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline" className="text-xs text-green-600">0 – {settings?.low_threshold ?? 30}% Low</Badge>
                  <Badge variant="outline" className="text-xs text-yellow-600">{settings?.low_threshold ?? 30} – {settings?.medium_threshold ?? 60}% Medium</Badge>
                  <Badge variant="outline" className="text-xs text-red-600">{settings?.medium_threshold ?? 60} – 100% High</Badge>
                </div>
              </CardContent>
            </Card>

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
                <CardDescription>Configure the AI model used for generating risk summaries.</CardDescription>
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
                      value={settings?.ai_model || "llama3.1:latest"}
                      onValueChange={(v) => settings && setSettings({ ...settings, ai_model: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="llama3.1:latest">llama3.1:latest</SelectItem>
                        <SelectItem value="mistral-nemo:latest">mistral-nemo:latest</SelectItem>
                        <SelectItem value="gemma2:9b">gemma2:9b</SelectItem>
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
- Do NOT repeat the question, score, or selected answer back.
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
Current Score: [score] / [max_score]

**IMPORTANT — You MUST follow these additional instructions:**
[question-specific AI instructions if any]

Provide only your professional risk analysis.

--- Factual Context (use ONLY this data) ---
Question: [question text]
Background: [internal support text]
Selected Answer: [selected answer]
Score: [score] / [max_score]
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

      {/* Add/Edit Question Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingQuestion ? "Edit Question" : "Add Question"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={formData.category} onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))} placeholder="e.g. KYC, PEP, Sanctions" />
            </div>
            <div className="space-y-2">
              <Label>Question Text</Label>
              <Input value={formData.question_text} onChange={(e) => setFormData((p) => ({ ...p, question_text: e.target.value }))} placeholder="e.g. What is the PEP exposure level?" />
            </div>
            <div className="space-y-2">
              <Label>Internal Support Text</Label>
              <Textarea value={formData.description} onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))} placeholder="Help text for the assessor..." className="h-16" />
            </div>
            <div className="space-y-2">
              <Label>Answer Type</Label>
              <Select value={formData.question_type} onValueChange={(v) => setFormData((p) => ({ ...p, question_type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single_select">Single Select</SelectItem>
                  <SelectItem value="multi_select">Multi Select</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {answerOptions.length === 0 && (
              <div className="space-y-2">
                <Label>Max Score (manual)</Label>
                <Input type="number" value={formData.max_score} onChange={(e) => setFormData((p) => ({ ...p, max_score: Number(e.target.value) }))} min={1} max={100} />
                <p className="text-xs text-muted-foreground">Used as fallback slider if no answer options are defined.</p>
              </div>
            )}

            {/* Answer Options */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-semibold">Answer Options</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Define selectable answers. Each has a label (shown to user) and a hidden risk score.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={addAnswerOption} className="gap-1">
                  <Plus className="h-3.5 w-3.5" /> Add Option
                </Button>
              </div>

              {answerOptions.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  No answer options defined. Users will see a slider (0 to max score) instead.
                  {formData.question_type === "multi_select" && (
                    <p className="mt-1 text-xs font-medium text-primary">Multi-select: the score will be the sum of all selected options.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {answerOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md border p-2">
                      <span className="text-xs text-muted-foreground w-5 text-center">{i + 1}</span>
                      <Input
                        className="flex-1"
                        placeholder="Answer label (e.g. 'Low risk - no PEP exposure')"
                        value={opt.label}
                        onChange={(e) => updateAnswerOption(i, { label: e.target.value })}
                      />
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Label className="text-xs text-muted-foreground">Score:</Label>
                        <Input
                          type="number"
                          className="w-20"
                          value={opt.score}
                          onChange={(e) => updateAnswerOption(i, { score: Number(e.target.value) })}
                          min={0}
                        />
                      </div>
                      <Button variant="ghost" size="icon" className="shrink-0" onClick={() => removeAnswerOption(i)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    {formData.question_type === "multi_select"
                      ? `Max score (sum of all options): ${answerOptions.reduce((s, o) => s + o.score, 0)}`
                      : `Max score (highest option): ${Math.max(...answerOptions.map(o => o.score), 0)}`}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Question-Specific AI Instructions</Label>
              <Textarea
                value={formData.ai_prompt_template}
                onChange={(e) => setFormData((p) => ({ ...p, ai_prompt_template: e.target.value }))}
                placeholder="e.g. Pay special attention to indirect PEP connections. Consider both domestic and foreign exposure..."
                className="h-24 font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Optional. Appended to the global system prompt as additional instructions specific to this question.
              </p>
            </div>

            {/* Context from other questions */}
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-semibold">Include Context from Other Questions</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When generating AI notes for this question, include answers and notes from the selected earlier questions as additional context.
                </p>
              </div>
              {(() => {
                const currentSortOrder = editingQuestion ? editingQuestion.sort_order : formData.sort_order;
                const earlierQuestions = questions.filter((q) => q.id !== editingQuestion?.id && q.enabled && q.sort_order < currentSortOrder);
                if (earlierQuestions.length === 0) {
                  return (
                    <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                      No earlier questions available. Only questions that come before this one in sort order can be selected.
                    </div>
                  );
                }
                return (
                  <div className="space-y-2 max-h-48 overflow-y-auto rounded-md border p-3">
                    {earlierQuestions.map((q) => (
                      <label key={q.id} className="flex items-start gap-3 cursor-pointer">
                        <Checkbox
                          checked={formData.context_question_ids.includes(q.id)}
                          onCheckedChange={(checked) => {
                            setFormData((p) => ({
                              ...p,
                              context_question_ids: checked
                                ? [...p.context_question_ids, q.id]
                                : p.context_question_ids.filter((id) => id !== q.id),
                            }));
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm">{q.question_text}</span>
                          <Badge variant="outline" className="ml-2 text-xs">{q.category || "General"}</Badge>
                        </div>
                      </label>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={saveQuestion} disabled={savingQuestion}>
              {savingQuestion && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingQuestion ? "Save Changes" : "Add Question"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
