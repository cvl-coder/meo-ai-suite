## Goal

Route the three Risk Assessment AI calls (per-question "Generate supporting text", per-question summary, and overall conclusion summary) to:

```
POST https://new-api.meo.io/ai/chat
Authorization: Bearer <user MEO JWT from localStorage>
Content-Type: application/json

{ "model": "llama3.2:3b", "messages": [ {role, content}, ... ] }
```

Non-streaming. Spinner until full response arrives, then drop the text into the textarea.

Chat Playground and any other AI calls stay on the existing `chat` edge function / `core.meo.io`.

## Confirmed contract (from your sample)

- OpenAI-style body: `{ model, messages: [{role, content}] }`.
- Defaults assumed (verify on first live call):
  - `stream: false` returns full JSON.
  - Response shape `choices[0].message.content` (standard OpenAI). If new-api returns something different (e.g. `output` / `text`), the only place to fix is the adapter in Step 2.
- Models: catalog appears different (`llama3.2:3b` in your sample vs. the old `gemma2:9b` / `qwen3:14b` set). See Step 4.

## Step 1 — New client helper `src/lib/meoAiChat.ts`

Single function:

```ts
callMeoAiChat({
  system: string,
  user: string,
  model: string,
}): Promise<{ text: string; raw: unknown }>
```

Behavior:
- Read MEO JWT via `getMeoToken()`; if missing or `isMeoTokenValid()` is false → throw a friendly error.
- `POST https://new-api.meo.io/ai/chat` with:
  - `Authorization: Bearer <token>`
  - (defensive) `X-API-Key: <token>` in case nginx still wants both — harmless if ignored
  - `Content-Type: application/json`
  - Body: `{ model, messages: [{role:"system", content:system},{role:"user", content:user}], stream: false }`
- Await full JSON. Extract text: prefer `choices[0].message.content`, fall back to `output` / `text` / `message` / stringified body so a contract drift surfaces as visible text rather than a silent empty string.
- Return `{ text, raw }`.

No edge function changes. No new Supabase secret. No proxy. Browser → MEO directly with the logged-in user's token.

## Step 2 — Switch the three call sites in `src/pages/RiskAssessmentProcess.tsx`

Today, three places do `fetch(${supabaseUrl}/functions/v1/chat, ...)` then read an SSE stream and update state incrementally (lines ~368, ~488, ~606):

1. Per-question "Generate supporting text" → writes into `answers[q].notes`.
2. Per-question summary regeneration.
3. Overall conclusion summary → `setStreamedSummary(text)`.

For each:
- Delete the `fetch(.../functions/v1/chat ...)` + reader loop.
- Replace with `const { text } = await callMeoAiChat({ system, user, model });` and one assignment (`updateAnswer(q.id, { notes: text })` or `setStreamedSummary(text)`).
- Keep existing spinner state (`generatingNoteFor`, `generatingSummary`) so the UI shows a single loading state for the full duration.
- Keep debug capture (`lastPromptByQuestion`, `lastSummaryPrompt`) — update the `endpoint` field to `https://new-api.meo.io/ai/chat`.
- Keep all prompt construction (system message, language directive, factual context block, case-data block) unchanged.

## Step 3 — Auth UX

If MEO token is missing or expired when "Generate" is clicked:
- Toast: "Your MEO session has expired. Please sign in again."
- Don't fire the request.

No login-flow changes; `storeMeoToken` already populates `meo_person_token`.

## Step 4 — Models

The sample uses `llama3.2:3b`, which isn't in the current dropdown (`gemma2:9b`, `glm-4.7-flash:latest`, `qwen3:14b`, `gemma3:12b`). Two options — pick one:

- **(A) Keep dropdown as-is.** Implementation reads `settings.ai_model` and forwards it verbatim. If new-api rejects an old model name, the user sees the raw 4xx error. Lowest-risk change, but stale options remain.
- **(B) Update dropdown to the new catalog.** You give me the supported model list for new-api.meo.io and I update `MODELS` in `RiskAssessmentAiSettings.tsx` (and migrate the saved `ai_model` if needed).

Default if you don't pick: **(A)** — no model UI changes this round.

## Step 5 — Explicit non-scope

- `supabase/functions/chat/index.ts` — untouched, still used by Chat Playground.
- `RiskAssessmentAiSettings.tsx` model picker — untouched unless you pick 4(B).
- `ai_endpoint_url` / `ai_api_key` columns on `risk_assessment_settings` — leave in place; risk assessment just stops reading them. Cleanup later.

## Files touched

- **New:** `src/lib/meoAiChat.ts` (~40 lines).
- **Edited:** `src/pages/RiskAssessmentProcess.tsx` — three call sites replaced, ~120 lines removed, ~15 added.

## Verification after build

1. Sign in so a MEO token is present in localStorage.
2. Open a risk assessment, click "Generate supporting text" on a question → spinner → text fills the textarea.
3. Trigger the conclusion summary → spinner → full markdown summary appears.
4. Open the "Preview Prompt" debug dialog and confirm the recorded endpoint is `https://new-api.meo.io/ai/chat`.
5. Network tab: one POST per generate, `200 OK`, no SSE.
