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
import { ShieldCheck, Loader2, ArrowLeft, CheckCircle2, AlertTriangle, XCircle, Sparkles, Save, Eye, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type DebugPrompt = { system: string; user: string; model: string; endpoint: string; ts: string };

type AnswerOption = {
  id: string;
  question_id: string;
  label: string;
  score: number;
  sort_order: number;
  requires_followup?: boolean;
  followup_label?: string;
};

type CaseDataFields = {
  main_company_entity_id?: string | null;
  fields?: Partial<Record<"main_company" | "affiliated_companies" | "individuals" | "case_risk" | "entity_risk" | "custom_properties" | "documents", string[]>>;
};

type Question = {
  id: string;
  category: string;
  question_text: string;
  description: string;
  max_score: number;
  sort_order: number;
  ai_prompt_template: string;
  question_type: string;
  context_question_ids: string[];
  case_data_sources?: string[];
  case_data_fields?: CaseDataFields | null;
  score_aggregation?: "none" | "sum" | "average" | "max";
};

type Answer = {
  question_id: string;
  score: number;
  notes: string;
  followup_text?: string;
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
  const [caseDataCache, setCaseDataCache] = useState<Record<string, any>>({});
  const [lastPromptByQuestion, setLastPromptByQuestion] = useState<Record<string, DebugPrompt>>({});
  const [lastSummaryPrompt, setLastSummaryPrompt] = useState<DebugPrompt | null>(null);
  const [debugPromptOpen, setDebugPromptOpen] = useState<DebugPrompt | null>(null);

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
          answerMap[a.question_id] = { question_id: a.question_id, score: a.score, notes: a.notes || "", followup_text: a.followup_text || "" };
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
    return answers[questionId] || { question_id: questionId, score: 0, notes: "", followup_text: "", selected_option_label: undefined };
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
      if (q.question_type === "summary") {
        if (!q.score_aggregation || q.score_aggregation === "none") return; // narrative-only, skip
        // Compute live so totals stay correct even before "Generate" is clicked
        const sourceIds: string[] = Array.isArray(q.context_question_ids) ? q.context_question_ids : [];
        const sources = sourceIds
          .map((sid) => ({ q: questions.find((qq) => qq.id === sid), a: answers[sid] }))
          .filter((s): s is { q: Question; a: Answer } => !!s.q);
        if (sources.length === 0) return;
        if (q.score_aggregation === "sum") {
          totalScore += sources.reduce((s, x) => s + (x.a?.score || 0), 0);
          maxPossible += sources.reduce((s, x) => s + (x.q.max_score || 0), 0);
        } else if (q.score_aggregation === "average") {
          const t = sources.reduce((s, x) => s + (x.a?.score || 0), 0);
          const m = sources.reduce((s, x) => s + (x.q.max_score || 0), 0);
          totalScore += Math.round(t / sources.length);
          maxPossible += Math.round(m / sources.length);
        } else if (q.score_aggregation === "max") {
          totalScore += Math.max(0, ...sources.map((x) => x.a?.score || 0));
          maxPossible += Math.max(0, ...sources.map((x) => x.q.max_score || 0));
        }
        return;
      }
      const answer = answers[q.id];
      totalScore += answer?.score || 0;
      maxPossible += q.max_score;
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

  const fetchCaseDataBlock = useCallback(async (sources: string[]): Promise<string> => {
    if (!sources || sources.length === 0) return "";
    const meoToken = getMeoToken();
    const customerId = session?.customer_id || localStorage.getItem("selectedCustomerId") || "";
    const caseId = session?.case_id || localStorage.getItem(`meo_case_id:${customerId}`) || "";
    if (!meoToken || !customerId || !caseId) return "";

    const invoke = async (action: string, payload: Record<string, any>) => {
      const cacheKey = `${action}:${JSON.stringify(payload)}`;
      if (caseDataCache[cacheKey]) return caseDataCache[cacheKey];
      const { data, error } = await supabase.functions.invoke("meo-api-test", { body: { action, payload } });
      if (error || data?.error) return null;
      setCaseDataCache((p) => ({ ...p, [cacheKey]: data }));
      return data;
    };

    const truncate = (s: string, max = 4000) => (s.length > max ? s.slice(0, max) + "\n...[truncated]" : s);
    const parts: string[] = [];

    let caseData: any = null;
    const needsCase = sources.some((s) => ["main_company", "affiliated_companies", "individuals"].includes(s));
    if (needsCase) {
      caseData = await invoke("getCase", { caseId, customerId, personToken: meoToken });
    }
    const cd = caseData?.data || caseData;

    if (sources.includes("main_company") && cd) {
      const main = (Array.isArray(cd?.affiliatedCompanies) && cd.affiliatedCompanies[0]) || null;
      if (main) {
        // Pull country from any plausible field name MEO might use
        const country =
          main.country ?? main.countryCode ?? main.country_code ?? main.nationality ??
          main.jurisdiction ?? main.registrationCountry ?? main.incorporationCountry ??
          main.address?.country ?? main.address?.countryCode ?? null;
        const name = main.name ?? main.companyName ?? main.legalName ?? main.displayName ?? null;
        const regId = main.relationsIdentifier ?? main.registrationId ?? main.registrationNumber ?? main.cvr ?? main.orgNumber ?? null;
        const summary = {
          id: main.id, name, registrationId: regId, country,
          type: main.type, role: main.role, status: main.status,
        };
        parts.push(
          `### Main company (normalized)\n${JSON.stringify(summary, null, 2)}\n` +
          `### Main company (raw, all fields from MEO)\n${truncate(JSON.stringify(main, null, 2), 3000)}`
        );
      } else {
        parts.push(`### Main company\n(no affiliated company found on case)`);
      }
    }
    if (sources.includes("affiliated_companies") && cd) {
      const list = Array.isArray(cd?.affiliatedCompanies) ? cd.affiliatedCompanies : [];
      parts.push(`### Affiliated companies (${list.length})\n${truncate(JSON.stringify(list.map((c: any) => ({
        id: c.id, name: c.name, registrationId: c.relationsIdentifier, country: c.country, role: c.role,
      })), null, 2))}`);
    }
    if (sources.includes("individuals") && cd) {
      const list = Array.isArray(cd?.individuals) ? cd.individuals : [];
      parts.push(`### Individuals on case (${list.length})\n${truncate(JSON.stringify(list.map((i: any) => ({
        id: i.id, name: i.name, role: i.role, type: i.type,
      })), null, 2))}`);
    }
    if (sources.includes("case_risk")) {
      const r = await invoke("getRiskAssessments", { caseId, customerId, personToken: meoToken, page: 1, limit: 50 });
      if (r) parts.push(`### Case-level risk assessments\n${truncate(JSON.stringify(r?.data || r, null, 2))}`);
    }
    if (sources.includes("entity_risk") && cd) {
      const main = (Array.isArray(cd?.affiliatedCompanies) && cd.affiliatedCompanies[0]) || null;
      if (main?.id) {
        const r = await invoke("getEntityRiskAssessments", { entityId: main.id, customerId, personToken: meoToken, page: 1, limit: 50 });
        if (r) parts.push(`### Risk assessments for main company\n${truncate(JSON.stringify(r?.data || r, null, 2))}`);
      }
    }
    if (sources.includes("custom_properties") && cd) {
      const main = (Array.isArray(cd?.affiliatedCompanies) && cd.affiliatedCompanies[0]) || null;
      if (main?.id) {
        const r = await invoke("getEntityCustomProperties", { entityId: main.id, customerId, personToken: meoToken, page: 1, limit: 100 });
        if (r) parts.push(`### Custom properties (main company)\n${truncate(JSON.stringify(r?.data || r, null, 2))}`);
      }
    }
    if (sources.includes("documents") && cd) {
      const main = (Array.isArray(cd?.affiliatedCompanies) && cd.affiliatedCompanies[0]) || null;
      if (main?.id) {
        const r = await invoke("getEntityUserdata", { entityId: main.id, customerId, personToken: meoToken });
        const docs = Array.isArray(r?.data) ? r.data : (Array.isArray(r) ? r : []);
        parts.push(`### Documents on main company (${docs.length})\n${truncate(JSON.stringify(docs.slice(0, 50).map((d: any) => ({
          id: d.id, name: d.name || d.filename, format: d.format, createdAt: d.createdAt,
        })), null, 2))}`);
      }
    }

    if (parts.length === 0) return "";
    return `\n\n--- Case Context (from MEO) ---\n${parts.join("\n\n")}\n--- End of case context ---\n`;
  }, [caseDataCache, session]);

  const generateNoteForQuestion = async (question: Question) => {
    setGeneratingNoteFor(question.id);
    try {
      const currentAnswer = getAnswer(question.id);
      const outputLang = settings?.output_language || "English";
      const selectedLabel = currentAnswer.selected_option_label || "(no selection)";

      // Build system prompt: strip any hardcoded language from the global template
      const rawGlobalPrompt = settings?.ai_prompt_template?.trim()
        ? settings.ai_prompt_template.trim()
        : `You are a senior AML/KYC compliance analyst writing internal risk assessment notes.`;

      // Remove lines that hardcode a language so the dropdown is the single source of truth
      const languageLinePattern = /\b(danish|dansk|english|norwegian|norsk|swedish|svenska|german|deutsch|french|français|sprog|language\s*:)\b/gi;
      const cleanedGlobalPrompt = rawGlobalPrompt
        .split("\n")
        .filter((line) => !languageLinePattern.test(line))
        .join("\n");

      const systemMessage =
        `[LANGUAGE DIRECTIVE — THIS OVERRIDES EVERYTHING]\n` +
        `You MUST write your ENTIRE response in ${outputLang}. Every single word must be in ${outputLang}.\n` +
        `Do NOT use any other language, even if the input or instructions below contain text in another language.\n` +
        `If ${outputLang} is "Danish", use proper Danish (not Norwegian or Swedish). If "English", use proper English.\n\n` +
        `${cleanedGlobalPrompt}\n\n` +
        `Rules:\n` +
        `- Write exactly 2-4 sentences of professional risk analysis.\n` +
        `- Do NOT repeat the question, score, or selected answer back.\n` +
        `- Base your analysis strictly on the provided factual context.\n` +
        `- Focus on the risk implications of the selected answer.`;

      const questionDescription = question.description || "";

      const questionSpecificInstructions = question.ai_prompt_template?.trim()
        ? `\n\n**IMPORTANT — You MUST follow these additional instructions:**\n${question.ai_prompt_template.trim()}\n`
        : ``;

      // Build context from referenced questions (numbered to match user-visible question numbers)
      const contextIds: string[] = Array.isArray(question.context_question_ids) ? question.context_question_ids : [];
      let contextBlock = "";
      if (contextIds.length > 0) {
        const contextParts = contextIds
          .map((cid) => {
            const cq = questions.find((q) => q.id === cid);
            if (!cq) return null;
            const qNumber = questions.findIndex((q) => q.id === cid) + 1;
            const ca = getAnswer(cid);
            const caLabel = ca.selected_option_label || ca.selected_option_labels?.join(", ") || `(no selection, score ${ca.score})`;
            let part = `Spørgsmål ${qNumber} / Question ${qNumber}: ${cq.question_text}\nAnswer / Svar: ${caLabel}\nScore: ${ca.score} / ${cq.max_score}`;
            if (ca.followup_text) part += `\nFollow-up details / Uddybning: ${ca.followup_text}`;
            if (ca.notes) part += `\nExisting AI Note: ${ca.notes}`;
            return part;
          })
          .filter(Boolean);
        if (contextParts.length > 0) {
          contextBlock = `\n\n--- Context from related questions / Kontekst fra relaterede spørgsmål ---\n${contextParts.join("\n\n")}\n--- End of context ---\nIMPORTANT: You MUST consider the answers from the related questions above when generating your response. If your instructions reference a specific question number (e.g. "spørgsmål 3"), use the matching numbered context above.\n`;
        }
      }

      const defaultUserPrompt =
        `Write a concise risk analysis note for this question:\n\n` +
        `Question: {{question}}\n` +
        (questionDescription ? `Background: {{description}}\n` : ``) +
        `Selected Answer: {{selected_answer}}\nCurrent Score: {{score}} / {{max_score}}\n` +
        questionSpecificInstructions +
        contextBlock +
        `\nProvide only your professional risk analysis.`;

      let userPrompt = defaultUserPrompt
        .replace(/\{\{question\}\}/g, question.question_text)
        .replace(/\{\{description\}\}/g, questionDescription)
        .replace(/\{\{score\}\}/g, String(currentAnswer.score))
        .replace(/\{\{max_score\}\}/g, String(question.max_score))
        .replace(/\{\{selected_answer\}\}/g, selectedLabel)
        .replace(/\{\{all_answers\}\}/g, "");

      // Always append factual context so the AI never hallucinates
      const factBlock = `\n\n--- Factual Context (use ONLY this data) ---\nQuestion: ${question.question_text}` +
        (questionDescription ? `\nBackground: ${questionDescription}` : ``) +
        `\nSelected Answer: ${selectedLabel}\nScore: ${currentAnswer.score} / ${question.max_score}` +
        (currentAnswer.followup_text ? `\nFollow-up details: ${currentAnswer.followup_text}` : ``) +
        `\nNotes: ${currentAnswer.notes || "(none)"}`;
      userPrompt += factBlock;

      // Inject MEO case data selected for this question
      const caseDataBlock = await fetchCaseDataBlock(Array.isArray(question.case_data_sources) ? question.case_data_sources : []);
      if (caseDataBlock) userPrompt += caseDataBlock;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const authSession = (await supabase.auth.getSession()).data.session;

      const provider = "custom";
      const endpointUrl = settings?.ai_endpoint_url || "http://core.meo.io/v1";
      const modelName = settings?.ai_model || "llama3.1:latest";
      setLastPromptByQuestion((prev) => ({
        ...prev,
        [question.id]: { system: systemMessage, user: userPrompt, model: modelName, endpoint: endpointUrl, ts: new Date().toISOString() },
      }));
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

  // Compute the aggregated score for a Summary question from its source questions' answers
  const computeSummaryScore = (q: Question): { score: number; maxScore: number } => {
    const sourceIds: string[] = Array.isArray(q.context_question_ids) ? q.context_question_ids : [];
    const sources = sourceIds
      .map((sid) => ({ q: questions.find((qq) => qq.id === sid), a: getAnswer(sid) }))
      .filter((s): s is { q: Question; a: Answer } => !!s.q);
    if (sources.length === 0) return { score: 0, maxScore: 0 };
    const agg = q.score_aggregation || "none";
    if (agg === "sum") {
      return {
        score: sources.reduce((s, x) => s + (x.a.score || 0), 0),
        maxScore: sources.reduce((s, x) => s + (x.q.max_score || 0), 0),
      };
    }
    if (agg === "average") {
      const total = sources.reduce((s, x) => s + (x.a.score || 0), 0);
      const maxTotal = sources.reduce((s, x) => s + (x.q.max_score || 0), 0);
      return { score: Math.round(total / sources.length), maxScore: Math.round(maxTotal / sources.length) };
    }
    if (agg === "max") {
      return {
        score: Math.max(0, ...sources.map((x) => x.a.score || 0)),
        maxScore: Math.max(0, ...sources.map((x) => x.q.max_score || 0)),
      };
    }
    return { score: 0, maxScore: 0 };
  };

  const generateSummaryForQuestion = async (question: Question) => {
    setGeneratingNoteFor(question.id);
    try {
      const outputLang = settings?.output_language || "English";

      const rawGlobalPrompt = settings?.ai_prompt_template?.trim()
        ? settings.ai_prompt_template.trim()
        : `You are a senior AML/KYC compliance analyst writing internal risk assessment notes.`;
      const languageLinePattern = /\b(danish|dansk|english|norwegian|norsk|swedish|svenska|german|deutsch|french|français|sprog|language\s*:)\b/gi;
      const cleanedGlobalPrompt = rawGlobalPrompt
        .split("\n")
        .filter((line) => !languageLinePattern.test(line))
        .join("\n");

      const systemMessage =
        `[LANGUAGE DIRECTIVE — THIS OVERRIDES EVERYTHING]\n` +
        `You MUST write your ENTIRE response in ${outputLang}. Every single word must be in ${outputLang}.\n` +
        `Do NOT use any other language, even if the input or instructions below contain text in another language.\n\n` +
        `${cleanedGlobalPrompt}\n\n` +
        `You are writing a SUMMARY that aggregates the answers of several earlier risk-assessment questions.\n` +
        `Rules:\n` +
        `- Base your summary strictly on the data provided below — do not invent facts.\n` +
        `- Reference the source questions by their numbers (#1, #2, ...) when relevant.\n` +
        `- Be concise, professional, and focused on risk implications.`;

      const sourceIds: string[] = Array.isArray(question.context_question_ids) ? question.context_question_ids : [];
      const sourceBlocks = sourceIds
        .map((sid, i) => {
          const sq = questions.find((qq) => qq.id === sid);
          if (!sq) return null;
          const sa = getAnswer(sid);
          const globalNum = questions.findIndex((qq) => qq.id === sid) + 1;
          const label = sa.selected_option_label || sa.selected_option_labels?.join(", ") || `(no selection)`;
          let block = `${i + 1}. [#${globalNum}] ${sq.question_text}\n   Answer: ${label}  (score ${sa.score}/${sq.max_score})`;
          if (sa.followup_text) block += `\n   Follow-up: ${sa.followup_text}`;
          if (sa.notes) block += `\n   Existing note: ${sa.notes}`;
          return block;
        })
        .filter(Boolean)
        .join("\n\n");

      const instructions = question.ai_prompt_template?.trim()
        ? `\n\nInstructions for this summary:\n${question.ai_prompt_template.trim()}`
        : ``;

      const caseDataBlock = await fetchCaseDataBlock(Array.isArray(question.case_data_sources) ? question.case_data_sources : []);

      const userPrompt =
        `Write a summary for the risk-assessment section titled: "${question.question_text}"\n` +
        (question.description ? `Background: ${question.description}\n` : ``) +
        `\n--- Source questions and their current answers ---\n${sourceBlocks || "(no source questions selected)"}\n--- End ---` +
        instructions +
        caseDataBlock +
        `\n\nWrite the summary now in ${outputLang}.`;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const authSession = (await supabase.auth.getSession()).data.session;

      const endpointUrl2 = settings?.ai_endpoint_url || "http://core.meo.io/v1";
      const modelName2 = settings?.ai_model || "llama3.1:latest";
      setLastPromptByQuestion((prev) => ({
        ...prev,
        [question.id]: { system: systemMessage, user: userPrompt, model: modelName2, endpoint: endpointUrl2, ts: new Date().toISOString() },
      }));
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
          provider: "custom",
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
              const agg = computeSummaryScore(question);
              updateAnswer(question.id, { notes: fullText, score: agg.score });
            }
          } catch {}
        }
      }
    } catch (err: any) {
      toast({ title: "Error generating summary", description: err.message, variant: "destructive" });
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
      const answersContext = questions.map((q) => {
        const a = getAnswer(q.id);
        return {
          question: q.question_text,
          category: q.category,
          internalSupportText: q.description || "",
          selectedAnswer: a.selected_option_label || a.selected_option_labels?.join(", ") || `Score ${a.score}`,
          score: a.score,
          maxScore: q.max_score,
          notes: a.notes || "",
        };
      });

      const { totalScore: ts, maxPossible: mp } = calculateScores();
      const pct = mp > 0 ? (ts / mp) * 100 : 0;

      const summaryLang = settings?.output_language || "English";
      const rawSummaryPrompt = settings?.ai_prompt_template ||
        "You are a risk assessment analyst. Analyze the following risk assessment data and provide a comprehensive summary.";
      
      const summaryLangPattern = /\b(danish|dansk|english|norwegian|norsk|swedish|svenska|german|deutsch|french|français|sprog|language\s*:)\b/gi;
      const cleanedSummaryPrompt = rawSummaryPrompt
        .split("\n")
        .filter((line) => !summaryLangPattern.test(line))
        .join("\n");

      const systemMessage =
        `[LANGUAGE DIRECTIVE — THIS OVERRIDES EVERYTHING]\n` +
        `You MUST write your ENTIRE response in ${summaryLang}. Every single word must be in ${summaryLang}.\n` +
        `Do NOT use any other language, even if the input data or notes below contain text in another language.\n` +
        `If ${summaryLang} is "Danish", use proper Danish. If "English", use proper English.\n\n` +
        `${cleanedSummaryPrompt}\n\n` +
        `Rules:\n` +
        `- Write a structured risk assessment summary in ${summaryLang}.\n` +
        `- Use Markdown formatting with clear headings.\n` +
        `- Base your analysis strictly on the provided data.\n` +
        `- Do NOT invent facts not present in the data.`;

      const userMessage =
        `Analyze the following risk assessment and provide a summary in ${summaryLang}.\n\n` +
        `## Risk Assessment Data\n\n` +
        `### Overall Result\n` +
        `Total Score: ${ts.toFixed(1)} / ${mp.toFixed(1)} (${pct.toFixed(0)}%)\n` +
        `Risk Level: ${getRiskLevel(pct)}\n\n` +
        `### Question-by-Question Breakdown\n` +
        answersContext.map((a, i) =>
          `**${i + 1}. ${a.question}** (Category: ${a.category})\n` +
          `- Selected answer: ${a.selectedAnswer}\n` +
          `- Score: ${a.score} / ${a.maxScore}\n` +
          (a.notes ? `- AI analysis / notes:\n${a.notes}\n` : "") +
          (a.internalSupportText ? `- Background context: ${a.internalSupportText}\n` : "")
        ).join("\n") +
        `\n\nBased on ALL the above data, provide a clear, structured summary covering:\n` +
        `1. Overall risk assessment conclusion\n` +
        `2. Key risk factors identified\n` +
        `3. Areas of concern or gaps\n` +
        `4. Recommended actions\n` +
        `\nREMINDER: Write ENTIRELY in ${summaryLang}.`;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const authSession = (await supabase.auth.getSession()).data.session;

      const provider = "custom";
      const endpointUrl3 = settings?.ai_endpoint_url || "http://core.meo.io/v1";
      const modelName3 = settings?.ai_model || "llama3.1:latest";
      setLastSummaryPrompt({ system: systemMessage, user: userMessage, model: modelName3, endpoint: endpointUrl3, ts: new Date().toISOString() });
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
            { role: "user", content: userMessage },
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
        followup_text: answer.followup_text || "",
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
        followup_text: a.followup_text || "",
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
              {questions.map((q, qIdx) => {
                const a = getAnswer(q.id);
                return (
                  <div key={q.id} className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        <span className="text-muted-foreground mr-2">#{qIdx + 1}</span>
                        {q.question_text}
                      </p>
                      {a.selected_option_label && (
                        <p className="text-xs text-muted-foreground mt-0.5">Answer: {a.selected_option_label}</p>
                      )}
                      {a.notes && <p className="text-xs text-muted-foreground mt-1 truncate">{a.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Badge variant={a.score === 0 ? "secondary" : a.score >= q.max_score * 0.7 ? "destructive" : "default"}>
                        {a.score} / {q.max_score}
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
                <div className="flex items-center gap-2">
                  {lastSummaryPrompt && (
                    <Button size="sm" variant="outline" onClick={() => setDebugPromptOpen(lastSummaryPrompt)} className="gap-2">
                      <Eye className="h-4 w-4" /> View prompt
                    </Button>
                  )}
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
              </div>
              <CardDescription>
                Generates a comprehensive summary based on all your scored answers, selected options, and AI-generated notes.
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
        <PromptDebugDialog prompt={debugPromptOpen} onClose={() => setDebugPromptOpen(null)} />
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
                    const globalIdx = questions.findIndex((qq) => qq.id === q.id);
                    const isSummary = q.question_type === "summary";

                    if (isSummary) {
                      const sourceIds: string[] = Array.isArray(q.context_question_ids) ? q.context_question_ids : [];
                      const sources = sourceIds
                        .map((sid) => ({ q: questions.find((qq) => qq.id === sid), a: getAnswer(sid) }))
                        .filter((s): s is { q: Question; a: Answer } => !!s.q);
                      const agg = computeSummaryScore(q);
                      const hasGenerated = !!answer.notes;

                      return (
                        <Card key={q.id} className="border-primary/30 bg-primary/[0.02]">
                          <CardContent className="pt-6 space-y-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <Badge variant="default" className="text-[10px]">SUMMARY</Badge>
                                  <Label className="text-sm font-medium">
                                    <span className="text-muted-foreground mr-2">#{globalIdx + 1}</span>
                                    {q.question_text}
                                  </Label>
                                </div>
                              </div>
                              {q.score_aggregation && q.score_aggregation !== "none" && (
                                <Badge variant="outline" className="text-xs font-mono shrink-0">
                                  {agg.score} / {agg.maxScore}
                                </Badge>
                              )}
                            </div>

                            {sources.length === 0 && !hasGenerated && (
                              <p className="text-xs text-muted-foreground italic">
                                No source questions configured. Edit this question in the admin to choose what to summarise.
                              </p>
                            )}

                            {hasGenerated && (
                              <div className="rounded-md border bg-background p-3 prose prose-sm max-w-none text-foreground">
                                <ReactMarkdown>{answer.notes}</ReactMarkdown>
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <Button
                                variant={hasGenerated ? "outline" : "default"}
                                size="sm"
                                disabled={generatingNoteFor === q.id || sources.length === 0}
                                onClick={() => generateSummaryForQuestion(q)}
                                className="gap-2"
                              >
                                {generatingNoteFor === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                {generatingNoteFor === q.id ? "Generating..." : hasGenerated ? "Regenerate Summary" : "Generate Summary"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className={savedAnswers.has(q.id) ? "text-green-600 border-green-300" : ""}
                                disabled={savingAnswerFor === q.id || !hasGenerated}
                                onClick={() => saveAnswer(q.id)}
                              >
                                {savingAnswerFor === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                <span className="ml-1.5">Save</span>
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    }

                    return (
                      <Card key={q.id}>
                        <CardContent className="pt-6 space-y-4">
                          <div className="space-y-1">
                            <Label className="text-sm font-medium">
                              <span className="text-muted-foreground mr-2">#{globalIdx + 1}</span>
                              {q.question_text}
                            </Label>
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
                                  <div key={opt.id} className="space-y-2">
                                    <button
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
                                    {isSelected && opt.requires_followup && (
                                      <div className="pl-4 space-y-1">
                                        <Label className="text-xs text-muted-foreground">
                                          {opt.followup_label || "Please provide additional details"}
                                        </Label>
                                        <Textarea
                                          value={answer.followup_text || ""}
                                          onChange={(e) => updateAnswer(q.id, { followup_text: e.target.value })}
                                          className="h-20 text-sm"
                                          placeholder="Type your answer here..."
                                        />
                                      </div>
                                    )}
                                  </div>
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
                            <Button
                              variant="outline"
                              size="icon"
                              className="shrink-0 self-start mt-0.5"
                              disabled={!lastPromptByQuestion[q.id]}
                              onClick={() => setDebugPromptOpen(lastPromptByQuestion[q.id])}
                              title={lastPromptByQuestion[q.id] ? "View last prompt sent to AI" : "Generate an AI note first"}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className={`shrink-0 self-start mt-0.5 ${savedAnswers.has(q.id) ? "text-green-600 border-green-300" : ""}`}
                              disabled={savingAnswerFor === q.id}
                              onClick={() => saveAnswer(q.id)}
                              title="Save this answer"
                            >
                              {savingAnswerFor === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
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
      <PromptDebugDialog prompt={debugPromptOpen} onClose={() => setDebugPromptOpen(null)} />
    </AppLayout>
  );
}

function PromptDebugDialog({ prompt, onClose }: { prompt: DebugPrompt | null; onClose: () => void }) {
  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast({ title: "Copied to clipboard" }),
      () => toast({ title: "Copy failed", variant: "destructive" }),
    );
  };
  return (
    <Dialog open={!!prompt} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Last prompt sent to AI</DialogTitle>
          <DialogDescription>
            {prompt && (
              <span className="text-xs">
                {new Date(prompt.ts).toLocaleString()} · model <code>{prompt.model}</code> · endpoint <code>{prompt.endpoint}</code>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        {prompt && (
          <div className="space-y-4">
            <section>
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-semibold">System message ({prompt.system.length} chars)</h4>
                <Button size="sm" variant="ghost" onClick={() => copy(prompt.system)} className="gap-1">
                  <Copy className="h-3 w-3" /> Copy
                </Button>
              </div>
              <pre className="text-xs bg-muted p-3 rounded max-h-64 overflow-auto whitespace-pre-wrap break-words">{prompt.system}</pre>
            </section>
            <section>
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-semibold">User message ({prompt.user.length} chars)</h4>
                <Button size="sm" variant="ghost" onClick={() => copy(prompt.user)} className="gap-1">
                  <Copy className="h-3 w-3" /> Copy
                </Button>
              </div>
              <pre className="text-xs bg-muted p-3 rounded max-h-[40vh] overflow-auto whitespace-pre-wrap break-words">{prompt.user}</pre>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
