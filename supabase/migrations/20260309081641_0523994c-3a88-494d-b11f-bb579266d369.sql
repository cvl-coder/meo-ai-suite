-- Create enum for AI function types
CREATE TYPE public.ai_function_type AS ENUM ('external_search', 'summarizer', 'classifier', 'custom');

-- Create ai_functions table
CREATE TABLE public.ai_functions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type ai_function_type NOT NULL DEFAULT 'external_search',
  enabled BOOLEAN NOT NULL DEFAULT false,
  icon TEXT DEFAULT 'search',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create ai_search_configs table
CREATE TABLE public.ai_search_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  function_id UUID NOT NULL REFERENCES public.ai_functions(id) ON DELETE CASCADE,
  search_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompt_template TEXT NOT NULL DEFAULT '',
  client_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create ai_search_results table
CREATE TABLE public.ai_search_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id UUID NOT NULL REFERENCES public.ai_search_configs(id) ON DELETE CASCADE,
  client_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  results JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_search_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_search_results ENABLE ROW LEVEL SECURITY;

-- Prototype: allow all access (MEO backend handles auth in production)
CREATE POLICY "Allow all access to ai_functions" ON public.ai_functions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to ai_search_configs" ON public.ai_search_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to ai_search_results" ON public.ai_search_results FOR ALL USING (true) WITH CHECK (true);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_ai_functions_updated_at BEFORE UPDATE ON public.ai_functions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ai_search_configs_updated_at BEFORE UPDATE ON public.ai_search_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed first AI function
INSERT INTO public.ai_functions (name, description, type, icon, enabled) VALUES
  ('External AI Search', 'Search external sources for client information using AI-powered web scraping and synthesis.', 'external_search', 'globe-search', false);

-- Create config for the seeded function
INSERT INTO public.ai_search_configs (function_id, search_urls, prompt_template, client_fields)
SELECT id,
  '["https://www.linkedin.com","https://www.crunchbase.com"]'::jsonb,
  'Find information about {{name}} from {{company}} in the {{industry}} industry. Focus on: recent news, company details, key personnel, and relevant business activities.',
  '[{"key":"name","label":"Client Name","type":"text","required":true},{"key":"company","label":"Company","type":"text","required":true},{"key":"industry","label":"Industry","type":"text","required":false},{"key":"notes","label":"Additional Notes","type":"textarea","required":false}]'::jsonb
FROM public.ai_functions WHERE type = 'external_search' LIMIT 1;