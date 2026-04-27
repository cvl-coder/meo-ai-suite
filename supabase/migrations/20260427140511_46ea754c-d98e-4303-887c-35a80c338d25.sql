ALTER TABLE public.risk_assessment_questions
ADD COLUMN IF NOT EXISTS score_aggregation TEXT NOT NULL DEFAULT 'none';