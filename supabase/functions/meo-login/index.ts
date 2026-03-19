import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MEO_LOGIN_ENDPOINT = "https://app.meo.io/client-proxy/identima-app";
const TWO_FACTOR_STATES = new Set(["SentCode", "AwaitCode"]);

type MeoRequestBody = {
  email?: string;
  password?: string;
  personToken?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, password, personToken = "" } = (await req.json()) as MeoRequestBody;

    if (!email?.trim() || !password) {
      return jsonResponse({ error: "Email and password are required." }, 400);
    }

    const meoApiKey = Deno.env.get("MEO_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!meoApiKey || !supabaseUrl || !supabaseServiceRoleKey) {
      return jsonResponse({ error: "Authentication bridge is not configured." }, 500);
    }

    const loginPayload = {
      method: "login",
      params: {
        email: email.trim(),
        password,
        sessionDuration: 86400,
        ...(personToken ? { loginCode: personToken } : {}),
        auth: {
          type: "application",
          params: {
            userId: meoApiKey,
            personToken: "",
          },
        },
      },
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
    };

    const meoResponse = await fetch(MEO_LOGIN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginPayload),
    });

    const meoData = await meoResponse.json().catch(() => ({}));
    const meoState = meoData?.result?.state;

    if (TWO_FACTOR_STATES.has(meoState)) {
      return jsonResponse({
        success: false,
        requires2FA: true,
        state: meoState,
        error: "Two-factor authentication required.",
      });
    }

    if (!meoResponse.ok || meoData?.error) {
      return jsonResponse(
        {
          error: meoData?.error?.message || "Authentication failed.",
        },
        401
      );
    }

    const meoAccessToken = meoData?.result?.accessToken || meoData?.result?.token || meoData?.result?.personToken;
    const meoUserId = meoData?.result?.userId || meoData?.result?.user?.id || null;

    if (!meoAccessToken) {
      return jsonResponse({ error: "Authentication service did not return an access token." }, 502);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const normalizedEmail = email.trim().toLowerCase();

    const { data: listedUsers, error: listUsersError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listUsersError) {
      return jsonResponse({ error: "Failed to look up the workspace user." }, 500);
    }

    const existingUser = listedUsers.users.find((user) => user.email?.toLowerCase() === normalizedEmail);

    const authPayload = {
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        meo_user_id: meoUserId,
      },
    };

    let syncedUser = existingUser;

    if (!existingUser) {
      const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser(authPayload);

      if (createUserError || !createdUser.user) {
        return jsonResponse({ error: "Failed to provision the workspace account." }, 500);
      }

      syncedUser = createdUser.user;
    } else {
      const { data: updatedUser, error: updateUserError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, authPayload);

      if (updateUserError || !updatedUser.user) {
        return jsonResponse({ error: "Failed to update the workspace account." }, 500);
      }

      syncedUser = updatedUser.user;
    }

    return jsonResponse({
      success: true,
      meoAccessToken,
      meoUserId,
      user: {
        id: syncedUser.id,
        email: syncedUser.email,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
