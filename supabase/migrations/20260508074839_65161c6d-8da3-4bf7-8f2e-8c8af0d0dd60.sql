ALTER TABLE public.risk_assessment_questions
ADD COLUMN IF NOT EXISTS case_data_fields jsonb;