CREATE TABLE public.ai_test_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_id uuid REFERENCES public.ai_functions(id) ON DELETE CASCADE NOT NULL,
  label text NOT NULL DEFAULT 'Untitled',
  field_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_test_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to ai_test_data" ON public.ai_test_data FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_ai_test_data_updated_at
  BEFORE UPDATE ON public.ai_test_data
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();