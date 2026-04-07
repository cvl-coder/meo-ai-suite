

# Per-Question Context Selection in Admin Panel

## Overview

Instead of a global "context mode" setting, each question will have a configurable list of other questions whose answers should be included as context when generating its AI note. This is managed entirely in the Admin panel.

## Changes

### 1. Database migration

Add a `context_question_ids` column to `risk_assessment_questions`:

```sql
ALTER TABLE risk_assessment_questions
ADD COLUMN context_question_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
```

This stores an array of question UUIDs, e.g. `["uuid-1", "uuid-3"]`.

### 2. Admin panel — question editor (`RiskAssessmentAdmin.tsx`)

In the add/edit question dialog, add a new section: **"Include context from other questions"**.

- Display a checkbox list of all other enabled questions (excluding the current one), showing their question text.
- Checked items populate the `context_question_ids` array.
- Save/load this field alongside the existing question fields.

### 3. AI note generation (`RiskAssessmentProcess.tsx`)

Update `generateNoteForQuestion` to:

1. Read the current question's `context_question_ids`.
2. For each referenced question ID, look up its answer data (selected option, score, AI notes if any).
3. Build a "Previous context" block and inject it into the user message before the current question's factual data.

Format per context question:
```
Context from: [question_text]
Answer: [selected_option_label]
Score: [score]/[max_score]
AI Note: [notes if present]
```

### 4. Type updates

- Add `context_question_ids` to the `Question` type in both files.
- Add it to `formData` state in the admin panel.

### Files to modify

- **Database migration**: add `context_question_ids` column
- **`src/pages/RiskAssessmentAdmin.tsx`**: checkbox list in question dialog, updated types and form state
- **`src/pages/RiskAssessmentProcess.tsx`**: read context IDs, build context block in prompt

