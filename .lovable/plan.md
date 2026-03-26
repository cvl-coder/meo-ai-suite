
What I found

1. The app is sending the language setting correctly.
- The saved backend settings currently have `output_language = English`.
- In the actual AI request, the system message includes:
  - your saved global prompt text
  - plus a hardcoded rule: `Write ENTIRELY in English`

2. The real problem is a prompt conflict.
- Your saved global system prompt still explicitly says:
  - `Language: Danish (Dansk).`
  - Danish-first style instructions
  - Danish example phrases like `Jeg vurderer...`
  - fallback text in Danish
- So the AI receives both:
  - “write in Danish”
  - “write entirely in English”
- In the captured request, both instructions are present in the same system message. The Danish instructions are earlier, longer, and more stylistic, so the model is following those.

3. The factual input is also Danish.
- The question text and internal support text are sent in Danish.
- That alone is not necessarily wrong, but combined with the Danish system prompt it makes English output even less likely.

4. There is also a small prompt bug.
- One rule currently renders as:
  - `If English is "Danish", write only Danish...`
- That text is malformed and should reference the selected language variable properly.
- It is not the main cause, but it weakens the language enforcement.

5. The summary flow has the same structural risk.
- The summary generator reuses the same global prompt field.
- If that field contains Danish-specific instructions, changing only the language dropdown will not reliably switch output language there either.

Plan to fix

1. Separate language control from the editable global prompt
- Keep the global prompt for role/persona/quality instructions only.
- Move all language enforcement into a dedicated hardcoded block built from `output_language`.
- Result: the selected language becomes the single source of truth.

2. Remove conflicting language instructions from the global prompt at runtime
- Before sending to the AI, strip or ignore lines in the saved global prompt that hardcode language, such as:
  - `Language: Danish`
  - Danish-only style rules
  - Danish fallback text
- This prevents old saved prompt content from overriding the dropdown.

3. Strengthen the final prompt structure
- System message:
  - persona
  - strict output language directive
  - strict “do not mix languages”
  - optional fallback text localized to the chosen language
- User message:
  - factual context only
  - question-specific instructions
- This reduces instruction collisions.

4. Fix the malformed language rule string
- Replace the broken sentence so it correctly reflects the selected language.

5. Add an admin-side prompt preview/debug panel
- Show exactly what is being sent:
  - final system message
  - final user message
  - selected model
  - selected output language
- This will make future prompt issues immediately visible.

6. Improve the admin UX to prevent this happening again
- Rename the global prompt help text to clarify:
  - “Do not hardcode language here; use Output Language instead.”
- Optionally show a warning if the global prompt contains words like `Danish`, `English`, `Norwegian`, etc.

Expected outcome

- If you set Output Language to English, the generated note should come out in English even when the question and support text are Danish.
- The AI can still read Danish source material, but the response language will be controlled centrally and consistently.
- Question-specific instructions like “Use the name Thomas” will have a better chance of being followed because the prompt will be less contradictory.

Technical details

Current conflicting request example
```text
Saved global prompt says:
- Language: Danish (Dansk)
- Use pure, professional Danish legal terminology
- Perspective: "Jeg vurderer..."

Hardcoded rules added later say:
- Write ENTIRELY in English
```

Why the output stayed Danish
```text
The model received contradictory instructions in the same system prompt.
The earlier, more detailed Danish instructions outweighed the later English rule.
```

Files involved
- `src/pages/RiskAssessmentProcess.tsx`
- `src/pages/RiskAssessmentAdmin.tsx`

Implementation focus
- refactor prompt assembly in `generateNoteForQuestion`
- apply the same cleanup to `generateAiSummary`
- add a prompt preview/debug area in admin
