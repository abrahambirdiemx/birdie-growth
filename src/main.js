// ── Birdie Growth Dashboard — Entry Point
import './styles/main.css';
import { checkSession, doLogin, doLogout, refreshToken } from './modules/auth.js';
import { pipeLoad, pipeRender, pipeSetData, setPipeChangeCb,
         pipeUpdateField, pipeSave, pipeDeleteCurrent, pipeSort, pipeGoPage,
         pipeNewDeal, pipeOpenEdit, pipeToggleGroup, pipeToggleStageCollapse,
         pipeStatusChange, pipeSaveCierreMonth, promptDateEvent, saveDateEvent,
         pipeExport, crmDealSearch, crmDealSelect }      from './modules/pipeline.js';
import { crmLoad, crmRender, crmSetData, crmSort, crmGoPage, crmOpenEdit,
         crmSave, crmDeleteCurrent, crmCloseModal, crmExportCSV } from './modules/crm.js';
import { kpiLogsLoad, kpiSetData, renderKPITab, updateGoalsFromLogs,
         setActType, submitLogEntry, deleteLogEntry,
         clearLogForm, exportKPILog, addCard,
         renderInitBoard, saveInit, deleteInit }          from './modules/kpi.js';
import { renderDashboard, parseSupabaseData, showProjDeals } from './modules/dashboard.js';
import { showToast, debounce }                           from './modules/utils.js';
import { sbFetch, sbRealtime, sbRealtimeStop }           from './api/supabase.js';
import { goalsLoad, goalsSave, currentQuarter,
         goalsHandleRealtimeChange }                     from './modules/goals.js';

// Wire dashboard refresh to pipeline data changes
setPipeChangeCb(data => renderDashboard(parseSupabaseData(data)));

// ── UI utility functions (used by inline HTML onclick handlers)
function switchTab(id, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  const tab = document.getElementById('tab-' + id);
  if (tab) tab.classList.add('active');
  if (btn) btn.classList.add('active');
}
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}
function toggleAccount(header) {
  const detail = header.nextElementSibling;
  if (!detail) return;
  detail.classList.toggle('open');
  const chevron = header.querySelector('.account-chevron');
  if (chevron) chevron.textContent = detail.classList.contains('open') ? '▲' : '▼';
}
const pipeRenderDebounced = debounce(pipeRender, 200);

// ── Expose globals needed by inline HTML onclick handlers
// (In Vite these are module-scoped; we expose on window for compatibility
//  until the HTML templates are fully componentized)
Object.assign(window, {
  // Auth
  doLogin, doLogout,
  // UI utilities
  switchTab, openModal, closeModal, toggleAccount,
  // Pipeline
  pipeLoad, pipeRender, pipeRenderDebounced,
  pipeUpdateField, pipeSave, pipeDeleteCurrent, pipeSort, pipeGoPage,
  pipeNewDeal, pipeOpenEdit, pipeToggleGroup, pipeToggleStageCollapse,
  pipeStatusChange, pipeSaveCierreMonth, promptDateEvent, saveDateEvent,
  pipeExport, crmDealSearch, crmDealSelect,
  // CRM
  crmLoad, crmRender, crmSort, crmGoPage, crmOpenEdit,
  crmSave, crmDeleteCurrent, crmCloseModal, crmExportCSV,
  // KPI
  kpiLogsLoad, renderKPITab, updateGoalsFromLogs,
  setActType, submitLogEntry, deleteLogEntry,
  clearLogForm, exportKPILog, addCard,
  // Initiatives board
  renderInitBoard, saveInit, deleteInit,
  // Dashboard
  renderDashboard, showProjDeals,
  // Utils
  showToast, debounce,
  // Goals
  goalsLoad, goalsSave, currentQuarter,
});

// ── App bootstrap
export function startApp(user) {
  // Show dashboard, hide login
  document.getElementById('login-screen')?.classList.add('hidden');
  const appRoot = document.getElementById('app-root');
  if (appRoot) appRoot.style.display = 'block';

  // Store user email for audit fields
  window._sbUserEmail = user.email;

  // Show user in topbar
  const greet = document.getElementById('topbar-user');
  if (greet) greet.textContent = '👤 ' + user.name;

  // Load all data
  pipeLoad();
  crmLoad();
  kpiLogsLoad();
  renderInitBoard();
  startLiveClock();

  // ── Realtime: replace polling with WebSocket push ────────────────────────
  // Supabase pushes changes instantly — no more 30-60s polling lag.
  // Falls back to poll if WebSocket fails (e.g. corporate firewall).
  startRealtime();

  // Fallback polling (60s) — only fires if realtime fails/lags
  startAutoSync(60_000);

  // Refresh auth token every 50 minutes (tokens expire in 60m)
  setInterval(refreshToken, 50 * 60 * 1000);
}

// ── Realtime subscriptions ────────────────────────────────────────────────────
let _realtime = null;
function startRealtime() {
  if (_realtime) _realtime.close();
  _realtime = sbRealtime({
    // Pipeline changes — agent writes a deal, dashboard updates instantly
    pipeline: ({ eventType, record, old_record }) => {
      if (!window._pipeData) return;
      if (eventType === 'INSERT') {
        window._pipeData = [record, ...window._pipeData];
      } else if (eventType === 'UPDATE') {
        window._pipeData = window._pipeData.map(r => r.id === record.id ? record : r);
      } else if (eventType === 'DELETE') {
        window._pipeData = window._pipeData.filter(r => r.id !== old_record?.id);
      }
      pipeRender();
      renderDashboard(parseSupabaseData(window._pipeData));
      window._lastSyncLabel = new Date().toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' }) + ' (live)';
    },

    // Goals updated by another user or agent — refresh progress bars
    goals: (payload) => {
      goalsHandleRealtimeChange(payload);
      updateGoalsFromLogs();
    },

    // Agent events — new post-call intelligence or agent action
    agent_events: ({ eventType, record }) => {
      if (eventType === 'INSERT' && record?.status === 'pending') {
        showAgentEventNotification(record);
      }
    },
  });
}

// ── Agent event notification (Action Sidebar) ─────────────────────────────────
function showAgentEventNotification(event) {
  const icons = {
    call_completed: '📞',
    deal_created:   '🆕',
    stage_changed:  '🔄',
    proposal_sent:  '📄',
  };
  const icon = icons[event.event_type] || '⚡';
  const company = event.company ? ` — ${event.company}` : '';
  showToast(`${icon} ${event.event_type}${company}`, 'ok');

  // Update the agent events badge in the UI (if sidebar exists)
  const badge = document.getElementById('agent-events-badge');
  if (badge) {
    const count = parseInt(badge.dataset.count || '0') + 1;
    badge.dataset.count = count;
    badge.textContent = count;
    badge.style.display = 'flex';
  }
}

// ── Live clock — updates topbar every minute
function startLiveClock() {
  const tick = () => {
    const now     = new Date();
    const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const sub     = document.getElementById('topbar-sub');
    if (sub) sub.textContent = `${dateStr} · ${timeStr} · Sync: ${window._lastSyncLabel || 'pendiente'}`;
  };
  tick();
  setInterval(tick, 60_000);
}

// ── Background auto-sync every 2 minutes (silent — no toasts)
let _syncTimer = null;
function startAutoSync(ms = 120_000) {
  if (_syncTimer) clearInterval(_syncTimer);
  _syncTimer = setInterval(async () => {
    try {
      const [pipe, crm, kpi] = await Promise.all([
        sbFetch('GET', `pipeline?select=*&order=created_at.desc&limit=2000`),
        sbFetch('GET', `crm?select=id,n,r,st,ind,e,sz,c,p,em,tel,mrr,acv,notes,created_at&order=created_at.desc&limit=5000`),
        sbFetch('GET', `kpi_logs?select=id,date,seller,type,company,canal,acv,mrr,impl,notes,created_at&order=created_at.desc&limit=2000`),
      ]);
      // Update module-scoped caches via proper setters (window.* doesn't reach module scope)
      if (Array.isArray(pipe)) pipeSetData(pipe);  // renders pipeline + fires dashboard callback
      if (Array.isArray(crm))  crmSetData(crm);    // renders CRM table
      if (Array.isArray(kpi))  kpiSetData(kpi);    // renders KPI log + goals
      window._lastSyncLabel = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) + ' (auto)';
    } catch { /* silent — no toast spam on background sync */ }
  }, ms);
}

// ── DOMContentLoaded — check session or show login
document.addEventListener('DOMContentLoaded', () => {
  startLiveClock(); // always run clock
  if (!checkSession()) {
    document.getElementById('login-screen')?.classList.remove('hidden');
    const ar = document.getElementById('app-root');
    if (ar) ar.style.display = 'none';
  }
});
