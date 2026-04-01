// ── Supabase REST client
// All API calls go through these two functions.
// sbHeaders() uses the Supabase access_token when the user is logged in,
// falling back to the anon key for public/pre-auth requests.

export const SB_URL  = 'https://xjrgqborwhvyqgrczetq.supabase.co';
export const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqcmdxYm9yd2h2eXFncmN6ZXRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODc5ODksImV4cCI6MjA5MDQ2Mzk4OX0.DWOoshMXxmQk0deq2jEnOOAFpr_pyE9aWenvu_GPzLs';

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
