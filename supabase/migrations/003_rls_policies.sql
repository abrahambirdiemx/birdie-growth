-- Migration 003: Row Level Security (RLS)
-- Internal tool: authenticated users can do everything.
-- Anon users (no login) cannot access any data.
-- This makes the exposed anon key safe even in a public repo.
--
-- ⚠ IMPORTANT: Run this AFTER migrations 001 and 002.
-- ⚠ RLS on pipeline/crm/kpi_logs may already be partially configured — check first.

-- ────────────────────────────────────────────────────────────────────────────
-- PIPELINE
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.pipeline ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "authenticated_all_pipeline" ON public.pipeline;

CREATE POLICY "authenticated_all_pipeline"
  ON public.pipeline
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- CRM
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.crm ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_crm" ON public.crm;

CREATE POLICY "authenticated_all_crm"
  ON public.crm
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- KPI LOGS
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.kpi_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_kpi_logs" ON public.kpi_logs;

CREATE POLICY "authenticated_all_kpi_logs"
  ON public.kpi_logs
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- GOALS
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_goals" ON public.goals;

CREATE POLICY "authenticated_all_goals"
  ON public.goals
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Edge functions use service_role key which bypasses RLS — no policy needed.

-- ────────────────────────────────────────────────────────────────────────────
-- AGENT EVENTS
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.agent_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_agent_events" ON public.agent_events;
DROP POLICY IF EXISTS "authenticated_update_agent_events" ON public.agent_events;

-- Authenticated users can read and update events (mark reviewed/dismissed)
-- but CANNOT insert directly (only Edge Functions can insert via service_role)
CREATE POLICY "authenticated_read_agent_events"
  ON public.agent_events
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_update_agent_events"
  ON public.agent_events
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- VERIFY
-- ────────────────────────────────────────────────────────────────────────────
-- Run this to confirm RLS is active on all tables:
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('pipeline', 'crm', 'kpi_logs', 'goals', 'agent_events')
ORDER BY tablename;
