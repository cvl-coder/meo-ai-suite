import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { BulkCaseImport } from "@/components/api/BulkCaseImport";
import { EntityEditForm } from "@/components/api/EntityEditForm";
import { EntityRelationsForm } from "@/components/api/EntityRelationsForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getMeoToken } from "@/lib/meoToken";

type ComponentOverride = { componentId: string; value: string };

type ActionCard = {
  action: string;
  description: string;
  title: string;
};

const getCards: ActionCard[] = [
  { action: "getUserDetails", title: "Get User Details", description: "Fetch the current MEO user profile." },
  { action: "getAccount", title: "Get Account", description: "Fetch account details and admin memberships." },
  { action: "getData", title: "Get Data", description: "Fetch one specific data object by ID." },
  { action: "getCustomer", title: "Get Customer", description: "Fetch customer / workspace metadata." },
  { action: "getGrants", title: "Get Grants", description: "List grants from the MEO health API." },
  { action: "getGrantRequests", title: "Get Grant Requests", description: "Fetch incoming grant requests." },
  { action: "getNotifications", title: "Get Notifications", description: "Fetch notification records." },
  { action: "searchUsers", title: "Search Users", description: "Search users inside a customer workspace." },
  { action: "getAdmins", title: "Get Admins", description: "List current admin users for a customer." },
  { action: "getAdminInvites", title: "Get Admin Invites", description: "List pending admin invites." },
  { action: "getCases", title: "Get Cases", description: "Fetch cases for the selected customer." },
  { action: "getCase", title: "Get Case", description: "Fetch one case in detail." },
  { action: "getEntityCustomProperties", title: "Get Entity Custom Properties", description: "Fetch custom properties for one entity." },
  { action: "getEntityUserdata", title: "Get Entity Documents", description: "Fetch uploaded entity userdata/documents." },
];

export default function ApiTest() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [personToken, setPersonToken] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [dataId, setDataId] = useState("");
  const [caseId, setCaseId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [checkId, setCheckId] = useState("");
  const [copied, setCopied] = useState(false);

  const [entityName, setEntityName] = useState("");
  const [entityEmail, setEntityEmail] = useState("");
  const [entityPhone, setEntityPhone] = useState("");
  const [entityAddress, setEntityAddress] = useState("");
  const [entityZipCode, setEntityZipCode] = useState("");
  const [entityCity, setEntityCity] = useState("");
  const [entityNationalId, setEntityNationalId] = useState("");
  const [entityBirthDate, setEntityBirthDate] = useState("");
  const [entityOwnershipShare, setEntityOwnershipShare] = useState("0.25");
  const [relationRoleType, setRelationRoleType] = useState("BeneficialOwnership");

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState("SignedDocument");
  const [uploadEntityId, setUploadEntityId] = useState("");

  const [updateEntityJson, setUpdateEntityJson] = useState('{\n  "email": "test@example.com",\n  "phone": "+45-12345678"\n}');
  const [updateRelationsJson, setUpdateRelationsJson] = useState('[\n  {\n    "relatesTo": "",\n    "roles": [{\n      "type": "BoardOfDirectors",\n      "title": "Member"\n    }]\n  }\n]');
  const [customPropertiesJson, setCustomPropertiesJson] = useState('{\n  "key": "value"\n}');

  const [adminInviteName, setAdminInviteName] = useState("");
  const [adminInviteEmail, setAdminInviteEmail] = useState("");
  const [deleteInviteRequestId, setDeleteInviteRequestId] = useState("");
  const [deleteAdminId, setDeleteAdminId] = useState("");
  const [datafordelerCvr, setDatafordelerCvr] = useState("");

  const [caseName, setCaseName] = useState("");
  const [caseExternalId, setCaseExternalId] = useState("");
  const [caseTemplateId, setCaseTemplateId] = useState("");
  const [caseAssigneeId, setCaseAssigneeId] = useState("");
  const [caseBusinessContactName, setCaseBusinessContactName] = useState("");
  const [caseBusinessContactEmail, setCaseBusinessContactEmail] = useState("");
  const [casePreliminaryRisk, setCasePreliminaryRisk] = useState("");
  const [caseAreaOfLegalAdvise, setCaseAreaOfLegalAdvise] = useState("");
  const [caseDataJson, setCaseDataJson] = useState("{}");

  const [formSigningTemplateId, setFormSigningTemplateId] = useState("");
  const [formSigningRespondentName, setFormSigningRespondentName] = useState("");
  const [formSigningRespondentEmail, setFormSigningRespondentEmail] = useState("");
  const [componentOverrides, setComponentOverrides] = useState<ComponentOverride[]>([{ componentId: "", value: "" }]);

  useEffect(() => {
    setPersonToken(getMeoToken() || "");
  }, []);

  const userId = useMemo(() => localStorage.getItem("meo_user_id") || "", []);

  const invokeAction = async (action: string, payload: Record<string, any>) => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("meo-api-test", { body: { action, payload } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data);
      toast({ title: "Success", description: `${action} executed successfully.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      setResult({ error: message });
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copyToken = async () => {
    if (!personToken) return;
    await navigator.clipboard.writeText(personToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUploadDocument = async () => {
    if (!uploadFile || !uploadEntityId || !personToken || !customerId) {
      toast({ title: "Missing parameters", description: "Token, customer, entity, and file are required.", variant: "destructive" });
      return;
    }

    const arrayBuffer = await uploadFile.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    await invokeAction("uploadEntityDocument", {
      customerId,
      data: base64,
      entityId: uploadEntityId,
      filename: uploadFile.name,
      format: uploadFile.type || "application/pdf",
      personToken,
      type: uploadType,
    });
  };

  const handleCreateCase = async () => {
    try {
      const extra = caseDataJson.trim() ? JSON.parse(caseDataJson) : {};
      const caseData: Record<string, any> = { ...extra, title: caseName, templateId: caseTemplateId };
      if (caseExternalId) caseData.externalId = caseExternalId;
      if (caseAssigneeId) caseData.assigneeId = caseAssigneeId;
      if (caseBusinessContactName) caseData.businessContactName = caseBusinessContactName;
      if (caseBusinessContactEmail) caseData.businessContactEmail = caseBusinessContactEmail;
      const customProperties: Record<string, string> = {};
      if (casePreliminaryRisk) customProperties.preliminaryRisk = casePreliminaryRisk;
      if (caseAreaOfLegalAdvise) customProperties.areaOfLegalAdvise = caseAreaOfLegalAdvise;
      if (Object.keys(customProperties).length > 0) caseData.customProperties = customProperties;
      await invokeAction("createCase", { caseData, customerId, personToken });
    } catch {
      toast({ title: "Invalid JSON", description: "Additional case properties must be valid JSON.", variant: "destructive" });
    }
  };

  const handleCreateEntities = async () => {
    const entities = [{
      type: "Individual",
      name: entityName,
      isAuthenticatedUser: false,
      caseRelationType: "Individual",
      ...(entityAddress ? { address: { addressLine1: entityAddress, zipCode: entityZipCode, city: entityCity, countryCode: "DK" } } : {}),
      ...(entityBirthDate ? { birthDate: entityBirthDate } : {}),
      ...(entityEmail ? { email: entityEmail } : {}),
      ...(entityNationalId ? { nationalIdentificationNumber: { identificationNumber: entityNationalId, countryCode: "DK" } } : {}),
      ...(entityPhone ? { phone: entityPhone } : {}),
      relationsIdentifier: entityName || "entity",
    }];
    await invokeAction("createEntities", { caseId, customerId, entities, personToken });
  };

  const simpleActionPayload = (action: string) => {
    switch (action) {
      case "getUserDetails": return { personToken };
      case "getAccount": return { personToken, userId };
      case "getData": return { dataId, personToken };
      case "getCustomer": return { customerId, personToken, userId };
      case "getGrants": return { userId };
      case "getGrantRequests": return { personToken };
      case "getNotifications": return { unreadOnly: false, userId };
      case "searchUsers": return { customerId, personToken, userId };
      case "getAdmins": return { customerId, personToken, userId };
      case "getAdminInvites": return { customerId, personToken, userId };
      case "getCases": return { customerId, page: 1, personToken, limit: 10, statuses: ["Open", "Approved", "Rejected"] };
      case "getCase": return { caseId, customerId, personToken };
      case "getEntityCustomProperties": return { customerId, entityId, personToken, page: 1, limit: 100 };
      case "getEntityUserdata": return { customerId, entityId, personToken };
      default: return {};
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "Space Grotesk, sans-serif" }}>API Test</h1>
          <p className="text-muted-foreground">Ported MEO integration test area for validating backend actions and payloads.</p>
        </div>

        <Tabs defaultValue="get" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="get">Get Data</TabsTrigger>
            <TabsTrigger value="post">Post Data</TabsTrigger>
            <TabsTrigger value="addosign">Addosign</TabsTrigger>
          </TabsList>

          <TabsContent value="get" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>API Parameters</CardTitle>
                <CardDescription>Core values reused by the imported test actions.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Person Token</Label>
                      {personToken && <Button variant="ghost" size="sm" onClick={copyToken}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button>}
                    </div>
                    <Input value={personToken} onChange={(e) => setPersonToken(e.target.value)} placeholder="Auto-filled from login" />
                  </div>
                  <div className="space-y-2">
                    <Label>User ID</Label>
                    <Input value={userId} disabled placeholder="Stored after login" />
                  </div>
                  <div className="space-y-2">
                    <Label>Customer ID</Label>
                    <Input value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="Workspace / customer ID" />
                  </div>
                  <div className="space-y-2">
                    <Label>Case ID</Label>
                    <Input value={caseId} onChange={(e) => setCaseId(e.target.value)} placeholder="Case ID" />
                  </div>
                  <div className="space-y-2">
                    <Label>Entity ID</Label>
                    <Input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="Entity ID" />
                  </div>
                  <div className="space-y-2">
                    <Label>Data ID</Label>
                    <Input value={dataId} onChange={(e) => setDataId(e.target.value)} placeholder="Data object ID" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {getCards.map((card) => (
                <Card key={card.action}>
                  <CardHeader>
                    <CardTitle className="text-base">{card.title}</CardTitle>
                    <CardDescription>{card.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full" disabled={loading} onClick={() => invokeAction(card.action, simpleActionPayload(card.action))}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Check Endpoints</CardTitle>
                <CardDescription>Case check-specific API calls.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2"><Label>Check ID</Label><Input value={checkId} onChange={(e) => setCheckId(e.target.value)} placeholder="Check ID" /></div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" disabled={loading} onClick={() => invokeAction("getCheckData", { checkId, caseId, customerId, personToken })}>Get Check Data</Button>
                  <Button disabled={loading} onClick={() => invokeAction("getCheckIdentities", { checkId, caseId, customerId, personToken })}>Get Identities</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Datafordeler CVR Lookup</CardTitle>
                <CardDescription>Lookup Danish company data by CVR.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 md:flex-row md:items-end">
                <div className="flex-1 space-y-2">
                  <Label>CVR</Label>
                  <Input value={datafordelerCvr} onChange={(e) => setDatafordelerCvr(e.target.value)} placeholder="8 digit CVR" />
                </div>
                <Button disabled={loading} onClick={() => invokeAction("datafordelerCvr", { cvr: datafordelerCvr })}>Lookup</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="post" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Create Case</CardTitle>
                <CardDescription>Source-port case creation form.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>Name</Label><Input value={caseName} onChange={(e) => setCaseName(e.target.value)} /></div>
                  <div className="space-y-2"><Label>External ID</Label><Input value={caseExternalId} onChange={(e) => setCaseExternalId(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Template</Label><Input value={caseTemplateId} onChange={(e) => setCaseTemplateId(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Assignee ID</Label><Input value={caseAssigneeId} onChange={(e) => setCaseAssigneeId(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Business Contact Name</Label><Input value={caseBusinessContactName} onChange={(e) => setCaseBusinessContactName(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Business Contact Email</Label><Input value={caseBusinessContactEmail} onChange={(e) => setCaseBusinessContactEmail(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Preliminary Risk</Label><Select value={casePreliminaryRisk} onValueChange={setCasePreliminaryRisk}><SelectTrigger><SelectValue placeholder="Select risk" /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label>Area of Legal Advise</Label><Input value={caseAreaOfLegalAdvise} onChange={(e) => setCaseAreaOfLegalAdvise(e.target.value)} /></div>
                </div>
                <div className="space-y-2"><Label>Additional Properties JSON</Label><Textarea rows={5} value={caseDataJson} onChange={(e) => setCaseDataJson(e.target.value)} /></div>
                <Button disabled={loading} onClick={handleCreateCase}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Case"}</Button>
              </CardContent>
            </Card>

            <BulkCaseImport personToken={personToken} customerId={customerId} defaultTemplateId={caseTemplateId} />

            <Card>
              <CardHeader>
                <CardTitle>Create Entities</CardTitle>
                <CardDescription>Source-inspired entity creation helper.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>Entity Name</Label><Input value={entityName} onChange={(e) => setEntityName(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Email</Label><Input value={entityEmail} onChange={(e) => setEntityEmail(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Phone</Label><Input value={entityPhone} onChange={(e) => setEntityPhone(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Birth Date</Label><Input type="date" value={entityBirthDate} onChange={(e) => setEntityBirthDate(e.target.value ? new Date(e.target.value).toISOString() : "")} /></div>
                  <div className="space-y-2"><Label>National ID</Label><Input value={entityNationalId} onChange={(e) => setEntityNationalId(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Relation Role Type</Label><Select value={relationRoleType} onValueChange={setRelationRoleType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="BeneficialOwnership">Beneficial Ownership</SelectItem><SelectItem value="BoardOfDirectors">Board of Directors</SelectItem><SelectItem value="Management">Management</SelectItem><SelectItem value="Shareholder">Shareholder</SelectItem><SelectItem value="Unknown">Unknown</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label>Ownership Share</Label><Input value={entityOwnershipShare} onChange={(e) => setEntityOwnershipShare(e.target.value)} /></div>
                  <div className="space-y-2 md:col-span-2"><Label>Address</Label><Input value={entityAddress} onChange={(e) => setEntityAddress(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Zip Code</Label><Input value={entityZipCode} onChange={(e) => setEntityZipCode(e.target.value)} /></div>
                  <div className="space-y-2"><Label>City</Label><Input value={entityCity} onChange={(e) => setEntityCity(e.target.value)} /></div>
                </div>
                <Button disabled={loading} onClick={handleCreateEntities}>Create Entities</Button>
              </CardContent>
            </Card>

            <EntityEditForm caseId={caseId} customerId={customerId} entityId={entityId} entityName={entityName} personToken={personToken} />
            <EntityRelationsForm caseId={caseId} customerId={customerId} entityId={entityId} personToken={personToken} />

            <Card>
              <CardHeader>
                <CardTitle>Advanced JSON Helpers</CardTitle>
                <CardDescription>Direct source-port style payload editors.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Update Entity JSON</Label><Textarea rows={5} value={updateEntityJson} onChange={(e) => setUpdateEntityJson(e.target.value)} /></div>
                <div className="space-y-2"><Label>Update Relations JSON</Label><Textarea rows={5} value={updateRelationsJson} onChange={(e) => setUpdateRelationsJson(e.target.value)} /></div>
                <div className="space-y-2"><Label>Custom Properties JSON</Label><Textarea rows={5} value={customPropertiesJson} onChange={(e) => setCustomPropertiesJson(e.target.value)} /></div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" disabled={loading} onClick={() => { try { invokeAction("updateEntity", { caseId, customerId, entityId, entityData: JSON.parse(updateEntityJson), personToken }); } catch { toast({ title: "Invalid JSON", description: "Update entity JSON is invalid.", variant: "destructive" }); } }}>Update Entity</Button>
                  <Button variant="outline" disabled={loading} onClick={() => { try { invokeAction("updateEntityRelations", { caseId, customerId, entityId, relations: JSON.parse(updateRelationsJson), personToken }); } catch { toast({ title: "Invalid JSON", description: "Relations JSON is invalid.", variant: "destructive" }); } }}>Update Relations</Button>
                  <Button disabled={loading} onClick={() => { try { invokeAction("setEntityCustomProperties", { customerId, entityId, customProperties: JSON.parse(customPropertiesJson), personToken }); } catch { toast({ title: "Invalid JSON", description: "Custom properties JSON is invalid.", variant: "destructive" }); } }}>Set Custom Properties</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Admin Helpers</CardTitle>
                <CardDescription>Invite and remove admins using the imported workflow.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>Invite Name</Label><Input value={adminInviteName} onChange={(e) => setAdminInviteName(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Invite Email</Label><Input value={adminInviteEmail} onChange={(e) => setAdminInviteEmail(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Delete Invite Request ID</Label><Input value={deleteInviteRequestId} onChange={(e) => setDeleteInviteRequestId(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Delete Admin ID</Label><Input value={deleteAdminId} onChange={(e) => setDeleteAdminId(e.target.value)} /></div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" disabled={loading} onClick={() => invokeAction("sendAdminInvite", { customerId, personToken, userId, email: adminInviteEmail, name: adminInviteName, roleIds: ["CustomerAdmin"] })}>Send Invite</Button>
                  <Button variant="outline" disabled={loading} onClick={() => invokeAction("deleteAdminInvite", { customerId, personToken, requestId: deleteInviteRequestId, userId })}>Delete Invite</Button>
                  <Button disabled={loading} onClick={() => invokeAction("deleteAdmin", { adminId: deleteAdminId, customerId, personToken, userId })}>Delete Admin</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Upload Entity Document</CardTitle>
                <CardDescription>Upload a file to a MEO entity userdata record.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2"><Label>Entity ID</Label><Input value={uploadEntityId} onChange={(e) => setUploadEntityId(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Document Type</Label><Input value={uploadType} onChange={(e) => setUploadType(e.target.value)} /></div>
                  <div className="space-y-2"><Label>File</Label><Input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} /></div>
                </div>
                <Button disabled={loading} onClick={handleUploadDocument}>Upload Document</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="addosign" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Initiate Form Signing</CardTitle>
                <CardDescription>Ported Addosign form-signing tester.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>Template ID</Label><Input value={formSigningTemplateId} onChange={(e) => setFormSigningTemplateId(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Respondent Name</Label><Input value={formSigningRespondentName} onChange={(e) => setFormSigningRespondentName(e.target.value)} /></div>
                  <div className="space-y-2 md:col-span-2"><Label>Respondent Email</Label><Input value={formSigningRespondentEmail} onChange={(e) => setFormSigningRespondentEmail(e.target.value)} /></div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Component Overrides</Label>
                    <Button variant="outline" size="sm" onClick={() => setComponentOverrides((prev) => [...prev, { componentId: "", value: "" }])}><Plus className="mr-2 h-4 w-4" />Add override</Button>
                  </div>
                  {componentOverrides.map((override, index) => (
                    <div key={index} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                      <Input value={override.componentId} onChange={(e) => setComponentOverrides((prev) => prev.map((item, i) => i === index ? { ...item, componentId: e.target.value } : item))} placeholder="Component ID" />
                      <Input value={override.value} onChange={(e) => setComponentOverrides((prev) => prev.map((item, i) => i === index ? { ...item, value: e.target.value } : item))} placeholder="Value" />
                      <Button variant="ghost" size="icon" onClick={() => setComponentOverrides((prev) => prev.filter((_, i) => i !== index))} disabled={componentOverrides.length === 1}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
                <Button disabled={loading} onClick={() => invokeAction("initiateFormSigning", { formTemplateId: formSigningTemplateId, respondentName: formSigningRespondentName, respondentEmail: formSigningRespondentEmail, componentValueOverrides: componentOverrides })}>Initiate Form Signing</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card>
          <CardHeader>
            <CardTitle>Response</CardTitle>
            <CardDescription>Last backend response from the imported API test suite.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[520px] overflow-auto rounded-lg border bg-muted/30 p-4 text-xs">{JSON.stringify(result, null, 2) || "Run a test to see output."}</pre>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
