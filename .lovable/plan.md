

## Plan: Stream AI results in real-time to the UI

**Goal**: Instead of waiting for the entire AI response to complete before showing results, stream the synthesis text token-by-token into the results panel as it arrives.

### Changes

**1. Backend: `supabase/functions/ai-search/index.ts`**
- Instead of collecting the full streamed response and returning JSON at the end, pass the SSE stream directly through to the client
- Return the AI provider's SSE stream with `text/event-stream` content type
- Send source metadata as a final custom SSE event after the AI stream completes

**2. Frontend: `src/pages/AiAdmin.tsx`**
- Replace `supabase.functions.invoke()` with a direct `fetch()` call to the edge function (since `invoke` doesn't support streaming)
- Read the response as a stream using `getReader()` and parse SSE chunks
- Update a `streamedSynthesis` state incrementally as tokens arrive, rendering them in the results panel in real-time
- Render the streamed text with `ReactMarkdown` (already used in ChatPlayground)
- After stream completes, save the full result to `ai_search_results` as before

### Result
- Users see AI output appearing word-by-word as it generates
- Same approach already used in ChatPlayground, applied here to AI search

