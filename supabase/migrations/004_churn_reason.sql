-- Migration 004: Add churn_reason column to pipeline
-- Stores the reason a deal was marked as Churn (lost)
--
-- Run in: Supabase Dashboard → SQL Editor → Run

ALTER TABLE public.pipeline
  ADD COLUMN IF NOT EXISTS churn_reason TEXT DEFAULT NULL;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'pipeline'
  AND column_name  = 'churn_reason';
