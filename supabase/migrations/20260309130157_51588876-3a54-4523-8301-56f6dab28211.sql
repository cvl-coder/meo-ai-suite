ALTER TABLE public.ai_search_configs 
ADD COLUMN ai_endpoint_url text NOT NULL DEFAULT '',
ADD COLUMN ai_api_key text NOT NULL DEFAULT '',
ADD COLUMN ai_model text NOT NULL DEFAULT '';