import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type SourceType = "search" | "scrape" | "file_download";

type SearchSource = {
  url: string;
  type: SourceType;
  description?: string;
};

function normalizeSource(item: any): SearchSource {
  if (typeof item === "string") {
    return { url: item, type: "search", description: "" };
  }
  return {
    url: item.url || "",
    type: item.type || "search",
    description: item.description || "",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { client_data, search_urls, prompt_template, ai_endpoint_url, ai_api_key, ai_model } = await req.json();

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "Firecrawl connector not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine AI endpoint: use custom if provided, else Lovable AI gateway
    const useCustomAi = !!ai_endpoint_url;
    let aiEndpoint: string;
    let aiApiKey: string;
    let aiModelName: string;

    if (useCustomAi) {
      // Ensure the endpoint ends with /chat/completions for OpenAI-compatible APIs
      let baseUrl = ai_endpoint_url.replace(/\/+$/, "");
      if (!baseUrl.endsWith("/chat/completions")) {
        baseUrl += "/chat/completions";
      }
      aiEndpoint = baseUrl;
      aiApiKey = ai_api_key || "";
      aiModelName = ai_model || "";
    } else {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        return new Response(
          JSON.stringify({ success: false, error: "AI gateway not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      aiEndpoint = "https://ai.gateway.lovable.dev/v1/chat/completions";
      aiApiKey = LOVABLE_API_KEY;
      aiModelName = "google/gemini-2.5-flash";
    }

    // Step 1: Build the prompt by replacing {{variables}}
    let prompt = prompt_template || "";
    for (const [key, value] of Object.entries(client_data || {})) {
      prompt = prompt.replaceAll(`{{${key}}}`, String(value));
    }

    console.log("Prompt:", prompt);

    // Step 2: Normalize sources
    const sources: SearchSource[] = (search_urls || []).map(normalizeSource);
    console.log("Sources:", JSON.stringify(sources));

    // Step 3: Process each source based on its type
    const scrapeResults: { url: string; type: SourceType; content: string; error?: string }[] = [];

    const processPromises = sources.map(async (source) => {
      try {
        let formattedUrl = source.url.trim();
        if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
          formattedUrl = `https://${formattedUrl}`;
        }

        const domain = new URL(formattedUrl).hostname;

        if (source.type === "search") {
          // Web search: use Firecrawl search API to find relevant pages on the domain
          const searchQuery = `site:${domain} ${client_data?.name || ""} ${client_data?.company || ""}`.trim();
          console.log(`[search] Searching ${domain}:`, searchQuery);

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
            console.error(`Firecrawl search error for ${domain}:`, data);
            scrapeResults.push({ url: formattedUrl, type: source.type, content: "", error: data.error || `Status ${response.status}` });
            return;
          }

          const combinedContent = (data.data || [])
            .map((r: any) => `## ${r.title || r.url}\nSource: ${r.url}\n\n${r.markdown || r.description || "No content"}`)
            .join("\n\n---\n\n");

          scrapeResults.push({ url: formattedUrl, type: source.type, content: combinedContent || "No results found" });

        } else if (source.type === "scrape") {
          // Direct scrape: extract content from the exact URL
          console.log(`[scrape] Scraping ${formattedUrl}`);

          const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: formattedUrl,
              formats: ["markdown"],
              onlyMainContent: true,
            }),
          });

          const data = await response.json();
          if (!response.ok) {
            console.error(`Firecrawl scrape error for ${formattedUrl}:`, data);
            scrapeResults.push({ url: formattedUrl, type: source.type, content: "", error: data.error || `Status ${response.status}` });
            return;
          }

          const markdown = data.data?.markdown || data.markdown || "";
          scrapeResults.push({ url: formattedUrl, type: source.type, content: markdown || "No content extracted" });

        } else if (source.type === "file_download") {
          // File download: scrape the page to find downloadable file links, then extract content
          console.log(`[file_download] Processing ${formattedUrl}`);

          // First, scrape the page to get its content and links
          const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: formattedUrl,
              formats: ["markdown", "links"],
              onlyMainContent: false,
            }),
          });

          const data = await response.json();
          if (!response.ok) {
            console.error(`Firecrawl scrape error for ${formattedUrl}:`, data);
            scrapeResults.push({ url: formattedUrl, type: source.type, content: "", error: data.error || `Status ${response.status}` });
            return;
          }

          const pageMarkdown = data.data?.markdown || data.markdown || "";
          const links: string[] = data.data?.links || data.links || [];

          // Find downloadable file links (Excel, CSV, PDF)
          const fileExtensions = [".xlsx", ".xls", ".csv", ".pdf", ".zip"];
          const fileLinks = links.filter((link: string) =>
            fileExtensions.some((ext) => link.toLowerCase().includes(ext))
          );

          let content = `## Page Content\n${pageMarkdown}`;

          if (fileLinks.length > 0) {
            content += `\n\n## Downloadable Files Found\n${fileLinks.map((l: string) => `- ${l}`).join("\n")}`;

            // Try to scrape each file link for content
            for (const fileLink of fileLinks.slice(0, 2)) {
              try {
                console.log(`[file_download] Attempting to extract content from: ${fileLink}`);
                const fileResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    url: fileLink,
                    formats: ["markdown"],
                  }),
                });

                if (fileResponse.ok) {
                  const fileData = await fileResponse.json();
                  const fileContent = fileData.data?.markdown || fileData.markdown || "";
                  if (fileContent) {
                    content += `\n\n## File Content: ${fileLink}\n${fileContent}`;
                  }
                }
              } catch (fileErr) {
                console.error(`Error extracting file ${fileLink}:`, fileErr);
              }
            }
          }

          scrapeResults.push({
            url: formattedUrl,
            type: source.type,
            content: content || "No content found",
          });
        }
      } catch (err) {
        console.error(`Error processing ${source.url}:`, err);
        scrapeResults.push({ url: source.url, type: source.type, content: "", error: String(err) });
      }
    });

    await Promise.all(processPromises);

    // Step 4: Synthesize with Lovable AI
    const scrapedContext = scrapeResults
      .map((r) => {
        const typeLabel = r.type === "search" ? "🔍 Search" : r.type === "scrape" ? "📄 Scrape" : "📥 File Download";
        if (r.error) return `### ${typeLabel} — ${r.url}\n⚠️ Error: ${r.error}`;
        return `### ${typeLabel} — ${r.url}\n${r.content}`;
      })
      .join("\n\n---\n\n");

    console.log("Sending to AI for synthesis, context length:", scrapedContext.length);

    const aiResponse = await fetch(aiEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiModelName || undefined,
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
        type: r.type,
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
