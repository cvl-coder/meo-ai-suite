
Goal: improve the Risk Summary output so it is easier to scan, using a sectioned layout and a word-range target instead of the current 10-line rule.

Plan

1. Update the default prompt guidance
- Replace the current “exactly 10 lines” style prompt with a sectioned-summary instruction.
- Use headings such as:
  - Overall risk
  - Key findings
  - Gaps / concerns
  - Recommended actions
  - Data quality / missing information
- Change the length rule to a target word range instead of line count.

2. Improve the prompt editor UX in AI config
- Update the prompt help text in the AI config screen so it clearly recommends a structured markdown layout.
- Add a stronger placeholder/example prompt that uses `{{risk_text}}` and shows the new sectioned format.
- Keep `{{risk_text}}` as the injected source from the selected case, so the user still only needs to choose workspace + case in the runner.

3. Add backend guardrails for better formatting
- Strengthen the backend system instruction in `ai-search` so summaries are returned as clean markdown with clear sections, even if the saved prompt is a bit loose.
- Keep this as guidance rather than hard-coding one exact format, so custom prompts still work.

4. Keep the current fetch flow unchanged
- No change to the risk-assessment retrieval flow in `AiAdmin`.
- The selected case will still fetch the assessment automatically and inject it into `{{risk_text}}`.

5. Result
- The output becomes easier to overview.
- It can exceed 10 lines when needed.
- The summary stays concise by aiming for a word range instead of a rigid line count.

Files likely involved
- `src/pages/AiSearchConfig.tsx`
- `supabase/functions/ai-search/index.ts`
- Possibly the saved prompt content used by the Risk Summary function configuration

Suggested prompt shape
```text
You are a risk analyst.

Review the risk assessment JSON below and produce a concise, well-structured summary for a human reader.

Requirements:
- Write in clear business language
- Organize the output with these markdown sections:
  ## Overall Risk
  ## Key Findings
  ## Main Gaps or Concerns
  ## Recommended Actions
  ## Data Quality Notes
- Target approximately 150-250 words
- Focus on the most important risks, signals, weaknesses, and next steps
- Do not describe the JSON structure
- Do not invent facts
- If important information is missing, say so briefly

Risk assessment JSON:
{{risk_text}}
```

Technical details
- No database changes are needed.
- No authentication changes are needed.
- This is mainly a prompt/configuration improvement plus a small backend instruction update for output consistency.
