# Per-question case data context

Currently, when an AI note is generated for a question, the prompt only contains:
- The question text + answer
- Other questions' answers (via `context_question_ids`)
- Question-specific instructions (`ai_prompt_template`)

The MEO case data (main company info, risk assessments, documents, custom properties, etc.) is **not** attached at the question level. There is a global `data_sources` setting (case_risk / entity_risk) but it is only used by the conclusion-level summary, not per-question AI notes.

This plan adds a per-question selector in the admin UI so an admin can pick which MEO case data points should be fetched and injected into that question's AI prompt.

## What gets added

In **Risk Assessment → Admin → Edit Question**, add a new section **"Case data to include"** with checkboxes for each available data source:

- **Main company** — name, org no., country, status, role on case (from `getCase` → `affiliatedCompanies[0]`)
- **All affiliated companies** — full list with same fields
- **Individuals on case** — names, roles, types
- **Case-level risk assessments** — existing scores/levels/notes for the case
- **Entity-level risk assessments** — for selected entities
- **Custom properties** — KYC fields stored on the main company
- **Documents list** — filenames + types attached to entities (no file content)
- **Compliance checks** — PEP / sanctions / adverse media check results

Selections are saved per-question. When that question runs its AI note, the edge flow fetches the chosen sources, formats them into a `## Case Context` block, and prepends it to the prompt — same pattern already used for `context_question_ids`.

## User flow

```text
Admin → Edit Question
 ┌────────────────────────────────────┐
 │ Question text                      │
 │ Answer options                     │
 │ AI prompt template                 │
 │ Context from other questions  [✓]  │
 │ ── NEW ──                          │
 │ Case data to include               │
 │   [✓] Main company                 │
 │   [ ] Affiliated companies         │
 │   [✓] Risk assessments (case)      │
 │   [ ] Documents                    │
 │   ...                              │
 └────────────────────────────────────┘
```

At runtime, `RiskAssessmentProcess` calls `meo-api-test` for each selected source, builds a context block, and sends it in the AI request alongside the existing question/answer payload.

## Technical notes

1. **Schema** — add `case_data_sources jsonb DEFAULT '[]'::jsonb` to `risk_assessment_questions`. Values are short keys: `main_company`, `affiliated_companies`, `individuals`, `case_risk`, `entity_risk`, `custom_properties`, `documents`, `checks`.
2. **Admin UI** — `RiskAssessmentQuestionEdit.tsx`: new checkbox group bound to `formData.case_data_sources`; persisted via existing upsert.
3. **Runtime** — `RiskAssessmentProcess.tsx` (`generateAiNote` + `runFollowUpSummary`):
   - Read `question.case_data_sources`
   - For each key, call the matching `meo-api-test` action (`getCase`, `getRiskAssessments`, `getEntityRiskAssessments`, `getEntityCustomProperties`, `getEntityUserdata`, `getCheckData`)
   - Cache results per session to avoid refetching across questions
   - Format into a Markdown `## Case Context` block (compact JSON or bullets), prepend to prompt
4. **Token safety** — truncate large payloads (e.g. document lists > 50 items, risk assessment notes > 2 KB each) before injection.
5. **Preview Prompt** in Admin — extend the existing preview to show the case-data block using a sample case, so admins can verify size before saving.

## Out of scope

- No changes to the global `data_sources` setting (still drives the final conclusion summary).
- No new MEO endpoints — only existing `meo-api-test` actions are reused.
- No file-content extraction from documents (only metadata/filenames).
