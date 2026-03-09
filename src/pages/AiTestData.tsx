import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, ArrowLeft, Loader2, Pencil, Database } from "lucide-react";

type AiFunction = {
  id: string;
  name: string;
  type: string;
};

type ClientField = {
  key: string;
  label: string;
  type: string;
  required: boolean;
};

type TestDataEntry = {
  id: string;
  function_id: string;
  label: string;
  field_values: Record<string, string>;
  created_at: string;
  updated_at: string;
};

export default function AiTestData() {
  const navigate = useNavigate();
  const [functions, setFunctions] = useState<AiFunction[]>([]);
  const [selectedFnId, setSelectedFnId] = useState<string | null>(null);
  const [clientFields, setClientFields] = useState<ClientField[]>([]);
  const [entries, setEntries] = useState<TestDataEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editLabel, setEditLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadFunctions();
  }, []);

  useEffect(() => {
    if (selectedFnId) {
      loadConfigAndEntries(selectedFnId);
    }
  }, [selectedFnId]);

  const loadFunctions = async () => {
    const { data } = await supabase
      .from("ai_functions")
      .select("id, name, type")
      .eq("enabled", true)
      .order("created_at", { ascending: true });
    setFunctions(data || []);
    if (data && data.length > 0) {
      setSelectedFnId(data[0].id);
    }
    setLoading(false);
  };

  const loadConfigAndEntries = async (fnId: string) => {
    const [configRes, entriesRes] = await Promise.all([
      supabase
        .from("ai_search_configs")
        .select("client_fields")
        .eq("function_id", fnId)
        .limit(1)
        .single(),
      supabase
        .from("ai_test_data")
        .select("*")
        .eq("function_id", fnId)
        .order("created_at", { ascending: false }),
    ]);

    if (configRes.data) {
      setClientFields((configRes.data.client_fields as any) || []);
    } else {
      setClientFields([]);
    }
    setEntries((entriesRes.data as any) || []);
  };

  const addEntry = async () => {
    if (!selectedFnId) return;
    const defaultValues: Record<string, string> = {};
    clientFields.forEach((f) => (defaultValues[f.key] = ""));

    const { data, error } = await supabase
      .from("ai_test_data")
      .insert({
        function_id: selectedFnId,
        label: `Test Data ${entries.length + 1}`,
        field_values: defaultValues as any,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Error creating", description: error.message, variant: "destructive" });
    } else if (data) {
      setEntries([data as any, ...entries]);
      startEditing(data as any);
      toast({ title: "Test data created" });
    }
  };

  const startEditing = (entry: TestDataEntry) => {
    setEditingId(entry.id);
    setEditLabel(entry.label);
    setEditValues(entry.field_values || {});
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditLabel("");
    setEditValues({});
  };

  const saveEntry = async () => {
    if (!editingId) return;
    setSaving(true);

    const { error } = await supabase
      .from("ai_test_data")
      .update({
        label: editLabel,
        field_values: editValues as any,
      })
      .eq("id", editingId);

    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === editingId ? { ...e, label: editLabel, field_values: editValues } : e
        )
      );
      setEditingId(null);
      toast({ title: "Test data saved" });
    }
    setSaving(false);
  };

  const deleteEntry = async (id: string) => {
    const { error } = await supabase.from("ai_test_data").delete().eq("id", id);
    if (error) {
      toast({ title: "Error deleting", description: error.message, variant: "destructive" });
    } else {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (editingId === id) cancelEditing();
      toast({ title: "Test data deleted" });
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/ai-admin")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Test Data
              </h1>
              <p className="text-muted-foreground">
                Manage reusable test data sets for your AI functions.
              </p>
            </div>
          </div>
          <Button onClick={addEntry} disabled={!selectedFnId} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Test Data
          </Button>
        </div>

        {/* Function selector */}
        {functions.length > 1 && (
          <div className="flex gap-2">
            {functions.map((fn) => (
              <Button
                key={fn.id}
                variant={selectedFnId === fn.id ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setSelectedFnId(fn.id);
                  cancelEditing();
                }}
              >
                {fn.name}
              </Button>
            ))}
          </div>
        )}

        {functions.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Database className="h-10 w-10" />
              <p className="text-sm">No enabled AI functions. Enable a function first.</p>
              <Button variant="outline" size="sm" onClick={() => navigate("/ai-admin")}>
                Go to AI Functions
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Test data entries */}
        {selectedFnId && (
          <div className="space-y-4">
            {entries.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                  <Database className="h-10 w-10" />
                  <p className="text-sm">No test data yet. Click "Add Test Data" to create one.</p>
                </CardContent>
              </Card>
            )}

            {entries.map((entry) => {
              const isEditing = editingId === entry.id;

              return (
                <Card key={entry.id} className={isEditing ? "border-primary/40 shadow-md" : ""}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      {isEditing ? (
                        <Input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          className="max-w-xs font-semibold"
                        />
                      ) : (
                        <CardTitle className="text-base">{entry.label}</CardTitle>
                      )}
                      <div className="flex items-center gap-1">
                        {isEditing ? (
                          <>
                            <Button variant="ghost" size="sm" onClick={cancelEditing}>
                              Cancel
                            </Button>
                            <Button size="sm" onClick={saveEntry} disabled={saving} className="gap-1.5">
                              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                              Save
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => startEditing(entry)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteEntry(entry.id)} className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {!isEditing && (
                      <CardDescription className="text-xs">
                        Updated {new Date(entry.updated_at).toLocaleString()}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    {isEditing ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        {clientFields.map((field) => (
                          <div key={field.key} className="space-y-1.5">
                            <Label className="text-sm">
                              {field.label}
                              {field.required && <span className="text-destructive ml-1">*</span>}
                            </Label>
                            {field.type === "textarea" ? (
                              <Textarea
                                value={editValues[field.key] || ""}
                                onChange={(e) =>
                                  setEditValues({ ...editValues, [field.key]: e.target.value })
                                }
                                placeholder={`Enter ${field.label.toLowerCase()}`}
                                rows={3}
                              />
                            ) : (
                              <Input
                                value={editValues[field.key] || ""}
                                onChange={(e) =>
                                  setEditValues({ ...editValues, [field.key]: e.target.value })
                                }
                                placeholder={`Enter ${field.label.toLowerCase()}`}
                              />
                            )}
                          </div>
                        ))}
                        {clientFields.length === 0 && (
                          <p className="text-sm text-muted-foreground col-span-2">
                            No client fields configured. Go to Configure to add fields.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(entry.field_values || {}).map(([key, val]) => {
                          const field = clientFields.find((f) => f.key === key);
                          if (!val) return null;
                          return (
                            <Badge key={key} variant="outline" className="text-xs">
                              {field?.label || key}: {String(val)}
                            </Badge>
                          );
                        })}
                        {Object.values(entry.field_values || {}).every((v) => !v) && (
                          <span className="text-xs text-muted-foreground">No data — click edit to add values</span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
