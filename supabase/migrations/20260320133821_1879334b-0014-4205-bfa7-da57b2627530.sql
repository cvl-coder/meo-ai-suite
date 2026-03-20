
-- 1. Create a safe view that excludes ai_api_key
CREATE VIEW public.ai_search_configs_safe AS
SELECT id, function_id, search_urls, prompt_template, client_fields, 
       ai_endpoint_url, ai_model, output_language, updated_at
FROM public.ai_search_configs;

-- 2. Tighten RLS on ai_search_configs: require authentication
DROP POLICY IF EXISTS "Allow all access to ai_search_configs" ON public.ai_search_configs;

CREATE POLICY "Authenticated users can read ai_search_configs"
ON public.ai_search_configs
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert ai_search_configs"
ON public.ai_search_configs
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update ai_search_configs"
ON public.ai_search_configs
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete ai_search_configs"
ON public.ai_search_configs
FOR DELETE
TO authenticated
USING (true);

-- 3. Tighten RLS on other tables too
DROP POLICY IF EXISTS "Allow all access to ai_functions" ON public.ai_functions;
CREATE POLICY "Authenticated users can access ai_functions"
ON public.ai_functions FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to ai_test_data" ON public.ai_test_data;
CREATE POLICY "Authenticated users can access ai_test_data"
ON public.ai_test_data FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to ai_search_results" ON public.ai_search_results;
CREATE POLICY "Authenticated users can access ai_search_results"
ON public.ai_search_results FOR ALL TO authenticated
USING (true) WITH CHECK (true);
