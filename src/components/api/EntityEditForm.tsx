import { useState } from "react";
import { Loader2, RefreshCw, Save, Shield, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface EntityEditFormProps {
  caseId?: string;
  customerId: string;
  entityId: string;
  entityName?: string;
  personToken: string;
}

export function EntityEditForm({ caseId, customerId, entityId, entityName = "", personToken }: EntityEditFormProps) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(entityName);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [nationality, setNationality] = useState("");
  const [isPep, setIsPep] = useState(false);
  const [nationalId, setNationalId] = useState("");
  const [nationalIdCountry, setNationalIdCountry] = useState("DK");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [city, setCity] = useState("");
  const [countryCode, setCountryCode] = useState("DK");

  const reset = () => {
    setName(entityName);
    setEmail("");
    setPhone("");
    setBirthDate("");
    setNationality("");
    setIsPep(false);
    setNationalId("");
    setNationalIdCountry("DK");
    setAddressLine1("");
    setAddressLine2("");
    setZipCode("");
    setCity("");
    setCountryCode("DK");
  };

  const handleSave = async () => {
    if (!personToken || !customerId || !entityId) {
      toast({ title: "Missing parameters", description: "Person token, customer ID, and entity ID are required.", variant: "destructive" });
      return;
    }

    setSaving(true);

    const entityData: Record<string, unknown> = {};
    if (name.trim()) entityData.name = name.trim();
    if (email.trim()) entityData.email = email.trim();
    if (phone.trim()) entityData.phone = phone.trim();
    if (birthDate) entityData.birthDate = birthDate;
    if (nationality.trim()) entityData.nationality = nationality.trim();
    if (isPep) entityData.isPoliticallyExposedPerson = true;
    if (nationalId.trim()) {
      entityData.nationalIdentificationNumber = {
        identificationNumber: nationalId.trim(),
        countryCode: nationalIdCountry.trim() || "DK",
      };
    }
    if (addressLine1.trim() || addressLine2.trim() || zipCode.trim() || city.trim()) {
      entityData.address = {
        addressLine1: addressLine1.trim(),
        addressLine2: addressLine2.trim(),
        zipCode: zipCode.trim(),
        city: city.trim(),
        countryCode: countryCode.trim() || "DK",
      };
    }

    try {
      const { data, error } = await supabase.functions.invoke("meo-api-test", {
        body: {
          action: "updateEntity",
          payload: { caseId, customerId, entityId, entityData, personToken },
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Entity updated", description: "The edit request was sent successfully." });
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Unable to update entity.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Edit Entity
        </CardTitle>
        <CardDescription>Manual helper for updating a single MEO entity.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" />
          </div>
          <div className="space-y-2">
            <Label>Birth Date</Label>
            <Input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@example.com" />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+45 12 34 56 78" />
          </div>
          <div className="space-y-2">
            <Label>Nationality</Label>
            <Input value={nationality} onChange={(event) => setNationality(event.target.value)} placeholder="DK" />
          </div>
          <div className="flex items-center gap-3 pt-7">
            <Switch checked={isPep} onCheckedChange={setIsPep} id="is-pep" />
            <Label htmlFor="is-pep" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Politically exposed person
            </Label>
          </div>
          <div className="space-y-2">
            <Label>National ID</Label>
            <Input value={nationalId} onChange={(event) => setNationalId(event.target.value)} placeholder="Identifier" />
          </div>
          <div className="space-y-2">
            <Label>National ID Country</Label>
            <Input value={nationalIdCountry} onChange={(event) => setNationalIdCountry(event.target.value)} placeholder="DK" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Address line 1</Label>
            <Input value={addressLine1} onChange={(event) => setAddressLine1(event.target.value)} placeholder="Street and number" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Address line 2</Label>
            <Input value={addressLine2} onChange={(event) => setAddressLine2(event.target.value)} placeholder="Apartment, suite, etc." />
          </div>
          <div className="space-y-2">
            <Label>Zip code</Label>
            <Input value={zipCode} onChange={(event) => setZipCode(event.target.value)} placeholder="2100" />
          </div>
          <div className="space-y-2">
            <Label>City</Label>
            <Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Copenhagen" />
          </div>
          <div className="space-y-2">
            <Label>Country code</Label>
            <Input value={countryCode} onChange={(event) => setCountryCode(event.target.value)} placeholder="DK" />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={reset} disabled={saving}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
