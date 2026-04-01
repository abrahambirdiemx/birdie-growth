import { MONTH_NAMES_ES } from './config.js';

// ── Formatting helpers
export function fmt$(n)        { return n ? '$' + Number(n).toLocaleString() : '—'; }
export function fmtMRR(n)      { return n ? '$' + Number(n).toLocaleString() + '/mo' : '—'; }
export function parseMoney(v)  { return Number(String(v||'').replace(/[$,\s]/g,'')) || 0; }
export function parsePipeMoney(v) { return typeof v==='number' ? v : parseMoney(v); }

export function fmtMonth(ym) {
  if (!ym || ym.length < 7) return '—';
  const [y, m] = ym.split('-');
  return MONTH_NAMES_ES[parseInt(m) - 1] + ' ' + y;
}

export function daysBetween(d1, d2) {
  if (!d1 || !d2) return null;
  return Math.round((new Date(d2) - new Date(d1)) / 86400000);
}

// ── Debounce
export function debounce(fn, ms) {
  let t;
  return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}

// ── Toast notifications
export function showToast(msg, type = '') {
  let el = document.getElementById('toast-container');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-container';
    el.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px';
    document.body.appendChild(el);
  }
  const t = document.createElement('div');
  const bg = type === 'err' ? '#dc2626' : type === 'ok' ? '#16a34a' : '#1e293b';
  t.style.cssText = `background:${bg};color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,.3);animation:fadeIn .2s ease`;
  t.textContent = msg;
  el.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
