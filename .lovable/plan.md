

# Show Full getCase Response (Including Checks) in API Test Output

## Problem

When "Fetch" is clicked to load entities from a case, the `fetchCaseEntities` function calls the `getCase` API but only extracts entities into the dropdown — it never calls `setResult()`, so the full response (which includes checks data) is not displayed in the output panel.

## Solution

One small change in `src/pages/ApiTest.tsx`: inside `fetchCaseEntities`, after getting `caseData`, call `setResult(caseData)` so the entire getCase response — including any `checks` array — is shown in the JSON output panel at the bottom of the page.

## Technical detail

In `fetchCaseEntities` (~line 146), after:
```ts
const caseData = data?.data || data;
```

Add:
```ts
setResult(caseData);
```

This single line change makes the full case payload (entities, checks, risk assessments, metadata) visible in the output panel whenever entities are fetched.

**File to modify:** `src/pages/ApiTest.tsx` (1 line addition)

