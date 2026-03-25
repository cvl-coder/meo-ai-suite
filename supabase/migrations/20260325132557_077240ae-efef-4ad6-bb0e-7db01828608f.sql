CREATE TABLE public.risk_assessment_answer_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES public.risk_assessment_questions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.risk_assessment_answer_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read answer options"
  ON public.risk_assessment_answer_options FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert answer options"
  ON public.risk_assessment_answer_options FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update answer options"
  ON public.risk_assessment_answer_options FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete answer options"
  ON public.risk_assessment_answer_options FOR DELETE TO authenticated USING (true);