-- Migration 001: Goals table
-- Replaces localStorage GOALS_KEY ('birdie_goals_v2') with a proper DB table.
-- This allows goals to be shared across browsers and readable by agents.
--
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → paste & run

CREATE TABLE IF NOT EXISTS public.goals (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  quarter     text        NOT NULL,          -- e.g. '2026-Q2'
  goal_key    text        NOT NULL,          -- 'mrr_cerrado', 'new_clients', 'impl_total', 'new_leads'
  goal_value  numeric     NOT NULL DEFAULT 0,
  updated_by  text,                          -- email or 'claude_agent'
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (quarter, goal_key)
);

COMMENT ON TABLE  public.goals              IS 'Quarterly sales goals — replaces localStorage birdie_goals_v2';
COMMENT ON COLUMN public.goals.quarter      IS 'Quarter identifier: YYYY-QN (e.g. 2026-Q2)';
COMMENT ON COLUMN public.goals.goal_key     IS 'Goal dimension: mrr_cerrado | new_clients | impl_total | new_leads';
COMMENT ON COLUMN public.goals.goal_value   IS 'Target value (MRR in USD, count for clients/leads)';
COMMENT ON COLUMN public.goals.updated_by   IS 'Who last changed this goal (user email or agent name)';

-- Enable realtime so the dashboard updates instantly when goals change
ALTER PUBLICATION supabase_realtime ADD TABLE public.goals;

-- Seed current Q2-2026 goals (edit values to match current targets)
-- These replace whatever was stored in localStorage
INSERT INTO public.goals (quarter, goal_key, goal_value, updated_by) VALUES
  ('2026-Q2', 'mrr_cerrado',  5000, 'migration'),
  ('2026-Q2', 'new_clients',     2, 'migration'),
  ('2026-Q2', 'impl_total',   3000, 'migration'),
  ('2026-Q2', 'new_leads',      40, 'migration')
ON CONFLICT (quarter, goal_key) DO NOTHING;
