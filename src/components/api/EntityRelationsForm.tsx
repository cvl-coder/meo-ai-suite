import { useState } from "react";
import { MoreVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type Role = {
  share?: number;
  title?: string;
  type: string;
};

type Relation = {
  relatesTo: string;
  roles: Role[];
};

interface EntityRelationsFormProps {
  caseId: string;
  customerId: string;
  entityId: string;
  personToken: string;
}

const roleTypes = [
  { value: "Manager", label: "Manager", hasTitle: true },
  { value: "BoardOfDirectors", label: "Board of Directors", hasTitle: true },
  { value: "BeneficialOwnership", label: "Beneficial ownership", hasShare: true },
  { value: "ControllingVote", label: "Controlling vote", hasShare: true },
  { value: "Shareholder", label: "Shareholder", hasShare: true },
  { value: "Unknown", label: "Other", hasTitle: true },
];

export function EntityRelationsForm({ caseId, customerId, entityId, personToken }: EntityRelationsFormProps) {
  const [loading, setLoading] = useState(false);
  const [relations, setRelations] = useState<Relation[]>([{ relatesTo: "", roles: [{ type: "Manager", title: "" }] }]);

  const addRelation = () => setRelations((prev) => [...prev, { relatesTo: "", roles: [{ type: "Manager", title: "" }] }]);
  const removeRelation = (relationIndex: number) => setRelations((prev) => prev.filter((_, index) => index !== relationIndex));

  const updateRelation = (relationIndex: number, relatesTo: string) => {
    setRelations((prev) => prev.map((relation, index) => (index === relationIndex ? { ...relation, relatesTo } : relation)));
  };

  const addRole = (relationIndex: number) => {
    setRelations((prev) =>
      prev.map((relation, index) =>
        index === relationIndex ? { ...relation, roles: [...relation.roles, { type: "Manager", title: "" }] } : relation
      )
    );
  };

  const removeRole = (relationIndex: number, roleIndex: number) => {
    setRelations((prev) =>
      prev.map((relation, index) =>
        index === relationIndex
          ? { ...relation, roles: relation.roles.filter((_, currentRoleIndex) => currentRoleIndex !== roleIndex) }
          : relation
      )
    );
  };

  const updateRole = (relationIndex: number, roleIndex: number, patch: Partial<Role>) => {
    setRelations((prev) =>
      prev.map((relation, currentRelationIndex) =>
        currentRelationIndex === relationIndex
          ? {
              ...relation,
              roles: relation.roles.map((role, currentRoleIndex) =>
                currentRoleIndex === roleIndex ? { ...role, ...patch } : role
              ),
            }
          : relation
      )
    );
  };

  const handleSave = async () => {
    if (!personToken || !customerId || !caseId || !entityId) {
      toast({ title: "Missing parameters", description: "Person token, customer ID, case ID, and entity ID are required.", variant: "destructive" });
      return;
    }

    const validRelations = relations
      .filter((relation) => relation.relatesTo.trim() && relation.roles.length > 0)
      .map((relation) => ({
        relatesTo: relation.relatesTo.trim(),
        roles: relation.roles.map((role) => {
          const payload: Record<string, unknown> = { type: role.type };
          if (role.title) payload.title = role.title;
          if (typeof role.share === "number") payload.share = role.share;
          return payload;
        }),
      }));

    if (validRelations.length === 0) {
      toast({ title: "No relations", description: "Add at least one relation before saving.", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("meo-api-test", {
        body: {
          action: "updateEntityRelations",
          payload: { caseId, customerId, entityId, personToken, relations: validRelations },
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Relations updated", description: "The relation update request was sent successfully." });
    } catch (error) {
      toast({
        title: "Relations update failed",
        description: error instanceof Error ? error.message : "Unable to update entity relations.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entity Relations</CardTitle>
        <CardDescription>Manual helper for building relation payloads for a case entity.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {relations.map((relation, relationIndex) => (
          <div key={relationIndex} className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 space-y-2">
                <Label>Relates to entity ID</Label>
                <Input value={relation.relatesTo} onChange={(event) => updateRelation(relationIndex, event.target.value)} placeholder="Target entity ID" />
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeRelation(relationIndex)} disabled={relations.length === 1}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-3">
              {relation.roles.map((role, roleIndex) => {
                const config = roleTypes.find((item) => item.value === role.type);
                return (
                  <div key={roleIndex} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select value={role.type} onValueChange={(value) => updateRole(relationIndex, roleIndex, { type: value, title: "", share: undefined })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roleTypes.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>{config?.hasShare ? "Share" : "Title"}</Label>
                      {config?.hasShare ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={role.share ?? ""}
                          onChange={(event) => updateRole(relationIndex, roleIndex, { share: Number(event.target.value) || 0 })}
                          placeholder="0.00"
                        />
                      ) : (
                        <Input value={role.title ?? ""} onChange={(event) => updateRole(relationIndex, roleIndex, { title: event.target.value })} placeholder="Role title" />
                      )}
                    </div>

                    <Button variant="ghost" size="icon" onClick={() => removeRole(relationIndex, roleIndex)} disabled={relation.roles.length === 1}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <Button variant="outline" size="sm" onClick={() => addRole(relationIndex)}>
              <Plus className="mr-2 h-4 w-4" />
              Add role
            </Button>
          </div>
        ))}

        <div className="flex justify-between gap-3">
          <Button variant="outline" onClick={addRelation}>
            <Plus className="mr-2 h-4 w-4" />
            Add relation
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save Relations"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
