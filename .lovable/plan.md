# Visual case-data picker on the question editor

## Goal

On `/risk-assessment/admin/questions/:id`, instead of guessing which MEO field to send as "Main company / country / …", let the admin:

1. **Pick a real case** (workspace + case from MEO).
2. **See the actual data** that MEO returns for that case, grouped by the existing **Case Data to Include** categories (Main company, Affiliated companies, Individuals, Case-level risk, Entity-level risk, Custom properties, Documents).
3. **Tick the exact fields** (not just whole categories) that should be injected into the AI prompt for this question.
4. **Preview the resulting prompt block** that will be sent to the AI, built from those exact fields against the live case.

This replaces the current "Main company = `affiliatedCompanies[0]`, dump everything" behaviour with an explicit, admin-controlled mapping.

## UX on the question edit page

Right column, replacing today's "Case Data to Include" card:

```text
+------------------------------------------------+
|  Case Data to Include                          |
|                                                |
|  Workspace:  [ Acme Bank        v ]            |
|  Case:       [ #1234 — Volkov…  v ]   Reload   |
|                                                |
|  > Main company                  [3 selected]  |
|     [x] name           "Volkov Trading Ltd"    |
|     [x] address.countryCode  "RU"              |
|     [ ] companyRegistrationNumber.companyNo    |
|     [x] companyInformation.status  "Active"    |
|     [ ] purpose ...                            |
|                                                |
|  > Affiliated companies (12)     [0 selected]  |
|  > Individuals on case (4)       [name, role]  |
|  > Case-level risk assessments   [0 selected]  |
|  > Entity-level risk assessments [0 selected]  |
|  > Custom properties (8)         [2 selected]  |
|  > Documents (metadata) (3)      [0 selected]  |
|                                                |
|  --- Prompt preview (live) ---                 |
|  ### Main company                              |
|  name: Volkov Trading Ltd                      |
|  address.countryCode: RU                       |
|  companyInformation.status: Active             |
|  ### Custom properties                         |
|  riskRating: high                              |
|  pepFlag: true                                 |
+------------------------------------------------+
```

Each section is a collapsible accordion. Inside, every leaf field of the live MEO object is rendered as a checkbox row showing **dot-path** + **actual value** (truncated). This way the admin sees exactly what's there and exactly what they're choosing.

A small "**Use as Main company**" radio appears next to each entity in the **Affiliated companies** list, so we can finally point the system at the right entity instead of always `[0]`.

## Data flow

1. Workspace + Case selectors reuse the same logic as `RiskAssessment.tsx` (localStorage keys `selectedCustomerId` / `meo_case_id:<customerId>`, `invokeMeoAction("getCases", …)`).
2. On case selection, call `getCase`, `getRiskAssessments`, `getEntityRiskAssessments` (for the chosen main entity), and existing custom-property/document endpoints already wired in `meo-api-test`.
3. Walk each returned object with a small `flattenLeaves(obj, prefix)` helper → `Array<{ path: string; value: primitive | short-array }>`. Skip arrays of objects (they get their own section), skip nulls/empties optionally hidden behind a "Show empty fields" toggle.
4. Render each leaf as a checkbox; selection state lives in `formData.case_data_fields`.

## Schema change

Replace today's coarse `case_data_sources: string[]` with a structured map (kept alongside it for one release for backwards compatibility):

```text
case_data_fields: {
  main_company_entity_id?: string | null,   // which affiliated company to treat as main
  fields: {
    main_company?:        string[],   // dot-paths inside the chosen main entity
    affiliated_companies?: string[],  // dot-paths to keep per item
    individuals?:         string[],
    case_risk?:           string[],
    entity_risk?:         string[],
    custom_properties?:   string[],
    documents?:           string[],
  }
}
```

Stored as a single `jsonb` column `case_data_fields` on `risk_assessment_questions`. `case_data_sources` stays for now (treated as "all fields in this category" if `case_data_fields` is empty) so existing questions keep working.

## Runtime change in `fetchCaseDataBlock`

`src/pages/RiskAssessmentProcess.tsx`:

- If `question.case_data_fields` is set, build the prompt block from those exact dot-paths against the live case data — no more "normalize / guess country" logic.
- Use `case_data_fields.main_company_entity_id` to pick the right affiliated company. **Never fall back to `affiliatedCompanies[0]`.** If the configured entity isn't on the case, emit `### Main company\n(configured main company not present on this case)`.

## Files touched

- `src/pages/RiskAssessmentQuestionEdit.tsx` — replace the Case Data card with the new visual picker; add workspace/case selectors; render leaf checkboxes; live prompt preview.
- `src/pages/RiskAssessmentProcess.tsx` — `fetchCaseDataBlock` reads `case_data_fields` and emits only the chosen dot-paths; remove the affiliated-company fallback.
- New small helper: `src/lib/flattenLeaves.ts` (pure util, easy to test).
- DB migration: add `case_data_fields jsonb` column (nullable, default `null`) to `public.risk_assessment_questions`.

## Out of scope

- No edit of the MEO edge function, no streaming changes, no system-prompt changes.
- No bulk reformatting of existing questions; they keep working via the `case_data_sources` fallback until an admin opens and re-saves them.

## Verification

1. Open the Russia question on `/risk-assessment/admin/questions/…`.
2. Pick a workspace and a case where the real subject is a Russian entity.
3. In **Main company**, mark the entity as "Use as Main company", check `name` and `address.countryCode`.
4. The live preview shows exactly two lines with real values.
5. Go to `/risk-assessment/process`, click **Generate AI Note**, then the eye icon — the user message contains the same two lines, no raw dump, and the AI's note correctly references the country instead of saying "unknown".
