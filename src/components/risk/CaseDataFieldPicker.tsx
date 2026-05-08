import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMeoToken, getMeoUserId } from "@/lib/meoToken";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Loader2, RefreshCw } from "lucide-react";
import { flattenLeaves, getByPath, type Leaf } from "@/lib/flattenLeaves";

export type CaseDataFields = {
  main_company_entity_id: string | null;
  fields: {
    main_company?: string[];
    affiliated_companies?: string[];
    individuals?: string[];
    case_risk?: string[];
    entity_risk?: string[];
    custom_properties?: string[];
    documents?: string[];
  };
};

type Props = {
  value: CaseDataFields;
  onChange: (next: CaseDataFields) => void;
};

type Workspace = { id: string; name: string };
type Case = { id: string; label: string };

const SECTIONS: { key: keyof CaseDataFields["fields"]; label: string }[] = [
  { key: "main_company", label: "Main company" },
  { key: "affiliated_companies", label: "Affiliated companies" },
  { key: "individuals", label: "Individuals on case" },
  { key: "case_risk", label: "Case-level risk assessments" },
  { key: "entity_risk", label: "Entity-level risk assessments (main co.)" },
  { key: "custom_properties", label: "Custom properties (main co.)" },
  { key: "documents", label: "Documents (main co.)" },
];

const fmtVal = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.length > 80 ? v.slice(0, 80) + "…" : v;
  return String(v);
};

const getEntityId = (item: any): string => {
  const e = item?.entity || item;
  return String(e?.id || e?.entityId || item?.entityId || item?.id || item?.caseEntityId || "");
};

const getMainCompanyItem = (cd: any) => cd?.mainCompany || cd?.subject || cd?.mainEntity || cd?.caseSubject || cd?.entity || null;

const toCompanyCandidate = (item: any, source: "main" | "affiliated") => {
  if (!item) return null;
  const e = item?.entity || item;
  const id = getEntityId(item);
  if (!id || !e || typeof e !== "object") return null;
  const name = e?.name || e?.companyInformation?.name || e?.legalName || (source === "main" ? "Main company" : "(unnamed)");
  return { id, caseEntityId: item?.caseEntityId ? String(item.caseEntityId) : "", name, entity: e, source };
};

export function CaseDataFieldPicker({ value, onChange }: Props) {
  const [meoToken] = useState(() => getMeoToken() || "");
  const [meoUserId] = useState(() => getMeoUserId() || "");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [customerId, setCustomerId] = useState<string>(() => localStorage.getItem("selectedCustomerId") || "");
  const [caseId, setCaseId] = useState<string>("");
  const [loadingWs, setLoadingWs] = useState(false);
  const [loadingCases, setLoadingCases] = useState(false);
  const [loadingCase, setLoadingCase] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);

  // Raw data fetched from MEO
  const [caseObj, setCaseObj] = useState<any>(null);
  const [caseRisk, setCaseRisk] = useState<any>(null);
  const [entityRisk, setEntityRisk] = useState<any>(null);
  const [customProps, setCustomProps] = useState<any>(null);
  const [docs, setDocs] = useState<any>(null);

  const invoke = useCallback(async (action: string, payload: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke("meo-api-test", { body: { action, payload } });
    if (error || data?.error) return null;
    return data;
  }, []);

  // Load workspaces
  useEffect(() => {
    if (!meoToken || !meoUserId) return;
    (async () => {
      setLoadingWs(true);
      const data = await invoke("getAccount", { personToken: meoToken, userId: meoUserId });
      const memberships = Array.isArray(data?.result?.isAdminAt) ? data.result.isAdminAt : [];
      const ws: Workspace[] = memberships
        .filter((e: any) => e?.customerId)
        .map((e: any) => ({ id: String(e.customerId), name: e.name || String(e.customerId) }));
      setWorkspaces(ws);
      if (!customerId && ws[0]) setCustomerId(ws[0].id);
      setLoadingWs(false);
    })();
  }, [meoToken, meoUserId, invoke, customerId]);

  // Load cases when workspace changes
  useEffect(() => {
    if (!customerId || !meoToken) return;
    (async () => {
      setLoadingCases(true);
      const data = await invoke("getCases", {
        customerId, personToken: meoToken, page: 1, limit: 100,
        statuses: ["Open", "Approved", "Rejected"],
      });
      const list: Case[] = Array.isArray(data?.data)
        ? data.data.map((e: any) => ({ id: String(e.id), label: [e.title, e.externalId].filter(Boolean).join(" · ") || String(e.id) }))
        : [];
      setCases(list);
      const saved = localStorage.getItem(`meo_case_id:${customerId}`) || "";
      const next = list.find((c) => c.id === saved) || list[0];
      setCaseId(next?.id || "");
      setLoadingCases(false);
    })();
  }, [customerId, meoToken, invoke]);

  // Load full case data when caseId changes
  const loadCaseData = useCallback(async () => {
    if (!caseId || !customerId || !meoToken) return;
    setLoadingCase(true);
    setCaseObj(null); setCaseRisk(null); setEntityRisk(null); setCustomProps(null); setDocs(null);

    const c = await invoke("getCase", { caseId, customerId, personToken: meoToken });
    const cd = c?.data || c;
    setCaseObj(cd);

    const r = await invoke("getRiskAssessments", { caseId, customerId, personToken: meoToken, page: 1, limit: 50 });
    setCaseRisk(r?.data || r);

    // Resolve main entity: prefer stored selection, else the explicit mainCompany from the case. Never use affiliates as fallback.
    const explicitMain = toCompanyCandidate(getMainCompanyItem(cd), "main");
    const affiliated = Array.isArray(cd?.affiliatedCompanies) ? cd.affiliatedCompanies : [];
    const candidates = [explicitMain, ...affiliated.map((item: any) => toCompanyCandidate(item, "affiliated"))].filter(Boolean) as NonNullable<ReturnType<typeof toCompanyCandidate>>[];
    const selected = value.main_company_entity_id
      ? candidates.find((item) => item.id === value.main_company_entity_id || item.caseEntityId === value.main_company_entity_id)
      : explicitMain;
    const mainId = selected?.id || null;

    if (mainId) {
      const er = await invoke("getEntityRiskAssessments", { entityId: mainId, customerId, personToken: meoToken, page: 1, limit: 50 });
      setEntityRisk(er?.data || er);
      const cp = await invoke("getEntityCustomProperties", { entityId: mainId, customerId, personToken: meoToken, page: 1, limit: 100 });
      setCustomProps(cp?.data || cp);
      const dd = await invoke("getEntityUserdata", { entityId: mainId, customerId, personToken: meoToken });
      setDocs(dd?.data || dd);
    }
    setLoadingCase(false);
  }, [caseId, customerId, meoToken, invoke, value.main_company_entity_id]);

  useEffect(() => { void loadCaseData(); /* eslint-disable-next-line */ }, [caseId, customerId, value.main_company_entity_id]);

  const mainCompanyCandidate = useMemo(() => toCompanyCandidate(getMainCompanyItem(caseObj), "main"), [caseObj]);

  // Affiliated companies list (with entity unwrap)
  const affiliatedList = useMemo(() => {
    const arr = Array.isArray(caseObj?.affiliatedCompanies) ? caseObj.affiliatedCompanies : [];
    return arr.map((item: any) => toCompanyCandidate(item, "affiliated")).filter(Boolean) as NonNullable<ReturnType<typeof toCompanyCandidate>>[];
  }, [caseObj]);

  const companyCandidates = useMemo(() => {
    const seen = new Set<string>();
    return [mainCompanyCandidate, ...affiliatedList].filter((item): item is NonNullable<typeof mainCompanyCandidate> => {
      if (!item || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [mainCompanyCandidate, affiliatedList]);

  const mainEntity = useMemo(() => {
    if (!value.main_company_entity_id) return mainCompanyCandidate?.entity || null;
    return companyCandidates.find((a) => a.id === value.main_company_entity_id || a.caseEntityId === value.main_company_entity_id)?.entity || null;
  }, [companyCandidates, mainCompanyCandidate, value.main_company_entity_id]);

  // Compute leaves for each section against the live data
  const sectionData = useMemo(() => {
    const individualsList = Array.isArray(caseObj?.individuals) ? caseObj.individuals : [];

    return {
      main_company: { obj: mainEntity, leaves: mainEntity ? flattenLeaves(mainEntity) : [] },
      affiliated_companies: {
        obj: affiliatedList[0]?.entity || null,
        leaves: affiliatedList[0]?.entity ? flattenLeaves(affiliatedList[0].entity) : [],
        count: affiliatedList.length,
      },
      individuals: {
        obj: individualsList[0] || null,
        leaves: individualsList[0] ? flattenLeaves(individualsList[0]) : [],
        count: individualsList.length,
      },
      case_risk: {
        obj: Array.isArray(caseRisk) ? caseRisk[0] : caseRisk,
        leaves: flattenLeaves(Array.isArray(caseRisk) ? caseRisk[0] : caseRisk),
      },
      entity_risk: {
        obj: Array.isArray(entityRisk) ? entityRisk[0] : entityRisk,
        leaves: flattenLeaves(Array.isArray(entityRisk) ? entityRisk[0] : entityRisk),
      },
      custom_properties: {
        obj: Array.isArray(customProps) ? customProps[0] : customProps,
        leaves: flattenLeaves(Array.isArray(customProps) ? customProps[0] : customProps),
      },
      documents: {
        obj: Array.isArray(docs) ? docs[0] : docs,
        leaves: flattenLeaves(Array.isArray(docs) ? docs[0] : docs),
      },
    } as Record<string, { obj: any; leaves: Leaf[]; count?: number }>;
  }, [mainEntity, affiliatedList, caseObj, caseRisk, entityRisk, customProps, docs]);

  const togglePath = (section: keyof CaseDataFields["fields"], path: string, on: boolean) => {
    const cur = value.fields[section] || [];
    const next = on ? Array.from(new Set([...cur, path])) : cur.filter((p) => p !== path);
    onChange({ ...value, fields: { ...value.fields, [section]: next } });
  };

  // Live preview block
  const preview = useMemo(() => {
    const parts: string[] = [];
    for (const { key, label } of SECTIONS) {
      const paths = value.fields[key] || [];
      if (paths.length === 0) continue;
      const obj = sectionData[key]?.obj;
      const lines: string[] = [];
      for (const p of paths) {
        const v = obj ? getByPath(obj, p) : undefined;
        lines.push(`${p}: ${v === undefined ? "(missing)" : fmtVal(v)}`);
      }
      parts.push(`### ${label}\n${lines.join("\n")}`);
    }
    return parts.join("\n\n") || "(nothing selected — no case context will be sent)";
  }, [sectionData, value.fields]);

  return (
    <div className="space-y-4">
      {/* Workspace + case selectors */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Workspace</Label>
          <Select value={customerId} onValueChange={(v) => { setCustomerId(v); localStorage.setItem("selectedCustomerId", v); }}>
            <SelectTrigger><SelectValue placeholder={loadingWs ? "Loading…" : "Pick workspace"} /></SelectTrigger>
            <SelectContent>
              {workspaces.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Sample case</Label>
          <div className="flex gap-1">
            <Select value={caseId} onValueChange={(v) => { setCaseId(v); if (customerId) localStorage.setItem(`meo_case_id:${customerId}`, v); }}>
              <SelectTrigger><SelectValue placeholder={loadingCases ? "Loading…" : "Pick case"} /></SelectTrigger>
              <SelectContent>
                {cases.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => void loadCaseData()} disabled={loadingCase} aria-label="Reload">
              {loadingCase ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {!meoToken && (
        <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Sign in to MEO to browse live case data.
        </div>
      )}

      {/* Pick the main company entity */}
      {companyCandidates.length > 0 && (
        <div className="rounded-md border p-3 space-y-2">
          <Label className="text-xs font-semibold">Which entity is the main company?</Label>
          <div className="space-y-1">
            {companyCandidates.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="main-company-entity"
                  checked={(value.main_company_entity_id || mainCompanyCandidate?.id) === a.id}
                  onChange={() => onChange({ ...value, main_company_entity_id: a.id })}
                />
                <span className="truncate">{a.name}</span>
                {a.source === "main" && <Badge variant="secondary" className="text-[10px]">case mainCompany</Badge>}
                <span className="text-xs text-muted-foreground">({a.id})</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            At runtime we look this entity up on the case by id. If it's not present, the prompt explicitly says so — no affiliated-company fallback.
          </p>
        </div>
      )}

      {/* Show empty toggle */}
      <div className="flex items-center justify-between rounded-md border px-3 py-2">
        <Label className="text-xs">Show empty fields</Label>
        <Switch checked={showEmpty} onCheckedChange={setShowEmpty} />
      </div>

      {/* Field accordions */}
      <Accordion type="multiple" className="rounded-md border divide-y">
        {SECTIONS.map(({ key, label }) => {
          const sd = sectionData[key];
          const selected = value.fields[key] || [];
          const leaves = sd?.leaves || [];
          const visible = showEmpty ? leaves : leaves.filter((l) => l.value !== null && l.value !== "");
          return (
            <AccordionItem key={key} value={key} className="border-0">
              <AccordionTrigger className="px-3 text-sm hover:no-underline">
                <div className="flex items-center gap-2 flex-1">
                  <span>{label}</span>
                  {typeof sd?.count === "number" && (
                    <Badge variant="outline" className="text-[10px]">{sd.count}</Badge>
                  )}
                  {selected.length > 0 && (
                    <Badge className="text-[10px]">{selected.length} selected</Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3">
                {!sd?.obj ? (
                  <p className="text-xs text-muted-foreground">No data for this section in the sample case.</p>
                ) : visible.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No fields {showEmpty ? "" : "with values "}available.</p>
                ) : (
                  <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                    {visible.map((leaf) => {
                      const checked = selected.includes(leaf.path);
                      return (
                        <label key={leaf.path} className="flex items-start gap-2 rounded px-1.5 py-1 hover:bg-muted/40 cursor-pointer">
                          <Checkbox checked={checked} onCheckedChange={(v) => togglePath(key, leaf.path, !!v)} />
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-[11px] text-foreground truncate">{leaf.path}</div>
                            <div className="text-[11px] text-muted-foreground truncate">{fmtVal(leaf.value)}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
                {(key === "affiliated_companies" || key === "individuals") && sd?.obj && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Paths apply to each item in the list. The sample above is item #1.
                  </p>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Live prompt preview */}
      <div className="rounded-md border bg-muted/30 p-3">
        <Label className="text-xs font-semibold">Prompt preview (live)</Label>
        <pre className="mt-2 whitespace-pre-wrap text-[11px] font-mono text-foreground">{preview}</pre>
      </div>
    </div>
  );
}
