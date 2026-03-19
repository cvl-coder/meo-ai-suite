import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MEO_RPC_CONSUMER_ADMIN = "https://app.meo.io/client-proxy/consumer-admin";
const MEO_RPC_APP = "https://app.meo.io/client-proxy/meo-app";
const MEO_REST_BASE = "https://new-api.meo.io";

type RequestPayload = {
  action?: string;
  payload?: Record<string, any>;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireFields(payload: Record<string, any>, fields: string[]) {
  for (const field of fields) {
    const value = payload[field];
    if (value === undefined || value === null || value === "") {
      throw new Error(`${field} is required`);
    }
  }
}

async function safeJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function meoRpc(url: string, body: unknown, includeApiKey = true) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const meoApiKey = Deno.env.get("MEO_API_KEY");

  if (includeApiKey) {
    if (!meoApiKey) throw new Error("MEO_API_KEY not configured");
    headers["X-API-Key"] = meoApiKey;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = await safeJson(response);
  if (!response.ok) {
    throw new Error(typeof data?.raw === "string" ? `MEO RPC error ${response.status}: ${data.raw}` : `MEO RPC error ${response.status}`);
  }
  if (data?.error) {
    throw new Error(data.error.message || "MEO RPC returned an error");
  }

  return data;
}

async function meoRest(url: string, options: RequestInit, includeApiKey = false) {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  if (includeApiKey) {
    const meoApiKey = Deno.env.get("MEO_API_KEY");
    if (!meoApiKey) throw new Error("MEO_API_KEY not configured");
    headers.set("X-API-Key", meoApiKey);
  }

  const response = await fetch(url, { ...options, headers });
  const data = await safeJson(response);

  if (!response.ok) {
    if (typeof data?.raw === "string") {
      throw new Error(`MEO REST error ${response.status}: ${data.raw}`);
    }
    throw new Error(`MEO REST error ${response.status}`);
  }

  return data;
}

async function withCaseRetry(url: string, init: RequestInit) {
  let retries = 3;
  let delay = 1000;

  while (retries > 0) {
    const response = await fetch(url, init);
    if (response.status === 429 && retries > 1) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
      retries -= 1;
      continue;
    }

    const data = await safeJson(response);
    if (!response.ok) {
      if (typeof data?.raw === "string") throw new Error(`MEO REST error ${response.status}: ${data.raw}`);
      throw new Error(`MEO REST error ${response.status}`);
    }

    return data;
  }

  throw new Error("Request failed after multiple retries");
}

async function lookupDatafordeler(cvr: string) {
  const apiKey = Deno.env.get("DATAFORDELER_API_KEY");
  if (!apiKey) throw new Error("DATAFORDELER_API_KEY not configured");
  if (!/^\d{8}$/.test(cvr)) throw new Error("CVR number must be exactly 8 digits");

  const graphqlUrl = `https://graphql.datafordeler.dk/CVR/v1?apiKey=${apiKey}`;
  const now = new Date().toISOString();
  const query = `
    query HentVirksomhed($cvr: Long!) {
      CVR_Virksomhed(virkningstid: "${now}", where: { CVRNummer: { eq: $cvr } }, first: 1) {
        nodes {
          CVRNummer
          id
          status
          virksomhedStartdato
          virksomhedOphoersdato
        }
      }
      CVR_Navn(virkningstid: "${now}", where: { CVRNummer: { eq: $cvr } }, first: 10) {
        nodes {
          vaerdi
          sekvens
        }
      }
      CVR_Adressering(virkningstid: "${now}", where: { CVRNummer: { eq: $cvr } }, first: 10) {
        nodes {
          AdresseringAnvendelse
          CVRAdresse_vejnavn
          CVRAdresse_husnummerFra
          CVRAdresse_postnummer
          CVRAdresse_postdistrikt
          CVRAdresse_landekode
        }
      }
      CVR_Branche(virkningstid: "${now}", where: { CVRNummer: { eq: $cvr } }, first: 10) {
        nodes {
          vaerdi
          vaerdiTekst
          sekvens
        }
      }
      CVR_e_mailadresse(virkningstid: "${now}", where: { CVRNummer: { eq: $cvr } }, first: 5) {
        nodes {
          vaerdi
        }
      }
      CVR_Telefonnummer(virkningstid: "${now}", where: { CVRNummer: { eq: $cvr } }, first: 5) {
        nodes {
          vaerdi
        }
      }
    }
  `;

  const response = await fetch(graphqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { cvr: parseInt(cvr, 10) } }),
  });

  const data = await safeJson(response);
  if (!response.ok) throw new Error(`Datafordeler error ${response.status}`);
  if (data?.errors?.length) throw new Error(data.errors[0]?.message || "Datafordeler query failed");
  return data;
}

async function initiateAddosignForm(payload: Record<string, any>) {
  const addosignEmail = Deno.env.get("ADDOSIGN_EMAIL");
  const addosignPassword = Deno.env.get("ADDOSIGN_PASSWORD");
  if (!addosignEmail || !addosignPassword) {
    throw new Error("ADDOSIGN_EMAIL and ADDOSIGN_PASSWORD are not configured");
  }

  requireFields(payload, ["formTemplateId", "respondentName", "respondentEmail"]);

  const loginResponse = await fetch("https://demo.addosign.net/WebService/v2.0/restsigningservice.svc/Login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Email: addosignEmail, Password: addosignPassword }),
  });
  const loginData = await safeJson(loginResponse);
  if (!loginResponse.ok) throw new Error(`Addosign login failed ${loginResponse.status}`);

  const token = typeof loginData === "string" ? loginData : loginData.Token || loginData.SessionToken;
  if (!token) throw new Error("No Addosign session token returned");

  const requestBody: Record<string, any> = {
    token,
    request: {
      FormTemplateId: payload.formTemplateId,
      Respondent: {
        Name: payload.respondentName,
        Email: payload.respondentEmail,
      },
    },
  };

  if (Array.isArray(payload.componentValueOverrides) && payload.componentValueOverrides.length > 0) {
    requestBody.request.ComponentValueOverrides = payload.componentValueOverrides
      .filter((item: any) => item.componentId && item.value !== undefined)
      .map((item: any) => ({ ComponentId: item.componentId, Value: item.value }));
  }

  const response = await fetch("https://demo.addosign.net/WebService/v2.0/restsigningservice.svc/InitiateFormSigning", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  const data = await safeJson(response);
  if (!response.ok) throw new Error(`Addosign initiate failed ${response.status}`);
  return { success: true, data, requestPayload: requestBody };
}

async function handleAction(action: string, payload: Record<string, any>) {
  switch (action) {
    case "getUserDetails": {
      requireFields(payload, ["personToken"]);
      return meoRpc(MEO_RPC_CONSUMER_ADMIN, {
        jsonrpc: "2.0",
        method: "getUser",
        params: { auth: { type: "person", params: { personToken: payload.personToken } } },
        id: `meo-get-user-${crypto.randomUUID()}`,
      });
    }
    case "getAccount": {
      requireFields(payload, ["personToken", "userId"]);
      return meoRpc(MEO_RPC_CONSUMER_ADMIN, {
        jsonrpc: "2.0",
        method: "getAccount",
        params: {
          auth: { type: "person", params: { personToken: payload.personToken, userId: payload.userId } },
          propertyNames: [
            "emailId",
            "isAdminAt",
            "languageCode",
            "loginPhoneId",
            "nameId",
            "profilePictureId",
            "sso",
            "types",
            "userId",
            "uiSettings",
            "twoFactorAuthenticationMethod",
          ],
        },
        id: `meo-get-account-${crypto.randomUUID()}`,
      });
    }
    case "getData": {
      requireFields(payload, ["dataId", "personToken"]);
      return meoRpc(MEO_RPC_CONSUMER_ADMIN, {
        jsonrpc: "2.0",
        method: "getData",
        params: {
          dataId: payload.dataId,
          authType: "person",
          auth: { type: "person", params: { personToken: payload.personToken } },
        },
        id: `meo-get-data-${crypto.randomUUID()}`,
      });
    }
    case "getCustomer": {
      requireFields(payload, ["customerId", "personToken", "userId"]);
      return meoRpc(MEO_RPC_CONSUMER_ADMIN, {
        jsonrpc: "2.0",
        method: "getCustomer",
        params: {
          customerId: payload.customerId,
          auth: {
            type: "admin",
            params: { customerId: payload.customerId, personToken: payload.personToken, userId: payload.userId },
          },
        },
        id: `meo-get-customer-${crypto.randomUUID()}`,
      });
    }
    case "getGrantRequests": {
      requireFields(payload, ["personToken"]);
      return meoRpc(MEO_RPC_CONSUMER_ADMIN, {
        jsonrpc: "2.0",
        method: "getGrantRequests",
        params: {
          authType: "person",
          auth: { type: "person", params: { personToken: payload.personToken } },
        },
        id: `meo-get-grant-requests-${crypto.randomUUID()}`,
      });
    }
    case "searchUsers": {
      requireFields(payload, ["customerId", "personToken", "userId"]);
      return meoRpc(MEO_RPC_CONSUMER_ADMIN, {
        jsonrpc: "2.0",
        method: "searchUsers",
        params: {
          auth: {
            type: "admin",
            params: { customerId: payload.customerId, personToken: payload.personToken, userId: payload.userId },
          },
        },
        id: `meo-search-users-${crypto.randomUUID()}`,
      });
    }
    case "getAdmins": {
      requireFields(payload, ["customerId", "personToken", "userId"]);
      return meoRpc(MEO_RPC_CONSUMER_ADMIN, {
        jsonrpc: "2.0",
        method: "getAdmins",
        params: {
          auth: {
            type: "admin",
            params: { customerId: payload.customerId, personToken: payload.personToken, userId: payload.userId },
          },
        },
        id: `meo-get-admins-${crypto.randomUUID()}`,
      });
    }
    case "sendAdminInvite": {
      requireFields(payload, ["customerId", "personToken", "userId", "email", "name"]);
      return meoRpc(MEO_RPC_CONSUMER_ADMIN, {
        jsonrpc: "2.0",
        method: "sendAdminInvite",
        params: {
          auth: {
            type: "admin",
            params: { customerId: payload.customerId, personToken: payload.personToken, userId: payload.userId },
          },
          email: payload.email,
          name: payload.name,
          roleIds: payload.roleIds || ["CustomerAdmin"],
        },
        id: `meo-add-admin-${crypto.randomUUID()}`,
      });
    }
    case "getAdminInvites": {
      requireFields(payload, ["customerId", "personToken", "userId"]);
      return meoRpc(
        MEO_RPC_APP,
        {
          jsonrpc: "2.0",
          method: "getAdminInvites",
          params: {
            auth: {
              type: "admin",
              params: { customerId: payload.customerId, personToken: payload.personToken, userId: payload.userId },
            },
          },
          id: `meo-get-admin-invites-${crypto.randomUUID()}`,
        },
        false
      );
    }
    case "deleteAdmin": {
      requireFields(payload, ["customerId", "personToken", "userId", "adminId"]);
      return meoRpc(
        MEO_RPC_APP,
        {
          jsonrpc: "2.0",
          method: "deleteAdmin",
          params: {
            adminId: payload.adminId,
            auth: {
              type: "admin",
              params: { customerId: payload.customerId, personToken: payload.personToken, userId: payload.userId },
            },
          },
          id: `meo-delete-admin-${crypto.randomUUID()}`,
        },
        false
      );
    }
    case "deleteAdminInvite": {
      requireFields(payload, ["customerId", "personToken", "userId", "requestId"]);
      return meoRpc(
        MEO_RPC_APP,
        {
          jsonrpc: "2.0",
          method: "deleteAdminInvite",
          params: {
            requestId: payload.requestId,
            auth: {
              type: "admin",
              params: { customerId: payload.customerId, personToken: payload.personToken, userId: payload.userId },
            },
          },
          id: `meo-delete-admin-invite-${crypto.randomUUID()}`,
        },
        false
      );
    }
    case "getGrants": {
      const url = payload.userId ? `https://api.meo.health/v1/grants?userId=${encodeURIComponent(payload.userId)}` : "https://api.meo.health/v1/grants";
      const meoApiKey = Deno.env.get("MEO_API_KEY");
      if (!meoApiKey) throw new Error("MEO_API_KEY not configured");
      return meoRest(url, { method: "GET", headers: { "X-API-Key": meoApiKey } });
    }
    case "getNotifications": {
      const params = new URLSearchParams();
      if (payload.userId) params.set("userId", payload.userId);
      if (payload.unreadOnly) params.set("read", "false");
      const meoApiKey = Deno.env.get("MEO_API_KEY");
      if (!meoApiKey) throw new Error("MEO_API_KEY not configured");
      const url = `https://api.meo.health/v1/notifications${params.toString() ? `?${params.toString()}` : ""}`;
      return meoRest(url, { method: "GET", headers: { "X-API-Key": meoApiKey } });
    }
    case "getCases": {
      requireFields(payload, ["personToken", "customerId"]);
      const page = payload.page || 1;
      const limit = payload.limit || 10;
      const statuses = Array.isArray(payload.statuses) && payload.statuses.length > 0 ? payload.statuses : ["Open", "Approved", "Rejected"];
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      statuses.forEach((status: string) => params.append("status[]", status));
      return withCaseRetry(`${MEO_REST_BASE}/cases?${params.toString()}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${payload.personToken}`,
          "X-Customer-Id": payload.customerId,
          "Content-Type": "application/json",
        },
      });
    }
    case "getCase": {
      requireFields(payload, ["personToken", "customerId", "caseId"]);
      return meoRest(`${MEO_REST_BASE}/cases/${payload.caseId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${payload.personToken}`,
          "X-Customer-Id": payload.customerId,
        },
      });
    }
    case "getRiskAssessments": {
      requireFields(payload, ["personToken", "customerId", "caseId"]);
      const params = new URLSearchParams({
        page: String(payload.page || 1),
        limit: String(payload.limit || 100),
        orderColumn: payload.orderColumn || "createdAt",
        orderDirection: payload.orderDirection || "desc",
      });
      return meoRest(`${MEO_REST_BASE}/cases/${payload.caseId}/risk-assessments?${params.toString()}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${payload.personToken}`,
          "X-Customer-Id": payload.customerId,
        },
      });
    }
    case "getCheckData": {
      requireFields(payload, ["personToken", "customerId", "caseId", "checkId"]);
      return meoRest(`${MEO_REST_BASE}/cases/${payload.caseId}/checks/${payload.checkId}/data`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${payload.personToken}`,
          "X-Customer-Id": payload.customerId,
        },
      });
    }
    case "getCheckIdentities": {
      requireFields(payload, ["personToken", "customerId", "caseId", "checkId"]);
      return meoRest(`${MEO_REST_BASE}/cases/${payload.caseId}/checks/${payload.checkId}/identities`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${payload.personToken}`,
          "X-Customer-Id": payload.customerId,
        },
      });
    }
    case "getEntityCustomProperties": {
      requireFields(payload, ["personToken", "customerId", "entityId"]);
      const page = payload.page || 1;
      const limit = payload.limit || 100;
      return meoRest(`${MEO_REST_BASE}/entities/${payload.entityId}/custom-properties?page=${page}&limit=${limit}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${payload.personToken}`,
          "X-Customer-Id": payload.customerId,
        },
      });
    }
    case "getEntityUserdata": {
      requireFields(payload, ["personToken", "customerId", "entityId"]);
      const baseUrl = `${MEO_REST_BASE}/entities/${payload.entityId}/userdata?format[]=image%2Fpng&format[]=image%2Fjpeg&format[]=application%2Fpdf`;
      const firstPage = await meoRest(`${baseUrl}&limit=100&page=1`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${payload.personToken}`,
          "X-Customer-Id": payload.customerId,
        },
      });
      if (!firstPage?.data?.length) return { data: [], pagination: { total: 0, page: 1, pageCount: 0 } };
      let allData = [...firstPage.data];
      const pageCount = firstPage.pagination?.pageCount || 1;
      if (pageCount > 1) {
        const remaining = await Promise.all(
          Array.from({ length: pageCount - 1 }, (_, index) =>
            meoRest(`${baseUrl}&limit=100&page=${index + 2}`, {
              method: "GET",
              headers: {
                Authorization: `Bearer ${payload.personToken}`,
                "X-Customer-Id": payload.customerId,
              },
            })
          )
        );
        remaining.forEach((pageData) => {
          if (Array.isArray(pageData?.data)) allData = allData.concat(pageData.data);
        });
      }
      return { data: allData, pagination: { total: allData.length, page: 1, pageCount: 1 } };
    }
    case "createCase": {
      requireFields(payload, ["personToken", "customerId", "caseData"]);
      return withCaseRetry(`${MEO_REST_BASE}/cases`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${payload.personToken}`,
          "X-Customer-Id": payload.customerId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload.caseData),
      });
    }
    case "createEntities": {
      requireFields(payload, ["personToken", "customerId", "caseId", "entities"]);
      const entities = Array.isArray(payload.entities)
        ? payload.entities.map((entity: any) => {
            const { relations, ...rest } = entity || {};
            if (!rest.relationsIdentifier || (typeof rest.relationsIdentifier === "string" && !rest.relationsIdentifier.trim())) {
              rest.relationsIdentifier = rest.name || "entity";
            }
            return rest;
          })
        : payload.entities;
      return meoRest(`${MEO_REST_BASE}/cases/${payload.caseId}/entities`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${payload.personToken}`,
          "X-Customer-Id": payload.customerId,
        },
        body: JSON.stringify({ entities }),
      }, true);
    }
    case "updateEntity": {
      requireFields(payload, ["personToken", "customerId", "entityId", "entityData"]);
      const candidateUrls = Array.from(
        new Set([
          payload.caseId ? `${MEO_REST_BASE}/cases/${payload.caseId}/entities/${payload.entityId}` : null,
          `${MEO_REST_BASE}/entities/${payload.entityId}`,
        ].filter(Boolean))
      ) as string[];

      for (const url of candidateUrls) {
        for (const method of ["PATCH", "PUT", "POST"]) {
          try {
            return await meoRest(
              url,
              {
                method,
                headers: {
                  Authorization: `Bearer ${payload.personToken}`,
                  "X-Customer-Id": payload.customerId,
                },
                body: JSON.stringify(payload.entityData),
              },
              true
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : "Request failed";
            if (!message.includes("404") && !message.includes("405")) throw error;
          }
        }
      }
      throw new Error("All update entity endpoint combinations returned 404 or 405");
    }
    case "updateEntityRelations": {
      requireFields(payload, ["personToken", "customerId", "caseId", "entityId", "relations"]);
      const subjectId = payload.caseEntityId || payload.entityId;
      const requestHeaders = {
        Authorization: `Bearer ${payload.personToken}`,
        "X-Customer-Id": payload.customerId,
      };

      for (const url of [`${MEO_REST_BASE}/cases/${payload.caseId}/entities/${subjectId}`, `${MEO_REST_BASE}/cases/${payload.caseId}/entities/${subjectId}/relations`]) {
        for (const method of ["PATCH", "PUT", "POST"]) {
          try {
            return await meoRest(
              url,
              {
                method,
                headers: requestHeaders,
                body: JSON.stringify(url.endsWith("/relations") ? { relations: payload.relations } : { relations: payload.relations }),
              },
              true
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : "Request failed";
            if (!message.includes("404") && !message.includes("405")) throw error;
          }
        }
      }
      throw new Error("All relation update endpoint combinations returned 404 or 405");
    }
    case "setEntityCustomProperties": {
      requireFields(payload, ["personToken", "customerId", "entityId", "customProperties"]);
      for (const method of ["POST", "PATCH", "PUT"]) {
        try {
          return await meoRest(
            `${MEO_REST_BASE}/entities/${payload.entityId}/custom-properties`,
            {
              method,
              headers: {
                Authorization: `Bearer ${payload.personToken}`,
                "X-Customer-Id": payload.customerId,
              },
              body: JSON.stringify(payload.customProperties),
            },
            true
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Request failed";
          if (!message.includes("400") && !message.includes("405")) throw error;
        }
      }
      throw new Error("Failed to set custom properties");
    }
    case "uploadEntityDocument": {
      requireFields(payload, ["personToken", "customerId", "entityId", "type", "filename", "format", "data"]);
      const allowedFormats = ["application/json", "application/pdf", "text/plain", "image/jpeg", "image/png"];
      const format = allowedFormats.includes(payload.format) ? payload.format : "auto";
      return meoRest(`${MEO_REST_BASE}/entities/${payload.entityId}/userdata`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${payload.personToken}`,
          "X-Customer-Id": payload.customerId,
        },
        body: JSON.stringify({ data: payload.data, filename: payload.filename, format, type: payload.type }),
      });
    }
    case "datafordelerCvr": {
      requireFields(payload, ["cvr"]);
      return lookupDatafordeler(payload.cvr);
    }
    case "initiateFormSigning": {
      return initiateAddosignForm(payload);
    }
    default:
      throw new Error(`Unsupported action: ${action}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, payload = {} } = (await req.json()) as RequestPayload;
    if (!action) return json({ error: "action is required" }, 400);
    const result = await handleAction(action, payload);
    return json(result, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
