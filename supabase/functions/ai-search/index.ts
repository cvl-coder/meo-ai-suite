import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { client_data, search_urls, prompt_template } = await req.json();

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "Firecrawl connector not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "AI gateway not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Build the prompt by replacing {{variables}}
    let prompt = prompt_template || "";
    for (const [key, value] of Object.entries(client_data || {})) {
      prompt = prompt.replaceAll(`{{${key}}}`, String(value));
    }

    console.log("Prompt:", prompt);
    console.log("URLs to scrape:", search_urls);

    // Step 2: Scrape all configured URLs with Firecrawl
    const scrapeResults: { url: string; content: string; error?: string }[] = [];

    const scrapePromises = (search_urls || []).map(async (url: string) => {
      try {
        let formattedUrl = url.trim();
        if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
          formattedUrl = `https://${formattedUrl}`;
        }

        // Use Firecrawl search with the client data as context for each URL domain
        const domain = new URL(formattedUrl).hostname;
        const searchQuery = `site:${domain} ${client_data?.name || ""} ${client_data?.company || ""}`.trim();

        console.log(`Searching ${domain}:`, searchQuery);

        const response = await fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: searchQuery,
            limit: 3,
            scrapeOptions: { formats: ["markdown"] },
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          console.error(`Firecrawl error for ${domain}:`, data);
          scrapeResults.push({ url: formattedUrl, content: "", error: data.error || `Status ${response.status}` });
          return;
        }

        // Combine search results markdown
        const combinedContent = (data.data || [])
          .map((r: any) => `## ${r.title || r.url}\nSource: ${r.url}\n\n${r.markdown || r.description || "No content"}`)
          .join("\n\n---\n\n");

        scrapeResults.push({ url: formattedUrl, content: combinedContent || "No results found" });
      } catch (err) {
        console.error(`Error scraping ${url}:`, err);
        scrapeResults.push({ url, content: "", error: String(err) });
      }
    });

    await Promise.all(scrapePromises);

    // Step 3: Synthesize with Lovable AI
    const scrapedContext = scrapeResults
      .map((r) => {
        if (r.error) return `### Source: ${r.url}\n⚠️ Error: ${r.error}`;
        return `### Source: ${r.url}\n${r.content}`;
      })
      .join("\n\n---\n\n");

    console.log("Sending to AI for synthesis, context length:", scrapedContext.length);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are an AI research assistant for MEO workspace. Synthesize the scraped web content to answer the user's research prompt. Provide structured, actionable findings with source citations. Format your response as markdown with clear sections.",
          },
          {
            role: "user",
            content: `## Research Prompt\n${prompt}\n\n## Scraped Data from Sources\n${scrapedContext}`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "AI rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: "AI credits exhausted. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: "AI synthesis failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const synthesis = aiData.choices?.[0]?.message?.content || "No synthesis generated";

    const result = {
      success: true,
      synthesis,
      sources: scrapeResults.map((r) => ({
        url: r.url,
        hasContent: !!r.content && !r.error,
        error: r.error || null,
      })),
      prompt_used: prompt,
    };

    console.log("Search completed successfully");

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ai-search error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
