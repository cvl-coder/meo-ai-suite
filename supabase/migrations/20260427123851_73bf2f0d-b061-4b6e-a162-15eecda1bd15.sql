ALTER TABLE public.risk_assessment_answer_options
  ADD COLUMN IF NOT EXISTS requires_followup boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_label text NOT NULL DEFAULT '';

ALTER TABLE public.risk_assessment_answers
  ADD COLUMN IF NOT EXISTS followup_text text NOT NULL DEFAULT '';