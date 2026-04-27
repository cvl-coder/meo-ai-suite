
# Add Up/Down Reordering for Questions

## Problem

In the Risk Assessment Admin question list, each question shows a grip icon (`GripVertical`) but it's purely decorative — there's no drag handler and no up/down buttons. Questions are sorted by `sort_order`, but there's no way to change that order from the UI.

## Solution

Add **Up** and **Down** arrow buttons next to each question (replacing the decorative grip icon) that swap the `sort_order` value with the neighboring question and persist to the database.

## Behavior

- **Up button**: Disabled on the first question; otherwise swaps `sort_order` with the question above and reloads the list.
- **Down button**: Disabled on the last question; otherwise swaps `sort_order` with the question below and reloads the list.
- Both updates run as two `update` calls to `risk_assessment_questions` (one per swapped row).
- After a successful swap, the existing `loadData()` reloads questions sorted by `sort_order` so the UI reflects the new order immediately.

## Technical changes

**File:** `src/pages/RiskAssessmentAdmin.tsx`

1. Import `ChevronUp` and `ChevronDown` from `lucide-react` (remove `GripVertical` if unused).
2. Add a `moveQuestion(index, direction)` async function that:
   - Finds the current and neighbor question by index.
   - Swaps their `sort_order` values via two `supabase.from("risk_assessment_questions").update(...)` calls.
   - Calls `loadData()` to refresh.
   - Shows a toast on error.
3. In the question list (around line 282-301), replace the `<GripVertical />` with a small vertical stack of two icon buttons (`ChevronUp` / `ChevronDown`) wired to `moveQuestion(index, "up" | "down")` with proper disabled states for first/last items.

No database schema changes required — `sort_order` already exists.
