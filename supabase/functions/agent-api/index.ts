// Birdie Growth — Agent API Edge Function
// Secure endpoint for Claude Code agents to read/write pipeline data.
// Auth: X-Agent-Key header (set as AGENT_SECRET_KEY in Supabase secrets)
//
// Deploy: supabase functions deploy agent-api
// Secrets: supabase secrets set AGENT_SECRET_KEY=<your-secret>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-agent-key',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // ── Auth ────────────────────────────────────────────────────────────────
  const agentKey = req.headers.get('x-agent-key');
  if (!agentKey || agentKey !== Deno.env.get('AGENT_SECRET_KEY')) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: { action: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { action, payload = {} } = body;

  try {
    switch (action) {

      // ── Pipeline ──────────────────────────────────────────────────────
      case 'get_pipeline': {
        const { status, owner, limit = 500 } = payload as {
          status?: string; owner?: string; limit?: number;
        };
        let q = supabase
          .from('pipeline')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (status) q = q.eq('status', status);
        if (owner)  q = q.eq('owner', owner);
        const { data, error } = await q;
        if (error) throw error;
        return json({ data });
      }

      case 'create_deal': {
        const record = {
          ...payload,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };
        const { data, error } = await supabase
          .from('pipeline')
          .insert([record])
          .select()
          .single();
        if (error) throw error;
        await logEvent(supabase, 'claude_agent', 'deal_created', data.id, payload);
        return json({ data });
      }

      case 'update_deal': {
        const { id, ...updates } = payload as { id: number; [k: string]: unknown };
        const { data, error } = await supabase
          .from('pipeline')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        await logEvent(supabase, 'claude_agent', 'deal_updated', id, updates);
        return json({ data });
      }

      case 'update_stage': {
        const { id, status, notes } = payload as {
          id: number; status: string; notes?: string;
        };
        const { data, error } = await supabase
          .from('pipeline')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        await logEvent(supabase, 'claude_agent', 'stage_changed', id, {
          to: status, notes,
          company: (data as Record<string, unknown>)?.opportunity_name,
        });
        return json({ data });
      }

      case 'log_activity': {
        const { data, error } = await supabase
          .from('kpi_logs')
          .insert([{ ...payload, created_at: new Date().toISOString() }])
          .select()
          .single();
        if (error) throw error;
        return json({ data });
      }

      // ── Goals ─────────────────────────────────────────────────────────
      case 'get_goals': {
        const { quarter } = payload as { quarter: string };
        const { data, error } = await supabase
          .from('goals')
          .select('goal_key, goal_value, updated_at')
          .eq('quarter', quarter);
        if (error) throw error;
        // Return as flat object: { mrr_cerrado: 5000, new_clients: 2, ... }
        const goals: Record<string, number> = {};
        (data || []).forEach((r: { goal_key: string; goal_value: number }) => {
          goals[r.goal_key] = r.goal_value;
        });
        return json({ data: goals, quarter });
      }

      case 'set_goal': {
        const { quarter, goal_key, goal_value, updated_by } = payload as {
          quarter: string; goal_key: string; goal_value: number; updated_by?: string;
        };
        const { data, error } = await supabase
          .from('goals')
          .upsert([{
            quarter, goal_key, goal_value,
            updated_by: updated_by || 'claude_agent',
            updated_at: new Date().toISOString(),
          }], { onConflict: 'quarter,goal_key' })
          .select()
          .single();
        if (error) throw error;
        return json({ data });
      }

      // ── Agent Events ──────────────────────────────────────────────────
      case 'get_agent_events': {
        const { status = 'pending', limit = 20 } = payload as {
          status?: string; limit?: number;
        };
        const { data, error } = await supabase
          .from('agent_events')
          .select('*')
          .eq('status', status)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) throw error;
        return json({ data });
      }

      case 'create_event': {
        const { data, error } = await supabase
          .from('agent_events')
          .insert([{
            source: 'claude_agent',
            status: 'pending',
            created_at: new Date().toISOString(),
            ...payload,
          }])
          .select()
          .single();
        if (error) throw error;
        return json({ data });
      }

      case 'dismiss_event': {
        const { id, reviewed_by } = payload as { id: string; reviewed_by?: string };
        const { error } = await supabase
          .from('agent_events')
          .update({
            status: 'dismissed',
            reviewed_by: reviewed_by || 'agent',
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', id);
        if (error) throw error;
        return json({ ok: true });
      }

      case 'mark_event_reviewed': {
        const { id, reviewed_by } = payload as { id: string; reviewed_by: string };
        const { error } = await supabase
          .from('agent_events')
          .update({
            status: 'reviewed',
            reviewed_by,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ── CRM ───────────────────────────────────────────────────────────
      case 'search_crm': {
        const { query, limit = 20 } = payload as { query: string; limit?: number };
        const { data, error } = await supabase
          .from('crm')
          .select('id, n, r, st, ind, e, sz, mrr, acv')
          .ilike('n', `%${query}%`)
          .limit(limit);
        if (error) throw error;
        return json({ data });
      }

      // ── Health ────────────────────────────────────────────────────────
      case 'ping':
        return json({ ok: true, ts: new Date().toISOString(), version: '1.0.0' });

      default:
        return json({ error: `Unknown action: "${action}"` }, 400);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[agent-api] action=${action} error=${msg}`);
    return json({ error: msg }, 500);
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function logEvent(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  source: string,
  eventType: string,
  dealId: number | null,
  payload: Record<string, unknown>,
) {
  try {
    await supabase.from('agent_events').insert([{
      source,
      deal_id: dealId,
      company: payload.opportunity_name || payload.company || null,
      event_type: eventType,
      summary: payload.notes || payload.summary || null,
      action_items: payload.action_items ? JSON.stringify(payload.action_items) : null,
      status: 'pending',
      raw: payload,
      created_at: new Date().toISOString(),
    }]);
  } catch (e) {
    // Non-critical: don't fail the main operation if logging fails
    console.warn('[agent-api] logEvent failed:', e);
  }
}
