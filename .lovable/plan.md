

## Plan: Remove Lovable AI fallback — require custom AI endpoint

**Goal**: The system should only work with a user-configured custom AI endpoint. Remove the Lovable AI gateway fallback entirely, and make the endpoint/API key fields required.

### Changes

**1. Backend: `supabase/functions/ai-search/index.ts`**
- Remove the `else` branch (lines 61-72) that falls back to Lovable AI gateway
- Instead, if `ai_endpoint_url` is missing/empty, return an error: "AI endpoint not configured. Please set a custom AI endpoint in the function settings."
- Remove the `useCustomAi` variable — custom is now the only path

**2. Frontend: `src/pages/AiSearchConfig.tsx`**
- Update the AI Model tab title from "Custom AI Model" to "AI Model"
- Remove the CardDescription text referencing Lovable AI gateway (line 377)
- Replace with: "Configure the AI model endpoint for this function. An endpoint URL and API key are required."
- Add a visual indicator (e.g. destructive badge or warning) when endpoint URL is empty, so users know it must be filled in
- Remove the "Custom AI" badge (lines 407-411) — replace with a simple "Connected" badge or remove entirely

### No other files need changes

The `AiAdmin.tsx` runner already passes through whatever endpoint config is saved — no changes needed there.

