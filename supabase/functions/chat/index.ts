import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, model, provider, custom_endpoint, custom_api_key } = await req.json();

    let endpoint: string;
    let apiKey: string;
    let modelName: string;

    if (provider === "custom") {
      if (!custom_endpoint) {
        return new Response(JSON.stringify({ error: "Custom endpoint URL is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      let baseUrl = custom_endpoint.replace(/\/+$/, "");
      if (!baseUrl.endsWith("/chat/completions")) {
        baseUrl += "/chat/completions";
      }
      endpoint = baseUrl;
      apiKey = custom_api_key || Deno.env.get("MEO_API_KEY") || "";
      modelName = model || "";
    } else {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      endpoint = "https://ai.gateway.lovable.dev/v1/chat/completions";
      apiKey = LOVABLE_API_KEY;
      modelName = model || "google/gemini-3-flash-preview";
    }

    console.log(`Chat request: provider=${provider}, model=${modelName}, endpoint=${endpoint}, hasApiKey=${!!apiKey}`);

    let response: Response;
    const fetchHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    if (apiKey) {
      // For MEO endpoints, send both header styles to cover nginx proxy + app auth
      if (endpoint.includes("meo.io")) {
        fetchHeaders["Authorization"] = `Bearer ${apiKey}`;
        fetchHeaders["X-API-Key"] = apiKey;
      } else {
        fetchHeaders["Authorization"] = `Bearer ${apiKey}`;
      }
    }

    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: fetchHeaders,
        body: JSON.stringify({
          model: modelName || undefined,
          messages,
          stream: true,
        }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: `Connection failed: ${message}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `AI error (${response.status}): ${errText.substring(0, 200)}` }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
