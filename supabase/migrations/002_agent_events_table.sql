-- Migration 002: Agent Events table
-- Stores all actions taken by Claude agents and external webhooks (Granola, etc.)
-- The dashboard reads pending events to surface the Action Sidebar.

CREATE TABLE IF NOT EXISTS public.agent_events (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   timestamptz DEFAULT now(),
  source       text        NOT NULL,    -- 'granola' | 'claude_agent' | 'webhook_email' | 'zapier'
  deal_id      bigint      REFERENCES public.pipeline(id) ON DELETE SET NULL,
  company      text,
  event_type   text        NOT NULL,    -- 'call_completed' | 'deal_created' | 'stage_changed' | 'proposal_sent'
  summary      text,                   -- human-readable description (shown in sidebar)
  action_items text,                   -- JSON-stringified array of action items
  status       text        NOT NULL DEFAULT 'pending',  -- 'pending' | 'reviewed' | 'dismissed'
  raw          jsonb,                  -- full original payload for debugging
  reviewed_by  text,                   -- who acted on this event
  reviewed_at  timestamptz
);

COMMENT ON TABLE  public.agent_events             IS 'Actions taken by Claude agents and webhooks — feeds the Action Sidebar';
COMMENT ON COLUMN public.agent_events.source      IS 'Origin of the event: granola, claude_agent, webhook_email, etc.';
COMMENT ON COLUMN public.agent_events.event_type  IS 'Type: call_completed, deal_created, stage_changed, proposal_sent';
COMMENT ON COLUMN public.agent_events.status      IS 'Lifecycle: pending (unseen) → reviewed | dismissed';
COMMENT ON COLUMN public.agent_events.action_items IS 'JSON array of string action items extracted from the event';

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_agent_events_status
  ON public.agent_events (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_events_deal
  ON public.agent_events (deal_id)
  WHERE deal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_events_source
  ON public.agent_events (source, created_at DESC);

-- Enable realtime so the dashboard shows new agent actions instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_events;
