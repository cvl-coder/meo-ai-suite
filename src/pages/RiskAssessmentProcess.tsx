import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getMeoToken } from "@/lib/meoToken";
import { ShieldCheck, Loader2, ArrowLeft, CheckCircle2, AlertTriangle, XCircle, Sparkles, Save } from "lucide-react";
import ReactMarkdown from "react-markdown";

type AnswerOption = {
  id: string;
  question_id: string;
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
  weight: number;
  sort_order: number;
  ai_prompt_template: string;
  question_type: string;
};

type Answer = {
  question_id: string;
  score: number;
  notes: string;
  selected_option_label?: string;
  selected_option_labels?: string[];
};

const riskLevelConfig = {
  low: { label: "Low Risk", color: "text-green-600", bg: "bg-green-50 border-green-200", icon: CheckCircle2 },
  medium: { label: "Medium Risk", color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200", icon: AlertTriangle },
  high: { label: "High Risk", color: "text-red-600", bg: "bg-red-50 border-red-200", icon: XCircle },
  pending: { label: "Pending", color: "text-muted-foreground", bg: "bg-muted border-border", icon: ShieldCheck },
};

export default function RiskAssessmentProcess() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [answerOptionsByQuestion, setAnswerOptionsByQuestion] = useState<Record<string, AnswerOption[]>>({});
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showConclusion, setShowConclusion] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [streamedSummary, setStreamedSummary] = useState("");
  const [generatingNoteFor, setGeneratingNoteFor] = useState<string | null>(null);
  const [savingAnswerFor, setSavingAnswerFor] = useState<string | null>(null);
  const [savedAnswers, setSavedAnswers] = useState<Set<string>>(new Set());

  // Load questions, answer options, session, and settings
  useEffect(() => {
    (async () => {
      const [questionsRes, settingsRes, optionsRes] = await Promise.all([
        supabase.from("risk_assessment_questions").select("*").eq("enabled", true).order("sort_order"),
        supabase.from("risk_assessment_settings").select("*").limit(1).maybeSingle(),
        supabase.from("risk_assessment_answer_options").select("*").order("sort_order"),
      ]);

      setQuestions((questionsRes.data as any) || []);
      setSettings(settingsRes.data);

      // Group answer options by question_id
      const optMap: Record<string, AnswerOption[]> = {};
      ((optionsRes.data as any[]) || []).forEach((o) => {
        if (!optMap[o.question_id]) optMap[o.question_id] = [];
        optMap[o.question_id].push(o);
      });
      setAnswerOptionsByQuestion(optMap);

      if (sessionId) {
        const [sessionRes, answersRes] = await Promise.all([
          supabase.from("risk_assessment_sessions").select("*").eq("id", sessionId).single(),
          supabase.from("risk_assessment_answers").select("*").eq("session_id", sessionId),
        ]);
        if (sessionRes.data) {
          setSession(sessionRes.data);
          if ((sessionRes.data as any).status === "completed") setShowConclusion(true);
        }
        const answerMap: Record<string, Answer> = {};
        ((answersRes.data as any[]) || []).forEach((a) => {
          answerMap[a.question_id] = { question_id: a.question_id, score: a.score, notes: a.notes || "" };
        });
        
        // Reconstruct selected options from score + options
        const loadedQuestions = (questionsRes.data as any[]) || [];
        for (const qId of Object.keys(answerMap)) {
          const opts = optMap[qId];
          const q = loadedQuestions.find((qq: any) => qq.id === qId);
          if (opts?.length) {
            if (q?.question_type === "multi_select") {
              // For multi-select, find combination of options that sum to the score
              // Simple approach: try all options and find those selected
              const selectedLabels: string[] = [];
              let remaining = answerMap[qId].score;
              for (const o of [...opts].sort((a, b) => b.score - a.score)) {
                if (remaining >= o.score && o.score > 0) {
                  selectedLabels.push(o.label);
                  remaining -= o.score;
                }
              }
              answerMap[qId].selected_option_labels = selectedLabels;
              answerMap[qId].selected_option_label = selectedLabels.join(", ");
            } else {
              const matchingOpt = opts.find(o => o.score === answerMap[qId].score);
              if (matchingOpt) {
                answerMap[qId].selected_option_label = matchingOpt.label;
                answerMap[qId].selected_option_labels = [matchingOpt.label];
              }
            }
          }
        }
        
        setAnswers(answerMap);
      }

      setLoading(false);
    })();
  }, [sessionId]);

  const getAnswer = (questionId: string): Answer => {
    return answers[questionId] || { question_id: questionId, score: 0, notes: "", selected_option_label: undefined };
  };

  const updateAnswer = (questionId: string, updates: Partial<Answer>) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...getAnswer(questionId), ...updates },
    }));
  };

  const selectAnswerOption = (question: Question, option: AnswerOption) => {
    if (question.question_type === "multi_select") {
      const current = getAnswer(question.id);
      const currentLabels = current.selected_option_labels || [];
      const isSelected = currentLabels.includes(option.label);
      const newLabels = isSelected
        ? currentLabels.filter((l) => l !== option.label)
        : [...currentLabels, option.label];
      
      // Sum scores of all selected options
      const options = answerOptionsByQuestion[question.id] || [];
      const newScore = options
        .filter((o) => newLabels.includes(o.label))
        .reduce((sum, o) => sum + o.score, 0);
      
      updateAnswer(question.id, {
        score: newScore,
        selected_option_labels: newLabels,
        selected_option_label: newLabels.join(", "),
      });
    } else {
      updateAnswer(question.id, { score: option.score, selected_option_label: option.label, selected_option_labels: [option.label] });
    }
  };

  const calculateScores = useCallback(() => {
    let totalScore = 0;
    let maxPossible = 0;
    questions.forEach((q) => {
      const answer = answers[q.id];
      const score = (answer?.score || 0) * q.weight;
      totalScore += score;
      maxPossible += q.max_score * q.weight;
    });
    return { totalScore, maxPossible };
  }, [answers, questions]);

  const getRiskLevel = useCallback(
    (percentage: number): string => {
      const low = settings?.low_threshold ?? 30;
      const medium = settings?.medium_threshold ?? 60;
      if (percentage <= low) return "low";
      if (percentage <= medium) return "medium";
      return "high";
    },
    [settings]
  );

  const generateNoteForQuestion = async (question: Question) => {
    setGeneratingNoteFor(question.id);
    try {
      const currentAnswer = getAnswer(question.id);
      const outputLang = settings?.output_language || "English";
      const selectedLabel = currentAnswer.selected_option_label || "(no selection)";

      const systemMessage =
        `You are a risk assessment analyst. You write concise, professional risk analysis notes (2-4 sentences). ` +
        `Do NOT repeat or echo the input data, scores, or question text back. Just provide your analysis. ` +
        `IMPORTANT: Always write your response in ${outputLang}.`;

      const questionDescription = question.description || "";

      const defaultUserPrompt =
        `Write a concise risk analysis note for this question:\n\n` +
        `Question: {{question}}\n` +
        (questionDescription ? `Background: {{description}}\n` : ``) +
        `Selected Answer: {{selected_answer}}\nCurrent Score: {{score}} / {{max_score}}\n\n` +
        `Provide only your professional risk analysis.`;

      let userPrompt = (question.ai_prompt_template || defaultUserPrompt)
        .replace(/\{\{question\}\}/g, question.question_text)
        .replace(/\{\{description\}\}/g, questionDescription)
        .replace(/\{\{score\}\}/g, String(currentAnswer.score))
        .replace(/\{\{max_score\}\}/g, String(question.max_score))
        .replace(/\{\{selected_answer\}\}/g, selectedLabel)
        .replace(/\{\{all_answers\}\}/g, "");

      // Always append factual context so the AI never hallucinates
      const factBlock = `\n\n--- Factual Context (use ONLY this data) ---\nQuestion: ${question.question_text}` +
        (questionDescription ? `\nBackground: ${questionDescription}` : ``) +
        `\nSelected Answer: ${selectedLabel}\nScore: ${currentAnswer.score} / ${question.max_score}\nNotes: ${currentAnswer.notes || "(none)"}`;
      userPrompt += factBlock;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const authSession = (await supabase.auth.getSession()).data.session;

      const provider = "custom";
      const response = await fetch(`${supabaseUrl}/functions/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${authSession?.access_token || supabaseKey}`,
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: userPrompt },
          ],
          model: settings?.ai_model || "llama3.1:latest",
          provider,
          custom_endpoint: settings?.ai_endpoint_url || "http://core.meo.io/v1",
          custom_api_key: settings?.ai_api_key || "",
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI error (${response.status}): ${errText.substring(0, 200)}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer = "", fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data: ")) continue;
          const d = t.slice(6);
          if (d === "[DONE]") continue;
          try {
            const p = JSON.parse(d);
            const delta = p.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              updateAnswer(question.id, { notes: fullText });
            }
          } catch {}
        }
      }
    } catch (err: any) {
      toast({ title: "Error generating note", description: err.message, variant: "destructive" });
    }
    setGeneratingNoteFor(null);
  };

  const generateAiSummary = async () => {
    if (!session?.id) return;
    const meoToken = getMeoToken();
    const customerId = session.customer_id || localStorage.getItem("selectedCustomerId") || "";
    const caseId = session.case_id || localStorage.getItem(`meo_case_id:${customerId}`) || "";

    setGeneratingSummary(true);
    setStreamedSummary("");

    try {
      let caseRiskData: any = null;
      if (meoToken && customerId && caseId) {
        try {
          const { data, error } = await supabase.functions.invoke("meo-api-test", {
            body: { action: "getRiskAssessments", payload: { caseId, customerId, personToken: meoToken, page: 1, limit: 100, orderColumn: "createdAt", orderDirection: "desc" } },
          });
          if (!error && data && !data.error) caseRiskData = data;
        } catch {}
      }

      const answersContext = questions.map((q) => {
        const a = getAnswer(q.id);
        return {
          question: q.question_text,
          category: q.category,
          selectedAnswer: a.selected_option_label || `Score ${a.score}`,
          score: a.score,
          maxScore: q.max_score,
          weight: q.weight,
          weightedScore: a.score * q.weight,
          maxWeightedScore: q.max_score * q.weight,
          notes: a.notes || "",
        };
      });

      const { totalScore: ts, maxPossible: mp } = calculateScores();
      const pct = mp > 0 ? (ts / mp) * 100 : 0;

      const summaryLang = settings?.output_language || "English";
      const promptTemplate = settings?.ai_prompt_template ||
        "You are a risk assessment analyst. Analyze the following risk assessment data and provide a comprehensive summary.\n\n" +
        "## Internal Risk Assessment Scores\n{{scored_answers}}\n\n" +
        "## Overall Result\nTotal Score: {{total_score}} / {{max_score}} ({{percentage}}%)\nRisk Level: {{risk_level}}\n\n" +
        "{{case_risk_section}}" +
        `Provide a clear summary of the risk factors, highlighting the most significant findings and recommendations. IMPORTANT: Write your entire response in ${summaryLang}.`;

      const caseRiskSection = caseRiskData
        ? `## Case Risk Assessment Data (from MEO)\n${JSON.stringify(caseRiskData, null, 2)}\n\n`
        : "";

      const prompt = promptTemplate
        .replace("{{scored_answers}}", JSON.stringify(answersContext, null, 2))
        .replace("{{total_score}}", ts.toFixed(1))
        .replace("{{max_score}}", mp.toFixed(1))
        .replace("{{percentage}}", pct.toFixed(0))
        .replace("{{risk_level}}", getRiskLevel(pct))
        .replace("{{case_risk_section}}", caseRiskSection)
        .replace("{{risk_text}}", caseRiskData ? JSON.stringify(caseRiskData, null, 2) : "No case risk data available");

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const authSession = (await supabase.auth.getSession()).data.session;

      const provider = "custom";
      const response = await fetch(`${supabaseUrl}/functions/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${authSession?.access_token || supabaseKey}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          model: settings?.ai_model || "llama3.1:latest",
          provider,
          custom_endpoint: settings?.ai_endpoint_url || "http://core.meo.io/v1",
          custom_api_key: settings?.ai_api_key || "",
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI error (${response.status}): ${errText.substring(0, 200)}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer = "", fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data: ")) continue;
          const d = t.slice(6);
          if (d === "[DONE]") continue;
          try {
            const p = JSON.parse(d);
            const delta = p.choices?.[0]?.delta?.content;
            if (delta) { fullText += delta; setStreamedSummary(fullText); }
          } catch {}
        }
      }

      if (fullText) {
        await supabase
          .from("risk_assessment_sessions")
          .update({ ai_summary: fullText })
          .eq("id", session.id);
        setSession((prev: any) => ({ ...prev, ai_summary: fullText }));
        toast({ title: "AI summary generated" });
      }
    } catch (err: any) {
      toast({ title: "Error generating summary", description: err.message, variant: "destructive" });
    }
    setGeneratingSummary(false);
  };

  const saveAnswer = async (questionId: string) => {
    setSavingAnswerFor(questionId);
    try {
      const answer = getAnswer(questionId);
      let currentSessionId = sessionId;

      // Create session if it doesn't exist yet
      if (!currentSessionId) {
        const { totalScore, maxPossible } = calculateScores();
        const percentage = maxPossible > 0 ? (totalScore / maxPossible) * 100 : 0;
        const riskLevel = getRiskLevel(percentage);

        const { data: newSession, error } = await supabase
          .from("risk_assessment_sessions")
          .insert({
            customer_id: localStorage.getItem("selectedCustomerId") || "",
            case_id: localStorage.getItem(`meo_case_id:${localStorage.getItem("selectedCustomerId")}`) || "",
            total_score: totalScore,
            max_possible_score: maxPossible,
            risk_level: riskLevel,
            status: "in_progress",
          })
          .select()
          .single();

        if (error) throw error;
        currentSessionId = (newSession as any).id;
        setSession(newSession);
        navigate(`/risk-assessment/process/${currentSessionId}`, { replace: true });
      }

      // Upsert the single answer
      await supabase.from("risk_assessment_answers").delete()
        .eq("session_id", currentSessionId!)
        .eq("question_id", questionId);

      await supabase.from("risk_assessment_answers").insert({
        session_id: currentSessionId!,
        question_id: questionId,
        score: answer.score,
        notes: answer.notes,
      });

      setSavedAnswers((prev) => new Set(prev).add(questionId));
      toast({ title: "Answer saved" });
    } catch (err: any) {
      toast({ title: "Error saving answer", description: err.message, variant: "destructive" });
    }
    setSavingAnswerFor(null);
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const { totalScore, maxPossible } = calculateScores();
      const percentage = maxPossible > 0 ? (totalScore / maxPossible) * 100 : 0;
      const riskLevel = getRiskLevel(percentage);

      let currentSessionId = sessionId;

      if (!currentSessionId) {
        const { data: newSession, error } = await supabase
          .from("risk_assessment_sessions")
          .insert({
            customer_id: localStorage.getItem("selectedCustomerId") || "",
            case_id: localStorage.getItem(`meo_case_id:${localStorage.getItem("selectedCustomerId")}`) || "",
            total_score: totalScore,
            max_possible_score: maxPossible,
            risk_level: riskLevel,
            status: "completed",
          })
          .select()
          .single();

        if (error) throw error;
        currentSessionId = (newSession as any).id;
        setSession(newSession);
      } else {
        await supabase
          .from("risk_assessment_sessions")
          .update({ total_score: totalScore, max_possible_score: maxPossible, risk_level: riskLevel, status: "completed", updated_at: new Date().toISOString() })
          .eq("id", currentSessionId);
      }

      const answerRows = Object.values(answers).map((a) => ({
        session_id: currentSessionId!,
        question_id: a.question_id,
        score: a.score,
        notes: a.notes,
      }));

      if (answerRows.length > 0) {
        await supabase.from("risk_assessment_answers").delete().eq("session_id", currentSessionId!);
        await supabase.from("risk_assessment_answers").insert(answerRows);
      }

      setShowConclusion(true);
      toast({ title: "Assessment saved" });

      if (!sessionId) {
        navigate(`/risk-assessment/process/${currentSessionId}`, { replace: true });
      }
    } catch (err: any) {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    }
    setSaving(false);
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

  const { totalScore, maxPossible } = calculateScores();
  const percentage = maxPossible > 0 ? (totalScore / maxPossible) * 100 : 0;
  const riskLevel = getRiskLevel(percentage);
  const rlConfig = riskLevelConfig[riskLevel as keyof typeof riskLevelConfig] || riskLevelConfig.pending;
  const RiskIcon = rlConfig.icon;

  const categories = Array.from(new Set(questions.map((q) => q.category || "General")));

  if (showConclusion) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-3xl space-y-8">
          <Button variant="ghost" onClick={() => navigate("/risk-assessment")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Risk Assessment
          </Button>

          <div className="text-center space-y-4">
            <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              Assessment Conclusion
            </h1>

            <Card className={`border-2 ${rlConfig.bg}`}>
              <CardContent className="py-10 flex flex-col items-center gap-4">
                <RiskIcon className={`h-16 w-16 ${rlConfig.color}`} />
                <div className="text-center">
                  <p className={`text-4xl font-bold ${rlConfig.color}`}>{rlConfig.label}</p>
                  <p className="text-lg text-muted-foreground mt-2">
                    Score: {totalScore.toFixed(1)} / {maxPossible.toFixed(1)} ({percentage.toFixed(0)}%)
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Score Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {questions.map((q) => {
                const a = getAnswer(q.id);
                const weighted = a.score * q.weight;
                const qMax = q.max_score * q.weight;
                return (
                  <div key={q.id} className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{q.question_text}</p>
                      {a.selected_option_label && (
                        <p className="text-xs text-muted-foreground mt-0.5">Answer: {a.selected_option_label}</p>
                      )}
                      {a.notes && <p className="text-xs text-muted-foreground mt-1 truncate">{a.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Badge variant={a.score === 0 ? "secondary" : a.score >= q.max_score * 0.7 ? "destructive" : "default"}>
                        {weighted.toFixed(1)} / {qMax.toFixed(1)}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">AI Summary</CardTitle>
                <Button
                  size="sm"
                  onClick={generateAiSummary}
                  disabled={generatingSummary}
                  className="gap-2"
                >
                  {generatingSummary ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {generatingSummary ? "Generating..." : session?.ai_summary ? "Regenerate" : "Generate Summary"}
                </Button>
              </div>
              <CardDescription>
                Uses your scored answers combined with the case risk assessment data from MEO.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(generatingSummary && streamedSummary) || session?.ai_summary ? (
                <div className="prose prose-sm max-w-none text-foreground">
                  <ReactMarkdown>{generatingSummary ? streamedSummary : session.ai_summary}</ReactMarkdown>
                </div>
              ) : !generatingSummary ? (
                <p className="text-sm text-muted-foreground">Click "Generate Summary" to create an AI-powered analysis of this assessment combined with case risk data.</p>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Fetching case risk data and generating summary...
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setShowConclusion(false); }}>
              Edit Answers
            </Button>
            <Button variant="outline" onClick={() => navigate("/risk-assessment")}>
              Back to Overview
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/risk-assessment")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <Badge variant="outline" className="text-sm">
            Score: {totalScore.toFixed(1)} / {maxPossible.toFixed(1)} ({percentage.toFixed(0)}%)
          </Badge>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Risk Assessment
          </h1>
          <p className="text-muted-foreground">Answer each question by selecting the most appropriate option.</p>
        </div>

        {questions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No questions configured. Go to the admin page to add questions.
            </CardContent>
          </Card>
        ) : (
          <>
            {categories.map((cat) => {
              const catQuestions = questions.filter((q) => (q.category || "General") === cat);
              return (
                <div key={cat} className="space-y-4">
                  <h2 className="text-lg font-semibold border-b pb-2">{cat}</h2>
                  {catQuestions.map((q) => {
                    const answer = getAnswer(q.id);
                    const options = answerOptionsByQuestion[q.id] || [];
                    const hasOptions = options.length > 0;

                    return (
                      <Card key={q.id}>
                        <CardContent className="pt-6 space-y-4">
                          <div className="space-y-1">
                            <Label className="text-sm font-medium">{q.question_text}</Label>
                          </div>

                          {hasOptions ? (
                            /* Answer option buttons — score is hidden from user */
                            <div className="grid gap-2">
                              {options.map((opt) => {
                                const isMulti = q.question_type === "multi_select";
                                const isSelected = isMulti
                                  ? (answer.selected_option_labels || []).includes(opt.label)
                                  : answer.selected_option_label === opt.label;
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => selectAnswerOption(q, opt)}
                                    className={`w-full text-left rounded-lg border-2 px-4 py-3 text-sm transition-colors flex items-center gap-3 ${
                                      isSelected
                                        ? "border-primary bg-primary/5 font-medium"
                                        : "border-border hover:border-primary/40 hover:bg-muted/50"
                                    }`}
                                  >
                                    {isMulti && (
                                      <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"}`}>
                                        {isSelected && <span className="text-[10px]">✓</span>}
                                      </span>
                                    )}
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            /* Fallback slider for questions without predefined options */
                            <>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Score</span>
                                <Badge variant="outline" className="text-xs font-mono">
                                  {answer.score} / {q.max_score}
                                </Badge>
                              </div>
                              <Slider
                                value={[answer.score]}
                                min={0}
                                max={q.max_score}
                                step={1}
                                onValueChange={([val]) => updateAnswer(q.id, { score: val })}
                              />
                            </>
                          )}

                          <div className="flex items-center gap-2">
                            <Textarea
                              placeholder="Notes (optional)..."
                              value={answer.notes}
                              onChange={(e) => updateAnswer(q.id, { notes: e.target.value })}
                              className="h-16 text-sm flex-1"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="shrink-0 self-start mt-0.5"
                              disabled={generatingNoteFor === q.id}
                              onClick={() => generateNoteForQuestion(q)}
                              title="Generate AI note for this question"
                            >
                              {generatingNoteFor === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              );
            })}

            <div className="sticky bottom-4 z-10">
              <Card className="border-primary/30 shadow-lg">
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <RiskIcon className={`h-5 w-5 ${rlConfig.color}`} />
                    <span className={`font-medium ${rlConfig.color}`}>{rlConfig.label}</span>
                    <span className="text-sm text-muted-foreground">
                      ({percentage.toFixed(0)}%)
                    </span>
                  </div>
                  <Button onClick={handleSubmit} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {saving ? "Saving..." : "Complete Assessment"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
