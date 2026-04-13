// Birdie Growth — Granola Webhook Edge Function
// Receives post-call data from Granola and stores it as an agent_event
// so the dashboard can surface action items from calls.
//
// Deploy: supabase functions deploy webhook-granola
// Secrets: supabase secrets set GRANOLA_WEBHOOK_SECRET=<your-secret>
//
// Configure in Granola: Settings → Webhooks → Add webhook
//   URL: https://xjrgqborwhvyqgrczetq.supabase.co/functions/v1/webhook-granola
//   Header: x-webhook-secret: <your-secret>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // ── Auth ────────────────────────────────────────────────────────────────
  const secret = req.headers.get('x-webhook-secret');
  if (!secret || secret !== Deno.env.get('GRANOLA_WEBHOOK_SECRET')) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  // ── Parse Granola payload ────────────────────────────────────────────────
  // Granola sends different shapes depending on the event type.
  // We extract what we need and fall back gracefully.
  const {
    title,           // meeting title — usually "Call with ACME"
    summary,         // AI-generated meeting summary
    action_items,    // array of action items from the call
    transcript,      // full transcript (optional, may be large)
    attendees,       // array of attendee names/emails
    duration,        // duration in minutes
    started_at,      // ISO date string
    company,         // explicit company name (if set in Granola)
    notes,           // meeting notes
  } = body as {
    title?: string;
    summary?: string;
    action_items?: string[] | Record<string, unknown>[];
    transcript?: string;
    attendees?: string[];
    duration?: number;
    started_at?: string;
    company?: string;
    notes?: string;
  };

  // ── Extract company name from title if not provided ──────────────────────
  // Common patterns: "Call with ACME", "Demo — ACME Corp", "ACME | Discovery"
  const companyName = company || extractCompany(title || '');

  // ── Find matching deal in pipeline ───────────────────────────────────────
  let dealId: number | null = null;
  let dealStatus: string | null = null;
  if (companyName) {
    const { data: matches } = await supabase
      .from('pipeline')
      .select('id, opportunity_name, status')
      .ilike('opportunity_name', `%${companyName}%`)
      .not('status', 'in', '("Cerrado","Cliente","Churn","Cool Off")')
      .order('created_at', { ascending: false })
      .limit(1);
    if (matches?.length) {
      dealId     = (matches[0] as { id: number }).id;
      dealStatus = (matches[0] as { status: string }).status;
    }
  }

  // ── Build event summary ──────────────────────────────────────────────────
  const aiSummary = [
    summary && `📋 Resumen: ${summary}`,
    action_items?.length && `✅ Action items: ${
      Array.isArray(action_items)
        ? action_items.map(i => (typeof i === 'string' ? i : JSON.stringify(i))).join(' | ')
        : JSON.stringify(action_items)
    }`,
    attendees?.length && `👥 Participantes: ${attendees.join(', ')}`,
    duration && `⏱ Duración: ${duration} min`,
    dealStatus && `📊 Etapa actual: ${dealStatus}`,
  ].filter(Boolean).join('\n');

  // ── Store event in Supabase ──────────────────────────────────────────────
  const { data: event, error } = await supabase
    .from('agent_events')
    .insert([{
      source:       'granola',
      deal_id:      dealId,
      company:      companyName,
      event_type:   'call_completed',
      summary:      aiSummary || summary || null,
      action_items: action_items ? JSON.stringify(action_items) : null,
      status:       'pending',
      raw: {
        title,
        attendees,
        duration,
        started_at,
        notes,
        // Don't store full transcript in raw to keep DB size reasonable
        has_transcript: !!transcript,
      },
      created_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) {
    console.error('[webhook-granola] insert error:', error);
    return json({ error: error.message }, 500);
  }

  console.log(`[webhook-granola] event created: ${event.id} company=${companyName} deal=${dealId}`);
  return json({ ok: true, event_id: event.id, deal_matched: !!dealId });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/**
 * Try to extract a company name from a meeting title.
 * Handles: "Call with ACME", "Demo — ACME Corp", "ACME | Discovery"
 */
function extractCompany(title: string): string {
  if (!title) return '';
  const cleaned = title
    .replace(/^(call with|demo with|demo —|meeting with|reunión con|discovery —)\s*/i, '')
    .replace(/\s*[|—]\s*(call|demo|discovery|propuesta|follow[- ]?up|reunión).*$/i, '')
    .replace(/\s*(call|demo|discovery|meeting|reunión)$/i, '')
    .trim();
  return cleaned.length > 2 ? cleaned : '';
}
