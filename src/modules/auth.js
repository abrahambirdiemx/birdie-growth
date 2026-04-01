import { SB_URL, SB_ANON } from '../api/supabase.js';
import { startApp } from '../main.js';

const SESSION_KEY = 'birdie_session_v2';

// Display names per email — no passwords here
const USER_NAMES = {
  'abraham@birdie.mx': 'Abraham Lopez',
  'hector@birdie.mx':  'Héctor Nícola',
  'daniel@birdie.mx':  'Daniel Luna',
};

// ── Login via Supabase Auth REST
export async function doLogin() {
  const email    = document.getElementById('login-email')?.value.trim().toLowerCase() || '';
  const password = document.getElementById('login-password')?.value || '';
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');
  if (!email || !password) { if (errEl) errEl.textContent = 'Ingresa email y contraseña'; return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Verificando…'; }
  try {
    const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SB_ANON },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || 'Credenciales incorrectas');
    const name    = USER_NAMES[email] || data.user?.email || email;
    const session = { email, name, access_token: data.access_token, refresh_token: data.refresh_token };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    window._sbAccessToken = data.access_token;
    startApp({ name, email });
  } catch (e) {
    if (errEl) errEl.textContent = e.message;
    if (document.getElementById('login-password')) document.getElementById('login-password').value = '';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Iniciar sesión →'; }
  }
}

// ── Restore session from sessionStorage
export function checkSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (s?.access_token) {
      window._sbAccessToken = s.access_token;
      startApp({ name: s.name || s.email, email: s.email });
      refreshToken(); // background refresh
      return true;
    }
  } catch {}
  return false;
}

// ── Silently refresh the access_token before it expires (1h)
export async function refreshToken() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (!s?.refresh_token) return false;
    const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SB_ANON },
      body:    JSON.stringify({ refresh_token: s.refresh_token }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    s.access_token  = data.access_token;
    s.refresh_token = data.refresh_token;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    window._sbAccessToken = data.access_token;
    return true;
  } catch { return false; }
}

// ── Logout — invalidate token in Supabase + clear session
export async function doLogout() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (s?.access_token) {
      await fetch(`${SB_URL}/auth/v1/logout`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SB_ANON, 'Authorization': 'Bearer ' + s.access_token },
      });
    }
  } catch {}
  sessionStorage.removeItem(SESSION_KEY);
  window._sbAccessToken = null;
  location.reload();
}
