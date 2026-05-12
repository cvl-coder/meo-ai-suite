ALTER TABLE public.risk_assessment_questions
  DROP COLUMN IF EXISTS max_score,
  DROP COLUMN IF EXISTS weight,
  DROP COLUMN IF EXISTS score_aggregation;

ALTER TABLE public.risk_assessment_answer_options
  DROP COLUMN IF EXISTS score;

ALTER TABLE public.risk_assessment_answers
  DROP COLUMN IF EXISTS score;

ALTER TABLE public.risk_assessment_sessions
  DROP COLUMN IF EXISTS total_score,
  DROP COLUMN IF EXISTS max_possible_score,
  DROP COLUMN IF EXISTS risk_level;

ALTER TABLE public.risk_assessment_settings
  DROP COLUMN IF EXISTS low_threshold,
  DROP COLUMN IF EXISTS medium_threshold;