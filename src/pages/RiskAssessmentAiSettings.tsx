import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Cpu, Loader2, Save, ArrowLeft } from "lucide-react";

const MODELS = ["gemma2:9b", "glm-4.7-flash:latest", "qwen3:14b", "gemma3:12b"];
const DEFAULT_MODEL = "gemma2:9b";

type Settings = {
  id: string;
  ai_model: string;
  ai_prompt_template: string;
};

type Question = {
  id: string;
  question_text: string;
  category: string;
  sort_order: number;
  ai_model: string;
};

export default function RiskAssessmentAiSettings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [s, q] = await Promise.all([
        supabase.from("risk_assessment_settings").select("id,ai_model,ai_prompt_template").limit(1).maybeSingle(),
        supabase.from("risk_assessment_questions").select("id,question_text,category,sort_order,ai_model").order("sort_order"),
      ]);
      if (s.data) setSettings(s.data as any);
      setQuestions((q.data as any) || []);
      setLoading(false);
    })();
  }, []);

  const saveAll = async () => {
    if (!settings) return;
    setSaving(true);
    const { error: sErr } = await supabase
      .from("risk_assessment_settings")
      .update({
        ai_model: settings.ai_model,
        ai_prompt_template: settings.ai_prompt_template,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settings.id);

    const updates = await Promise.all(
      questions.map((q) =>
        supabase.from("risk_assessment_questions").update({ ai_model: q.ai_model || "" }).eq("id", q.id),
      ),
    );
    setSaving(false);
    const firstErr = sErr || updates.find((r) => r.error)?.error;
    if (firstErr) {
      toast({ title: "Error saving", description: firstErr.message, variant: "destructive" });
    } else {
      toast({ title: "AI settings saved" });
    }
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
      <div className="space-y-8 max-w-4xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                AI Settings
              </h1>
              <p className="text-muted-foreground">Configure the model and global system prompt used for risk assessment.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/risk-assessment/admin")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Admin
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Default Model</CardTitle>
            <CardDescription>Used for every question unless a question-specific override is set below.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 max-w-sm">
              <Label className="text-sm">Model</Label>
              <Select
                value={settings?.ai_model || DEFAULT_MODEL}
                onValueChange={(v) => settings && setSettings({ ...settings, ai_model: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Global System Prompt</Label>
              <Textarea
                value={settings?.ai_prompt_template ?? ""}
                onChange={(e) => settings && setSettings({ ...settings, ai_prompt_template: e.target.value })}
                placeholder="e.g. You are a senior AML/KYC compliance analyst..."
                className="h-40 font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Sets the AI persona and context. Do NOT hardcode language here — use the Output Language setting on each assessment.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per-Question Model Overrides</CardTitle>
            <CardDescription>Choose a different model for individual questions. Leave as "Default" to use the model above.</CardDescription>
          </CardHeader>
          <CardContent>
            {questions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No questions yet.</p>
            ) : (
              <div className="space-y-2">
                {questions.map((q, idx) => (
                  <div key={q.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        <span className="text-muted-foreground mr-2">#{idx + 1}</span>
                        {q.question_text}
                      </p>
                      {q.category && <p className="text-xs text-muted-foreground">{q.category}</p>}
                    </div>
                    <Select
                      value={q.ai_model || "__default__"}
                      onValueChange={(v) =>
                        setQuestions((prev) =>
                          prev.map((p) => (p.id === q.id ? { ...p, ai_model: v === "__default__" ? "" : v } : p)),
                        )
                      }
                    >
                      <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__">Default ({settings?.ai_model || DEFAULT_MODEL})</SelectItem>
                        {MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Button onClick={saveAll} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save AI Settings
        </Button>
      </div>
    </AppLayout>
  );
}
