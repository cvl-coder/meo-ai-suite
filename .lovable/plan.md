# Per-question "View last prompt" debug panel

Goal: see exactly what was sent to the AI for each question — including whether `main.country` (and any other case data) actually made it into the JSON — without touching the edge function or the database.

## What gets added

On `/risk-assessment/process`, next to each question's existing **Generate AI Note** button, add a small **View prompt** icon button (eye icon). It is enabled only after that question has generated at least one AI note in the current session.

Clicking it opens a dialog showing the **exact** payload that was sent on the most recent AI call for that question:

- Model + endpoint + timestamp
- `system` message (full text)
- `user` message (full text, including the `## Case Context` block with the JSON for main company, risk assessments, etc.)
- A "Copy" button for each block
- An approximate length (chars) so we can see if we're close to context limits

Same button is added to the conclusion-summary section (so we can also inspect the follow-up summary call).

## How it works

- New in-memory state in `RiskAssessmentProcess.tsx`:
  ```ts
  const [lastPromptByQuestion, setLastPromptByQuestion] =
    useState<Record<string, { system: string; user: string; model: string; endpoint: string; ts: string }>>({});
  const [lastSummaryPrompt, setLastSummaryPrompt] = useState<…|null>(null);
  ```
- In `generateNoteForQuestion`, right before the `fetch(...)` call, capture `{ system, user, model, endpoint, ts: new Date().toISOString() }` into `lastPromptByQuestion[question.id]`.
- Same capture inside `runFollowUpSummary` for the summary call.
- New `<PromptDebugDialog />` local component using `Dialog` from `@/components/ui/dialog`, with two `<pre>` blocks (scrollable, monospaced) and copy buttons.

## Out of scope

- No changes to the `chat` edge function (still a thin streaming relay).
- No DB persistence — state is per-session and lost on reload. (Can be added later if we want an audit trail.)
- No changes to which case data is fetched or how it's formatted. This change only **shows** what is already being sent, so we can confirm whether `country` is actually in the payload before deciding what to fix next.

## Files touched

- `src/pages/RiskAssessmentProcess.tsx` — add state, capture prompts, add View-prompt buttons + dialog.

## What we'll learn from it

After shipping, open a question that uses **Main company**, click **Generate AI Note**, then click **View prompt**. In the `user` block, search for `"country"`. If it's missing or empty, the fix is in `fetchCaseDataBlock` (field-name mapping / extra detail call). If it's present with a real value, the fix is in the system prompt / question template (the AI is being told to ignore it).
