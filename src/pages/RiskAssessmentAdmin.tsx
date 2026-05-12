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
import { Settings, Plus, Loader2, ChevronUp, ChevronDown, Pencil, Trash2, Cpu } from "lucide-react";

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
            <p className="text-muted-foreground">Configure questions and AI prompts.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate("/risk-assessment/admin/ai-settings")} variant="outline" className="gap-2">
            <Cpu className="h-4 w-4" /> AI Settings
          </Button>
          <Button onClick={() => navigate("/risk-assessment/admin/questions/new")} className="gap-2">
            <Plus className="h-4 w-4" /> Add Question
          </Button>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Assessment Questions</h2>

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
      </div>
    </AppLayout>
  );
}
