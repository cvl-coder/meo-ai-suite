import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { ArrowRight, Download, FileSpreadsheet, Loader2, Settings2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type Step = "upload" | "mapping" | "review" | "execute";

type CaseRow = {
  id: string;
  title: string;
  externalId?: string;
  templateId: string;
  assigneeId?: string;
  businessContactName?: string;
  businessContactEmail?: string;
  status: "pending" | "creating" | "success" | "error";
  error?: string;
  resultId?: string;
  rawData?: Record<string, unknown>;
};

type ColumnMapping = {
  title: string;
  externalId: string;
  templateId: string;
  assigneeId: string;
  businessContactName: string;
  businessContactEmail: string;
};

interface BulkCaseImportProps {
  customerId: string;
  defaultTemplateId?: string;
  personToken: string;
}

const initialMapping: ColumnMapping = {
  title: "",
  externalId: "",
  templateId: "",
  assigneeId: "",
  businessContactName: "",
  businessContactEmail: "",
};

export function BulkCaseImport({ personToken, customerId, defaultTemplateId = "" }: BulkCaseImportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [rawData, setRawData] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [templateId, setTemplateId] = useState(defaultTemplateId);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>(initialMapping);
  const [currentPage, setCurrentPage] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(cases.length / pageSize));
  const paginatedCases = cases.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const workbook = XLSX.read(loadEvent.target?.result, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });

        if (jsonData.length === 0) {
          toast({ title: "Empty file", description: "The uploaded file has no data rows.", variant: "destructive" });
          return;
        }

        const extractedHeaders = Object.keys(jsonData[0]);
        const autoMapping = { ...initialMapping };

        extractedHeaders.forEach((header) => {
          const normalized = header.toLowerCase().trim();
          if (["title", "name", "case name", "casename"].includes(normalized)) autoMapping.title = header;
          if (["externalid", "external_id", "external id", "id"].includes(normalized)) autoMapping.externalId = header;
          if (["templateid", "template_id", "template"].includes(normalized)) autoMapping.templateId = header;
          if (["assigneeid", "assignee_id", "assignee"].includes(normalized)) autoMapping.assigneeId = header;
          if (["contactname", "contact_name", "business contact name", "contact"].includes(normalized)) autoMapping.businessContactName = header;
          if (["contactemail", "contact_email", "business contact email", "email"].includes(normalized)) autoMapping.businessContactEmail = header;
        });

        setHeaders(extractedHeaders);
        setRawData(jsonData);
        setColumnMapping(autoMapping);
        setStep("mapping");
        toast({ title: "File loaded", description: `Found ${jsonData.length} rows.` });
      } catch (error) {
        toast({
          title: "Error reading file",
          description: error instanceof Error ? error.message : "Failed to parse spreadsheet.",
          variant: "destructive",
        });
      }
    };

    reader.readAsBinaryString(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const applyMapping = () => {
    if (!columnMapping.title) {
      toast({ title: "Title column required", description: "Select the column that contains the case title.", variant: "destructive" });
      return;
    }

    const mappedCases = rawData
      .map((row, index) => ({
        id: `row-${index}-${Date.now()}`,
        title: String(row[columnMapping.title] || "").trim(),
        externalId: columnMapping.externalId ? String(row[columnMapping.externalId] || "").trim() : undefined,
        templateId: columnMapping.templateId ? String(row[columnMapping.templateId] || "").trim() : templateId,
        assigneeId: columnMapping.assigneeId ? String(row[columnMapping.assigneeId] || "").trim() : undefined,
        businessContactName: columnMapping.businessContactName ? String(row[columnMapping.businessContactName] || "").trim() : undefined,
        businessContactEmail: columnMapping.businessContactEmail ? String(row[columnMapping.businessContactEmail] || "").trim() : undefined,
        status: "pending" as const,
        rawData: row,
      }))
      .filter((row) => row.title);

    setCases(mappedCases);
    setSelectedRows(new Set(mappedCases.map((row) => row.id)));
    setCurrentPage(0);
    setStep("review");
    toast({ title: "Mapping applied", description: `${mappedCases.length} cases ready for import.` });
  };

  const createCase = async (row: CaseRow) => {
    const caseData: Record<string, unknown> = {
      title: row.title,
      templateId: row.templateId || templateId,
    };

    if (row.externalId) caseData.externalId = row.externalId;
    if (row.assigneeId) caseData.assigneeId = row.assigneeId;
    if (row.businessContactName) caseData.businessContactName = row.businessContactName;
    if (row.businessContactEmail) caseData.businessContactEmail = row.businessContactEmail;

    const { data, error } = await supabase.functions.invoke("meo-api-test", {
      body: {
        action: "createCase",
        payload: { customerId, personToken, caseData },
      },
    });

    if (error) return { success: false, error: error.message };
    if (data?.error) return { success: false, error: data.error };

    return {
      success: true,
      id: data?.id || data?.result?.id || data?.data?.id,
    };
  };

  const processAllCases = async () => {
    if (!personToken || !customerId) {
      toast({ title: "Missing parameters", description: "Person token and customer ID are required.", variant: "destructive" });
      return;
    }

    if (!templateId && !cases.some((row) => row.templateId)) {
      toast({ title: "Template required", description: "Add a default template ID before importing.", variant: "destructive" });
      return;
    }

    const queue = cases.filter((row) => selectedRows.has(row.id) && row.status === "pending");
    if (queue.length === 0) {
      toast({ title: "Nothing to process", description: "Select pending rows first.", variant: "destructive" });
      return;
    }

    setStep("execute");
    setIsProcessing(true);
    setProgress(0);

    let completed = 0;
    for (const row of queue) {
      setCases((prev) => prev.map((item) => (item.id === row.id ? { ...item, status: "creating" } : item)));
      const result = await createCase(row);
      setCases((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? {
                ...item,
                status: result.success ? "success" : "error",
                resultId: result.id,
                error: result.error,
              }
            : item
        )
      );
      completed += 1;
      setProgress((completed / queue.length) * 100);
    }

    setIsProcessing(false);
    toast({ title: "Import finished", description: `${completed} rows processed.` });
  };

  const resetAll = () => {
    setStep("upload");
    setRawData([]);
    setHeaders([]);
    setCases([]);
    setSelectedRows(new Set());
    setColumnMapping(initialMapping);
    setCurrentPage(0);
    setProgress(0);
  };

  const toggleRow = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const pageIds = paginatedCases.map((row) => row.id);
    const allSelected = pageIds.every((id) => selectedRows.has(id));
    setSelectedRows((prev) => {
      const next = new Set(prev);
      pageIds.forEach((id) => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const downloadTemplate = () => {
    const template = [
      { title: "Company ABC KYC", externalId: "EXT-001", businessContactName: "John Doe", businessContactEmail: "john@example.com" },
      { title: "Company XYZ Review", externalId: "EXT-002", businessContactName: "Jane Smith", businessContactEmail: "jane@example.com" },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cases");
    XLSX.writeFile(wb, "case_import_template.xlsx");
  };

  const pendingCount = cases.filter((row) => row.status === "pending").length;
  const successCount = cases.filter((row) => row.status === "success").length;
  const errorCount = cases.filter((row) => row.status === "error").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Bulk Case Import
        </CardTitle>
        <CardDescription>Upload a spreadsheet, map columns, review rows, and create cases in batch.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between text-sm">
          {[
            ["upload", "Upload"],
            ["mapping", "Map"],
            ["review", "Review"],
            ["execute", "Execute"],
          ].map(([value, label], index) => (
            <div key={value} className="flex items-center gap-3">
              <div className={`flex items-center gap-2 ${step === value ? "text-foreground" : "text-muted-foreground"}`}>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${step === value ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {index + 1}
                </span>
                <span>{label}</span>
              </div>
              {index < 3 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="defaultTemplateId">Default Template ID</Label>
            <Input id="defaultTemplateId" value={templateId} onChange={(event) => setTemplateId(event.target.value)} placeholder="e.g. kyc-basic" />
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            <div>Token: {personToken ? "Ready" : "Missing"}</div>
            <div>Customer: {customerId ? "Ready" : "Missing"}</div>
          </div>
        </div>

        {step === "upload" && (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Upload className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-2 text-lg font-medium">Upload Excel or CSV</p>
            <p className="mb-4 text-sm text-muted-foreground">Supports .xlsx, .xls, and .csv files with a header row.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <div className="relative">
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="absolute inset-0 cursor-pointer opacity-0" />
                <Button>
                  <Upload className="mr-2 h-4 w-4" />
                  Select File
                </Button>
              </div>
              <Button variant="outline" onClick={downloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Download Template
              </Button>
            </div>
          </div>
        )}

        {step === "mapping" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                <span className="font-medium">Map spreadsheet columns</span>
                <Badge variant="secondary">{rawData.length} rows</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[
                  ["title", "Title / Case Name *"],
                  ["externalId", "External ID"],
                  ["templateId", "Template ID"],
                  ["assigneeId", "Assignee ID"],
                  ["businessContactName", "Business Contact Name"],
                  ["businessContactEmail", "Business Contact Email"],
                ].map(([key, label]) => (
                  <div key={key} className="space-y-2">
                    <Label>{label}</Label>
                    <Select
                      value={(columnMapping as Record<string, string>)[key] || "__none__"}
                      onValueChange={(value) =>
                        setColumnMapping((prev) => ({ ...prev, [key]: value === "__none__" ? "" : value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {key !== "title" && <SelectItem value="__none__">-- None --</SelectItem>}
                        {headers.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={resetAll}>Reset</Button>
              <Button onClick={applyMapping}>Apply Mapping</Button>
            </div>
          </div>
        )}

        {(step === "review" || step === "execute") && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary">Pending: {pendingCount}</Badge>
              <Badge>Success: {successCount}</Badge>
              <Badge variant="destructive">Errors: {errorCount}</Badge>
            </div>

            {step === "execute" && <Progress value={progress} />}

            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={paginatedCases.length > 0 && paginatedCases.every((row) => selectedRows.has(row.id))} onCheckedChange={toggleAllVisible} />
                    </TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedCases.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Checkbox checked={selectedRows.has(row.id)} onCheckedChange={() => toggleRow(row.id)} />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{row.title}</div>
                        {row.externalId && <div className="text-xs text-muted-foreground">{row.externalId}</div>}
                      </TableCell>
                      <TableCell>{row.templateId || templateId || "—"}</TableCell>
                      <TableCell>{row.businessContactEmail || row.businessContactName || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "error" ? "destructive" : row.status === "success" ? "default" : "secondary"}>
                          {row.status}
                        </Badge>
                        {row.error && <p className="mt-1 max-w-xs text-xs text-destructive">{row.error}</p>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Page {currentPage + 1} of {totalPages}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" disabled={currentPage === 0} onClick={() => setCurrentPage((page) => Math.max(0, page - 1))}>
                  Prev
                </Button>
                <Button variant="outline" disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage((page) => Math.min(totalPages - 1, page + 1))}>
                  Next
                </Button>
                <Button variant="outline" onClick={resetAll} disabled={isProcessing}>Reset</Button>
                <Button onClick={processAllCases} disabled={isProcessing}>
                  {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Run Import
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
