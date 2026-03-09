import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Database, Server, Shield, Webhook, Code2 } from "lucide-react";

const CodeBlock = ({ children, title }: { children: string; title?: string }) => (
  <div className="rounded-lg border bg-muted overflow-hidden">
    {title && (
      <div className="border-b px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/50">
        {title}
      </div>
    )}
    <pre className="overflow-auto p-4 text-xs font-mono leading-relaxed">{children}</pre>
  </div>
);

export default function Integration() {
  const [lastRefresh, setLastRefresh] = useState(new Date());

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              MEO Backend Integration
            </h1>
            <p className="text-muted-foreground">
              Specification for what the MEO backend must implement to support AI services.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Last updated: {lastRefresh.toLocaleString()}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setLastRefresh(new Date())}
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        <Tabs defaultValue="schema" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="schema" className="gap-2">
              <Database className="h-4 w-4" />
              Schema
            </TabsTrigger>
            <TabsTrigger value="endpoints" className="gap-2">
              <Server className="h-4 w-4" />
              Endpoints
            </TabsTrigger>
            <TabsTrigger value="auth" className="gap-2">
              <Shield className="h-4 w-4" />
              Auth
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-2">
              <Webhook className="h-4 w-4" />
              Webhooks
            </TabsTrigger>
            <TabsTrigger value="examples" className="gap-2">
              <Code2 className="h-4 w-4" />
              Examples
            </TabsTrigger>
          </TabsList>

          {/* Database Schema */}
          <TabsContent value="schema">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Badge>Table</Badge>
                    ai_functions
                  </CardTitle>
                  <CardDescription>Registry of available AI functions per workspace</CardDescription>
                </CardHeader>
                <CardContent>
                  <CodeBlock title="SQL Schema">{`CREATE TABLE ai_functions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name        TEXT NOT NULL,
  description TEXT,
  type        TEXT NOT NULL CHECK (type IN (
                'external_search', 'summarizer', 'classifier', 'custom'
              )),
  enabled     BOOLEAN NOT NULL DEFAULT false,
  icon        TEXT DEFAULT 'search',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for workspace lookup
CREATE INDEX idx_ai_functions_workspace 
  ON ai_functions(workspace_id);`}</CodeBlock>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Badge>Table</Badge>
                    ai_search_configs
                  </CardTitle>
                  <CardDescription>Search configuration per AI function</CardDescription>
                </CardHeader>
                <CardContent>
                  <CodeBlock title="SQL Schema">{`CREATE TABLE ai_search_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_id     UUID NOT NULL REFERENCES ai_functions(id) ON DELETE CASCADE,
  search_urls     JSONB NOT NULL DEFAULT '[]',
  prompt_template TEXT NOT NULL DEFAULT '',
  client_fields   JSONB NOT NULL DEFAULT '[]',
  -- client_fields format:
  -- [{"key": "name", "label": "Name", "type": "text", "required": true}]
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_search_configs_function 
  ON ai_search_configs(function_id);`}</CodeBlock>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Badge>Table</Badge>
                    ai_search_results
                  </CardTitle>
                  <CardDescription>Search execution history and results</CardDescription>
                </CardHeader>
                <CardContent>
                  <CodeBlock title="SQL Schema">{`CREATE TABLE ai_search_results (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id   UUID NOT NULL REFERENCES ai_search_configs(id) ON DELETE CASCADE,
  client_data JSONB NOT NULL DEFAULT '{}',
  results     JSONB NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'pending' 
              CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_search_results_config 
  ON ai_search_results(config_id);
CREATE INDEX idx_search_results_status 
  ON ai_search_results(status);`}</CodeBlock>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* API Endpoints */}
          <TabsContent value="endpoints">
            <div className="space-y-6">
              {[
                {
                  method: "GET",
                  path: "/api/v1/ai/functions",
                  desc: "List all AI functions for a workspace",
                  params: "workspace_id (query)",
                  response: `{
  "data": [{
    "id": "uuid",
    "name": "External AI Search",
    "type": "external_search",
    "enabled": true,
    "description": "...",
    "icon": "globe-search"
  }]
}`,
                },
                {
                  method: "PATCH",
                  path: "/api/v1/ai/functions/:id",
                  desc: "Update AI function (enable/disable)",
                  params: "id (path)",
                  response: `// Request body
{ "enabled": true }

// Response
{ "data": { "id": "uuid", "enabled": true } }`,
                },
                {
                  method: "GET",
                  path: "/api/v1/ai/search/config/:function_id",
                  desc: "Get search configuration for a function",
                  params: "function_id (path)",
                  response: `{
  "data": {
    "id": "uuid",
    "search_urls": ["https://linkedin.com", "https://crunchbase.com"],
    "prompt_template": "Find info about {{name}}...",
    "client_fields": [
      {"key": "name", "label": "Name", "type": "text", "required": true}
    ]
  }
}`,
                },
                {
                  method: "PUT",
                  path: "/api/v1/ai/search/config/:id",
                  desc: "Update search configuration",
                  params: "id (path)",
                  response: `// Request body
{
  "search_urls": ["https://linkedin.com"],
  "prompt_template": "...",
  "client_fields": [...]
}`,
                },
                {
                  method: "POST",
                  path: "/api/v1/ai/search/execute",
                  desc: "Execute an AI search",
                  params: "config_id, client_data (body)",
                  response: `// Request body
{
  "config_id": "uuid",
  "client_data": {
    "name": "John Doe",
    "company": "Acme Inc"
  }
}

// Response
{
  "data": {
    "id": "result-uuid",
    "status": "completed",
    "results": {
      "summary": "...",
      "sources": [...],
      "findings": [...]
    }
  }
}`,
                },
                {
                  method: "GET",
                  path: "/api/v1/ai/search/results",
                  desc: "List search results history",
                  params: "config_id (query), limit (query), offset (query)",
                  response: `{
  "data": [{
    "id": "uuid",
    "client_data": {...},
    "status": "completed",
    "created_at": "2026-03-09T..."
  }],
  "total": 42
}`,
                },
              ].map((endpoint, i) => (
                <Card key={i}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Badge
                        variant={endpoint.method === "GET" ? "secondary" : "default"}
                        className="font-mono"
                      >
                        {endpoint.method}
                      </Badge>
                      <code className="text-sm">{endpoint.path}</code>
                    </CardTitle>
                    <CardDescription>{endpoint.desc}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-xs text-muted-foreground">
                      <strong>Parameters:</strong> {endpoint.params}
                    </div>
                    <CodeBlock title="Response">{endpoint.response}</CodeBlock>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Auth Requirements */}
          <TabsContent value="auth">
            <Card>
              <CardHeader>
                <CardTitle>Authentication Requirements</CardTitle>
                <CardDescription>
                  How the MEO backend should authenticate requests to AI services.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <h3 className="font-semibold">1. Workspace-scoped Access</h3>
                  <p className="text-sm text-muted-foreground">
                    All AI function operations must be scoped to a workspace. The authenticated user 
                    must be a member (ideally owner/admin) of the workspace to manage AI functions.
                  </p>
                  <CodeBlock title="Middleware Example">{`// Express middleware
async function requireWorkspaceAdmin(req, res, next) {
  const userId = req.auth.userId;
  const workspaceId = req.params.workspaceId || req.query.workspace_id;
  
  const membership = await db.query(
    'SELECT role FROM workspace_members WHERE user_id = $1 AND workspace_id = $2',
    [userId, workspaceId]
  );
  
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  
  req.workspace = { id: workspaceId };
  next();
}`}</CodeBlock>
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold">2. API Key for External Services</h3>
                  <p className="text-sm text-muted-foreground">
                    Store API keys (Firecrawl, Perplexity) as encrypted secrets in the MEO backend. 
                    Never expose them to the frontend.
                  </p>
                  <CodeBlock title="Secrets Table">{`CREATE TABLE workspace_secrets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  key_name     TEXT NOT NULL, -- e.g., 'FIRECRAWL_API_KEY'
  encrypted_value BYTEA NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, key_name)
);`}</CodeBlock>
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold">3. Rate Limiting</h3>
                  <p className="text-sm text-muted-foreground">
                    Implement rate limiting per workspace to prevent abuse of AI search functionality.
                  </p>
                  <CodeBlock>{`// Recommended limits:
// - Search execution: 100 requests/hour per workspace
// - Config updates: 30 requests/minute per workspace
// - Function toggles: 10 requests/minute per workspace`}</CodeBlock>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Webhooks */}
          <TabsContent value="webhooks">
            <Card>
              <CardHeader>
                <CardTitle>Webhook / Callback Patterns</CardTitle>
                <CardDescription>
                  For long-running AI searches, use webhooks to notify the frontend when results are ready.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <h3 className="font-semibold">Search Completion Webhook</h3>
                  <p className="text-sm text-muted-foreground">
                    When an AI search completes, send a webhook or use WebSockets/SSE to notify the client.
                  </p>
                  <CodeBlock title="Webhook Payload">{`POST /webhooks/ai-search-complete
Content-Type: application/json
X-MEO-Signature: sha256=...

{
  "event": "ai_search.completed",
  "data": {
    "result_id": "uuid",
    "config_id": "uuid",
    "workspace_id": "uuid",
    "status": "completed",
    "summary": "Found 12 relevant findings...",
    "created_at": "2026-03-09T10:00:00Z"
  }
}`}</CodeBlock>
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold">Alternative: Server-Sent Events</h3>
                  <CodeBlock title="SSE Stream">{`GET /api/v1/ai/search/stream/:result_id
Accept: text/event-stream

// Server sends:
data: {"status": "running", "progress": 30, "message": "Scraping linkedin.com..."}

data: {"status": "running", "progress": 60, "message": "Synthesizing results..."}

data: {"status": "completed", "progress": 100, "results": {...}}`}</CodeBlock>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Examples */}
          <TabsContent value="examples">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Full Search Flow Example</CardTitle>
                  <CardDescription>End-to-end example of executing an AI search from the frontend</CardDescription>
                </CardHeader>
                <CardContent>
                  <CodeBlock title="Frontend API Client (TypeScript)">{`// lib/meo-ai-api.ts

const API_BASE = '/api/v1/ai';

export const meoAiApi = {
  // Get all AI functions for workspace
  async getFunctions(workspaceId: string) {
    const res = await fetch(
      \`\${API_BASE}/functions?workspace_id=\${workspaceId}\`,
      { headers: authHeaders() }
    );
    return res.json();
  },

  // Toggle function on/off
  async toggleFunction(functionId: string, enabled: boolean) {
    const res = await fetch(\`\${API_BASE}/functions/\${functionId}\`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return res.json();
  },

  // Execute AI search
  async executeSearch(configId: string, clientData: Record<string, string>) {
    const res = await fetch(\`\${API_BASE}/search/execute\`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ config_id: configId, client_data: clientData }),
    });
    return res.json();
  },

  // Get search config
  async getSearchConfig(functionId: string) {
    const res = await fetch(
      \`\${API_BASE}/search/config/\${functionId}\`,
      { headers: authHeaders() }
    );
    return res.json();
  },

  // Update search config
  async updateSearchConfig(configId: string, config: any) {
    const res = await fetch(\`\${API_BASE}/search/config/\${configId}\`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    return res.json();
  },
};`}</CodeBlock>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Backend Search Orchestrator</CardTitle>
                  <CardDescription>Example Node.js implementation of the search execution endpoint</CardDescription>
                </CardHeader>
                <CardContent>
                  <CodeBlock title="Backend Handler (Node.js)">{`// routes/ai-search.ts
import { Firecrawl } from '@firecrawl/sdk';
import { PerplexityClient } from 'perplexity-sdk';

export async function executeSearch(req, res) {
  const { config_id, client_data } = req.body;
  
  // 1. Load config
  const config = await db.query(
    'SELECT * FROM ai_search_configs WHERE id = $1', [config_id]
  );
  
  // 2. Create result record
  const result = await db.query(
    'INSERT INTO ai_search_results (config_id, client_data, status) VALUES ($1, $2, $3) RETURNING id',
    [config_id, client_data, 'running']
  );
  
  // 3. Build prompt from template
  let prompt = config.prompt_template;
  for (const [key, value] of Object.entries(client_data)) {
    prompt = prompt.replace(\`{{\${key}}}\`, value);
  }
  
  // 4. Scrape configured URLs with Firecrawl
  const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
  const scrapedData = await Promise.all(
    config.search_urls.map(url => 
      firecrawl.scrape(url + '/' + encodeURIComponent(client_data.name), {
        formats: ['markdown']
      })
    )
  );
  
  // 5. Synthesize with Perplexity
  const perplexity = new PerplexityClient({ apiKey: process.env.PERPLEXITY_API_KEY });
  const synthesis = await perplexity.chat({
    model: 'sonar-pro',
    messages: [{
      role: 'system',
      content: 'You are a research assistant. Analyze the following scraped data and provide a structured summary.'
    }, {
      role: 'user', 
      content: prompt + '\\n\\nScraped data:\\n' + scrapedData.map(d => d.markdown).join('\\n---\\n')
    }]
  });
  
  // 6. Update result
  await db.query(
    'UPDATE ai_search_results SET results = $1, status = $2 WHERE id = $3',
    [{ summary: synthesis.content, sources: config.search_urls, scraped: scrapedData }, 'completed', result.id]
  );
  
  return res.json({ data: { id: result.id, status: 'completed', results: synthesis } });
}`}</CodeBlock>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
