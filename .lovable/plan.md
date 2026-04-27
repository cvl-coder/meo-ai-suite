# Rethink: Aggregation / Summary Questions

## The actual need

Some questions are not "answer one thing" questions — they are **summary questions** whose AI note should aggregate the answers and notes of one or more earlier questions. This can happen:

- **At the end** of a risk assessment (an overall conclusion question), or
- **Mid-flow** (e.g. a "client risk subtotal" question after questions 1–4, before moving on to transaction risk).

Today's "context from other questions" feature is built for *one question lightly referencing another*. It doesn't fit this pattern — there's no notion of a question whose primary purpose is to summarise others, no preview of what will be summarised, and the prompt machinery treats every question identically.

## Proposed model: introduce a "Summary" question type

Add a new `question_type` value: **`summary`** (alongside the existing `single_select` / multi-select types).

A summary question:

- Has **no answer options** for the user to pick — there's nothing to score directly.
- Has a configured **set of source questions** to aggregate (re-using the existing `context_question_ids` jsonb field — no schema change).
- Optionally has an **aggregation rule** for its own score: `sum`, `average`, `max`, or `none` (default `none` — purely narrative).
- Has its own `ai_prompt_template` describing *how* to summarise (e.g. "Give a 3-sentence client-risk overview highlighting the highest-risk factors").
- Renders in the assessment as a **read-only card** with a "Generate summary" button. The generated text is saved into the existing `notes` field on `risk_assessment_answers`, exactly like AI notes today.
- Re-generating is allowed at any time and pulls the *current* answers of the source questions, so it stays in sync if the user goes back and changes something.

## Admin editing experience

In `RiskAssessmentQuestionEdit.tsx`:

- Add a **Question Type** selector at the top: `Single select` / `Multi select` / `Summary`.
- When type = `Summary`:
  - Hide the "Answer Options" card entirely.
  - Hide `max_score` / `weight` unless an aggregation rule is chosen.
  - Replace the current "Context from Other Questions" card with a clearer **"Questions to Summarise"** card — same checkbox list, but framed as the *required input set*, with drag-to-reorder so the admin controls the order they appear in the prompt.
  - Add a **Score aggregation** dropdown (`None / Sum / Average / Max`). When not `None`, `max_score` is auto-computed (e.g. sum of source `max_score`s for `Sum`/`Average`).
  - Show a **Live Preview** of the prompt that will be sent, populated with placeholder answers (or the most recent real session's answers if available).

## Assessment flow (`RiskAssessmentProcess.tsx`)

- Detect `question_type === 'summary'` and render a different card:
  - Title + description.
  - A bulleted list of the source questions with their current answers (so the user sees what's being summarised).
  - A "Generate summary" button (and "Regenerate" once one exists).
  - The generated note is shown in the same notes area used elsewhere.
- The prompt sent to the AI for a summary question is built from a dedicated template (no `selected_answer` / `score` placeholders since they don't apply). The source questions are injected as a clean numbered block:

  ```
  Summarise the following risk-assessment answers:

  1. <Question 1 text>
     Answer: <user's selection>  (score X/Y)
     Follow-up: <text if any>
     Existing note: <if any>

  2. <Question 2 text>
     ...
  ```

  Followed by the admin's `ai_prompt_template` instructions, then the language directive.

- Sidebar / progress: summary questions are marked with a distinct icon and don't count toward "answered N of M" progress (or count separately as "summaries"), since they have no user input.

## Scoring & conclusion view

- If `score_aggregation = none`, the summary question contributes 0 to the total — purely narrative.
- If `sum` / `average` / `max`, its score is computed from the source questions at save time and stored on the answer row, so the existing total/risk-level logic in the conclusion view keeps working unchanged.

## Backward compatibility

- Existing questions stay `single_select` and behave exactly as today.
- The current "context from other questions" feature on non-summary questions is **kept as-is** for the lighter use case (one question lightly referencing another).
- No migration needed: `context_question_ids` already exists, `question_type` already exists as text.

## Files changed

- `src/pages/RiskAssessmentQuestionEdit.tsx` — type selector, hide options for summary, "Questions to Summarise" card, score aggregation, live preview.
- `src/pages/RiskAssessmentProcess.tsx` — render summary card, dedicated prompt builder, exclude from answered-progress, compute aggregated score on save.
- `src/pages/RiskAssessmentAdmin.tsx` — show a "Summary" badge on the question list so admins can spot them at a glance.
- `src/pages/RiskAssessment.tsx` (conclusion view) — show summary notes in their own section above the per-question breakdown.

## What this gives the user

- A first-class way to add roll-up questions wherever they're needed in the flow, not just at the end.
- The summary always reflects current answers — go back, change Q3, regenerate the summary, done.
- Clear separation in the admin UI between "scoring questions" and "summary questions".
- No more typing fragile question numbers into prompts.
