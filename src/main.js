// ── Birdie Growth Dashboard — Entry Point
import './styles/main.css';
import { checkSession, doLogin, doLogout, refreshToken } from './modules/auth.js';
import { pipeLoad, pipeRender, setPipeChangeCb,
         pipeUpdateField, pipeSave, pipeDeleteCurrent, pipeSort, pipeGoPage,
         pipeNewDeal, pipeOpenEdit, pipeToggleGroup, pipeToggleStageCollapse,
         pipeStatusChange, pipeSaveCierreMonth, promptDateEvent, saveDateEvent,
         pipeExport, crmDealSearch, crmDealSelect }      from './modules/pipeline.js';
import { crmLoad, crmRender, crmSort, crmGoPage, crmOpenEdit,
         crmSave, crmDeleteCurrent, crmCloseModal, crmExportCSV } from './modules/crm.js';
import { kpiLogsLoad, renderKPITab, updateGoalsFromLogs,
         setActType, submitLogEntry, deleteLogEntry,
         clearLogForm, exportKPILog, addCard }           from './modules/kpi.js';
import { renderDashboard, parseSupabaseData, showProjDeals } from './modules/dashboard.js';
import { showToast, debounce }                           from './modules/utils.js';
import { sbFetch }                                       from './api/supabase.js';

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
  // Dashboard
  renderDashboard, showProjDeals,
  // Utils
  showToast, debounce,
});

// ── App bootstrap
export function startApp(user) {
  // Show dashboard, hide login
  document.getElementById('login-screen')?.classList.add('hidden');
  const appRoot = document.getElementById('app-root');
  if (appRoot) appRoot.style.display = 'block';

  // Show user in topbar
  const greet = document.getElementById('topbar-user');
  if (greet) greet.textContent = '👤 ' + user.name;

  // Load all data
  pipeLoad();
  crmLoad();
  kpiLogsLoad();
  startAutoSync(30000);
  startLiveClock();

  // Refresh auth token every 50 minutes (tokens expire in 60m)
  setInterval(refreshToken, 50 * 60 * 1000);
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

// ── Background auto-sync every 30s
let _syncTimer = null;
function startAutoSync(ms = 30_000) {
  if (_syncTimer) clearInterval(_syncTimer);
  _syncTimer = setInterval(async () => {
    try {
      const [pipe, crm, kpi] = await Promise.all([
        sbFetch('GET', `pipeline?select=*&order=created_at.desc&limit=2000`),
        sbFetch('GET', `crm?select=id,n,r,st,ind,e,sz,c,p,em,tel,mrr,acv,notes,created_at&order=created_at.desc&limit=5000`),
        sbFetch('GET', `kpi_logs?select=id,date,seller,type,company,canal,acv,mrr,impl,notes,created_at&order=created_at.desc&limit=2000`),
      ]);
      // Update global caches (modules export these setters)
      if (Array.isArray(pipe)) { window._pipeData = pipe; pipeRender(); renderDashboard(parseSupabaseData(pipe)); }
      if (Array.isArray(crm))  window._crmData = crm;
      if (Array.isArray(kpi))  { window._kpiLogs = kpi; updateGoalsFromLogs(); }
      window._lastSyncLabel = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) + ' (auto)';
    } catch { /* silent fail */ }
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
