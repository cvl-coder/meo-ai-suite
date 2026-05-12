-- Drop the unused data_sources column from risk_assessment_settings
ALTER TABLE public.risk_assessment_settings DROP COLUMN IF EXISTS data_sources;