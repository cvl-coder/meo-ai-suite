
-- Risk assessment questions defined by admin
CREATE TABLE public.risk_assessment_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT '',
  question_text text NOT NULL,
  description text DEFAULT '',
  max_score integer NOT NULL DEFAULT 5,
  weight numeric(3,1) NOT NULL DEFAULT 1.0,
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.risk_assessment_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read risk_assessment_questions"
  ON public.risk_assessment_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert risk_assessment_questions"
  ON public.risk_assessment_questions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update risk_assessment_questions"
  ON public.risk_assessment_questions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete risk_assessment_questions"
  ON public.risk_assessment_questions FOR DELETE TO authenticated USING (true);

-- Risk assessment sessions (a completed or in-progress assessment run)
CREATE TABLE public.risk_assessment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL,
  case_id text NOT NULL,
  total_score numeric(10,2) NOT NULL DEFAULT 0,
  max_possible_score numeric(10,2) NOT NULL DEFAULT 0,
  risk_level text NOT NULL DEFAULT 'pending',
  status text NOT NULL DEFAULT 'in_progress',
  ai_summary text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.risk_assessment_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read risk_assessment_sessions"
  ON public.risk_assessment_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert risk_assessment_sessions"
  ON public.risk_assessment_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update risk_assessment_sessions"
  ON public.risk_assessment_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete risk_assessment_sessions"
  ON public.risk_assessment_sessions FOR DELETE TO authenticated USING (true);

-- Individual answers per session
CREATE TABLE public.risk_assessment_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.risk_assessment_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.risk_assessment_questions(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, question_id)
);

ALTER TABLE public.risk_assessment_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read risk_assessment_answers"
  ON public.risk_assessment_answers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert risk_assessment_answers"
  ON public.risk_assessment_answers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update risk_assessment_answers"
  ON public.risk_assessment_answers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete risk_assessment_answers"
  ON public.risk_assessment_answers FOR DELETE TO authenticated USING (true);

-- Risk assessment process settings (AI config, thresholds, data sources)
CREATE TABLE public.risk_assessment_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  low_threshold numeric(5,2) NOT NULL DEFAULT 30.00,
  medium_threshold numeric(5,2) NOT NULL DEFAULT 60.00,
  ai_prompt_template text NOT NULL DEFAULT '',
  ai_endpoint_url text NOT NULL DEFAULT '',
  ai_api_key text NOT NULL DEFAULT '',
  ai_model text NOT NULL DEFAULT '',
  output_language text NOT NULL DEFAULT 'English',
  data_sources jsonb NOT NULL DEFAULT '["case_risk", "entity_risk"]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.risk_assessment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read risk_assessment_settings"
  ON public.risk_assessment_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert risk_assessment_settings"
  ON public.risk_assessment_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update risk_assessment_settings"
  ON public.risk_assessment_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Insert default settings row
INSERT INTO public.risk_assessment_settings (low_threshold, medium_threshold, ai_prompt_template)
VALUES (30.00, 60.00, 'Based on the risk assessment scores and data below, provide a comprehensive risk summary.\n\nScores:\n{{scores}}\n\nRisk Data:\n{{risk_text}}');
