import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Save, X, ArrowLeft, Pencil } from "lucide-react";

type AnswerOption = {
  id?: string;
  question_id?: string;
  label: string;
  score: number;
  sort_order: number;
  requires_followup?: boolean;
  followup_label?: string;
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

export default function RiskAssessmentQuestionEdit() {
  const navigate = useNavigate();
  const { questionId } = useParams<{ questionId: string }>();
  const isNew = !questionId || questionId === "new";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
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
    score_aggregation: "none" as "none" | "sum" | "average" | "max",
  });
  const [answerOptions, setAnswerOptions] = useState<AnswerOption[]>([]);

  useEffect(() => {
    (async () => {
      const { data: questions } = await supabase
        .from("risk_assessment_questions")
        .select("*")
        .order("sort_order");
      const list = ((questions as any[]) || []) as Question[];
      setAllQuestions(list);

      if (!isNew) {
        const q = list.find((x) => x.id === questionId);
        if (q) {
          setEditingQuestion(q);
          setFormData({
            category: q.category,
            question_text: q.question_text,
            description: q.description,
            max_score: q.max_score,
            sort_order: q.sort_order,
            enabled: q.enabled,
            ai_prompt_template: q.ai_prompt_template || "",
            question_type: q.question_type || "single_select",
            context_question_ids: Array.isArray(q.context_question_ids) ? q.context_question_ids : [],
          });
          const { data: opts } = await supabase
            .from("risk_assessment_answer_options")
            .select("*")
            .eq("question_id", q.id)
            .order("sort_order");
          setAnswerOptions((opts as any[]) || []);
        }
      } else {
        setFormData((p) => ({ ...p, sort_order: list.length }));
      }
      setLoading(false);
    })();
  }, [questionId, isNew]);

  const addAnswerOption = () => {
    setAnswerOptions((prev) => [...prev, { label: "", score: 0, sort_order: prev.length, requires_followup: false, followup_label: "" }]);
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
    setSaving(true);

    const derivedMaxScore = answerOptions.length > 0
      ? (formData.question_type === "multi_select"
        ? answerOptions.reduce((sum, o) => sum + o.score, 0)
        : Math.max(...answerOptions.map((o) => o.score), 0))
      : formData.max_score;

    const questionPayload = { ...formData, max_score: derivedMaxScore };

    let qId = editingQuestion?.id;

    if (editingQuestion) {
      const { error } = await supabase
        .from("risk_assessment_questions")
        .update({ ...questionPayload, updated_at: new Date().toISOString() })
        .eq("id", editingQuestion.id);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("risk_assessment_questions")
        .insert(questionPayload)
        .select()
        .single();
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      qId = (data as any).id;
    }

    if (qId) {
      await supabase.from("risk_assessment_answer_options").delete().eq("question_id", qId);
      if (answerOptions.length > 0) {
        const rows = answerOptions.map((o, i) => ({
          question_id: qId!,
          label: o.label,
          score: o.score,
          sort_order: i,
          requires_followup: !!o.requires_followup,
          followup_label: o.followup_label || "",
        }));
        await supabase.from("risk_assessment_answer_options").insert(rows);
      }
    }

    toast({ title: editingQuestion ? "Question updated" : "Question added" });
    setSaving(false);
    navigate("/risk-assessment/admin");
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

  const otherQuestions = allQuestions.filter(
    (q) => q.id !== editingQuestion?.id && q.enabled
  );

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/risk-assessment/admin")} aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
              <Pencil className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                {isNew ? "Add Question" : "Edit Question"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isNew ? "Create a new assessment question." : "Update this assessment question."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/risk-assessment/admin")}>Cancel</Button>
            <Button onClick={saveQuestion} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingQuestion ? "Save Changes" : "Add Question"}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Question</CardTitle>
                <CardDescription>The question shown to the assessor.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                  <Textarea value={formData.description} onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))} placeholder="Help text for the assessor..." className="h-20" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Answer Options</CardTitle>
                <CardDescription>
                  Define selectable answers. Each has a label (shown to user) and a hidden risk score.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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

                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Options</Label>
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
                      <div key={i} className="rounded-md border p-2 space-y-2">
                        <div className="flex items-center gap-2">
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
                        <div className="flex items-start gap-2 pl-7">
                          <label className="flex items-center gap-2 cursor-pointer shrink-0 pt-2">
                            <Checkbox
                              checked={!!opt.requires_followup}
                              onCheckedChange={(checked) =>
                                updateAnswerOption(i, { requires_followup: !!checked })
                              }
                            />
                            <span className="text-xs text-muted-foreground">Requires follow-up text</span>
                          </label>
                          {opt.requires_followup && (
                            <Input
                              className="flex-1"
                              placeholder="Follow-up prompt (e.g. 'Please describe...')"
                              value={opt.followup_label || ""}
                              onChange={(e) => updateAnswerOption(i, { followup_label: e.target.value })}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">
                      {formData.question_type === "multi_select"
                        ? `Max score (sum of all options): ${answerOptions.reduce((s, o) => s + o.score, 0)}`
                        : `Max score (highest option): ${Math.max(...answerOptions.map((o) => o.score), 0)}`}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Question-Specific AI Instructions</CardTitle>
                <CardDescription>
                  Optional. Appended to the global system prompt as additional instructions specific to this question.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={formData.ai_prompt_template}
                  onChange={(e) => setFormData((p) => ({ ...p, ai_prompt_template: e.target.value }))}
                  placeholder="e.g. Pay special attention to indirect PEP connections. Consider both domestic and foreign exposure..."
                  className="h-32 font-mono text-xs"
                />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Enabled</Label>
                  <Switch checked={formData.enabled} onCheckedChange={(v) => setFormData((p) => ({ ...p, enabled: v }))} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Context from Other Questions</CardTitle>
                <CardDescription>
                  Include answers and notes from any other question when generating AI notes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {otherQuestions.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No other questions available.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                    {otherQuestions.map((q) => (
                      <label key={q.id} className="flex items-start gap-3 cursor-pointer rounded-md border p-2 hover:bg-muted/40">
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
                          <span className="text-sm">
                            <span className="text-muted-foreground mr-1">#{allQuestions.findIndex((aq) => aq.id === q.id) + 1}</span>
                            {q.question_text}
                          </span>
                          <div className="mt-1">
                            <Badge variant="outline" className="text-xs">{q.category || "General"}</Badge>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
