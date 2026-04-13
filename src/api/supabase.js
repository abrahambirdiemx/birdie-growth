// ── Supabase REST + Realtime client
// All API calls and realtime subscriptions go through this module.
// sbHeaders() uses the Supabase access_token when the user is logged in,
// falling back to the anon key for public/pre-auth requests.

export const SB_URL  = 'https://xjrgqborwhvyqgrczetq.supabase.co';
export const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqcmdxYm9yd2h2eXFncmN6ZXRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODc5ODksImV4cCI6MjA5MDQ2Mzk4OX0.DWOoshMXxmQk0deq2jEnOOAFpr_pyE9aWenvu_GPzLs';

// Edge Function base URL — used by agents and webhooks
export const SB_FUNCTIONS = `${SB_URL}/functions/v1`;

export function sbHeaders() {
  const token = window._sbAccessToken || SB_ANON;
  return {
    'Content-Type':  'application/json',
    'apikey':        SB_ANON,
    'Authorization': 'Bearer ' + token,
    'Prefer':        'return=representation',
  };
}

export async function sbFetch(method, path, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: sbHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || r.status);
  }
  return r.status === 204 ? null : r.json();
}

// ── Supabase Realtime ────────────────────────────────────────────────────────
// Replaces the 60-second polling with WebSocket push updates.
// The dashboard updates instantly when an agent writes data or a webhook fires.

let _wsConn = null;

/**
 * Subscribe to realtime changes on one or more tables.
 *
 * Usage:
 *   sbRealtime({
 *     pipeline:     (payload) => handlePipelineChange(payload),
 *     agent_events: (payload) => handleNewAgentEvent(payload),
 *     goals:        (payload) => handleGoalChange(payload),
 *   });
 */
export function sbRealtime(handlers = {}) {
  if (_wsConn) {
    _wsConn.close();
    _wsConn = null;
  }

  const token = window._sbAccessToken || SB_ANON;

  // Build Supabase Realtime WebSocket URL
  const wsUrl = `${SB_URL.replace('https://', 'wss://')}/realtime/v1/websocket?apikey=${SB_ANON}&vsn=1.0.0`;

  const ws = new WebSocket(wsUrl);
  _wsConn = ws;

  const subscriptionId = `birdie-${Date.now()}`;

  ws.onopen = () => {
    // Authenticate the realtime connection
    ws.send(JSON.stringify({
      topic:   'realtime:*',
      event:   'phx_join',
      payload: { access_token: token },
      ref:     '1',
    }));

    // Subscribe to each requested table
    Object.entries(handlers).forEach(([table], i) => {
      ws.send(JSON.stringify({
        topic:   `realtime:public:${table}`,
        event:   'phx_join',
        payload: {
          config: {
            broadcast:  { self: false },
            presence:   { key: '' },
            postgres_changes: [{
              event: '*', schema: 'public', table,
            }],
          },
          access_token: token,
        },
        ref: String(i + 2),
      }));
    });

    console.log('[realtime] connected, subscribed to:', Object.keys(handlers).join(', '));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      // Keep-alive heartbeat
      if (msg.event === 'phx_reply' && msg.payload?.status === 'ok') return;
      if (msg.event === 'heartbeat') {
        ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: 'hb' }));
        return;
      }

      // Postgres change event
      if (msg.event === 'postgres_changes') {
        const { table, record, old_record, eventType } = msg.payload?.data || {};
        const handler = handlers[table];
        if (handler) {
          handler({ eventType, record, old_record, table });
        }
      }
    } catch (e) {
      console.warn('[realtime] parse error:', e);
    }
  };

  ws.onerror = (err) => {
    console.warn('[realtime] WebSocket error — will fall back to polling', err);
  };

  ws.onclose = (e) => {
    if (e.code !== 1000) {
      // Unexpected close — reconnect after 5s
      console.log('[realtime] disconnected, reconnecting in 5s…');
      setTimeout(() => sbRealtime(handlers), 5000);
    }
  };

  return {
    close: () => {
      if (_wsConn) { _wsConn.close(1000, 'user logout'); _wsConn = null; }
    },
  };
}

/**
 * Stop all realtime subscriptions (call on logout).
 */
export function sbRealtimeStop() {
  if (_wsConn) { _wsConn.close(1000, 'logout'); _wsConn = null; }
}
