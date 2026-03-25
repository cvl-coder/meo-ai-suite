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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Settings, Plus, Loader2, GripVertical, Pencil, Trash2, Save } from "lucide-react";

type Question = {
  id: string;
  category: string;
  question_text: string;
  description: string;
  max_score: number;
  weight: number;
  sort_order: number;
  enabled: boolean;
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
    weight: 1.0,
    sort_order: 0,
    enabled: true,
  });
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
    setFormData({ category: "", question_text: "", description: "", max_score: 5, weight: 1.0, sort_order: questions.length, enabled: true });
    setShowAddDialog(true);
  };

  const openEditDialog = (q: Question) => {
    setEditingQuestion(q);
    setFormData({ category: q.category, question_text: q.question_text, description: q.description, max_score: q.max_score, weight: q.weight, sort_order: q.sort_order, enabled: q.enabled });
    setShowAddDialog(true);
  };

  const saveQuestion = async () => {
    if (!formData.question_text.trim()) {
      toast({ title: "Question text required", variant: "destructive" });
      return;
    }
    setSavingQuestion(true);

    if (editingQuestion) {
      const { error } = await supabase
        .from("risk_assessment_questions")
        .update({ ...formData, updated_at: new Date().toISOString() })
        .eq("id", editingQuestion.id);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Question updated" });
      }
    } else {
      const { error } = await supabase.from("risk_assessment_questions").insert(formData);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Question added" });
      }
    }

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

  const categories = Array.from(new Set(questions.map((q) => q.category || "General")));

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
                          <Badge variant="secondary" className="text-xs">Max: {q.max_score}</Badge>
                          {q.weight !== 1 && <Badge variant="secondary" className="text-xs">×{q.weight}</Badge>}
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
                    <Input
                      value={settings?.ai_model ?? ""}
                      onChange={(e) => settings && setSettings({ ...settings, ai_model: e.target.value })}
                      placeholder="gpt-4o"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Output Language</Label>
                    <Input
                      value={settings?.output_language ?? "English"}
                      onChange={(e) => settings && setSettings({ ...settings, output_language: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Prompt Template</Label>
                  <Textarea
                    value={settings?.ai_prompt_template ?? ""}
                    onChange={(e) => settings && setSettings({ ...settings, ai_prompt_template: e.target.value })}
                    placeholder="Use {{scores}} and {{risk_text}} variables..."
                    className="h-32 font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Available: <code className="bg-muted px-1 rounded">{"{{scores}}"}</code>, <code className="bg-muted px-1 rounded">{"{{risk_text}}"}</code>, <code className="bg-muted px-1 rounded">{"{{risk_level}}"}</code>
                  </p>
                </div>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingQuestion ? "Edit Question" : "Add Question"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Question Text</Label>
              <Input value={formData.question_text} onChange={(e) => setFormData((p) => ({ ...p, question_text: e.target.value }))} placeholder="e.g. What is the PEP exposure level?" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={formData.description} onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))} placeholder="Help text for the assessor..." className="h-16" />
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={formData.category} onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))} placeholder="e.g. KYC, PEP, Sanctions" />
              </div>
              <div className="space-y-2">
                <Label>Max Score</Label>
                <Input type="number" value={formData.max_score} onChange={(e) => setFormData((p) => ({ ...p, max_score: Number(e.target.value) }))} min={1} max={100} />
              </div>
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>Weight Multiplier</Label>
                <Input type="number" step="0.1" value={formData.weight} onChange={(e) => setFormData((p) => ({ ...p, weight: Number(e.target.value) }))} min={0.1} />
              </div>
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input type="number" value={formData.sort_order} onChange={(e) => setFormData((p) => ({ ...p, sort_order: Number(e.target.value) }))} />
              </div>
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
