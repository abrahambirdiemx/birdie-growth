import { sbFetch } from '../api/supabase.js';
import { showToast } from './utils.js';
import { SELLERS, STAGE_PROB } from './config.js';

// ─── KPI TAB ──────────────────────────────────────────────────────────────

// KPI per-seller data now comes from _pipeData (Supabase)
let _currentActType  = '';

// Set today's date in the log form on load
document.addEventListener('DOMContentLoaded', () => {
  const d = document.getElementById('log-date');
  if (d) d.value = new Date().toISOString().slice(0,10);
  renderLogTable();
});

function setActType(type, btn) {
  _currentActType = type;
  document.querySelectorAll('.atype-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // Show/hide conditional fields
  const showCanal   = type === 'lead';
  const showValues  = ['propuesta','close','won'].includes(type);
  const showImpl    = type === 'won';
  document.getElementById('field-canal').classList.toggle('visible', showCanal);
  document.getElementById('field-valores').classList.toggle('visible', showValues);
  document.getElementById('field-impl').classList.toggle('visible', showImpl);
}

function clearLogForm() {
  _currentActType = '';
  document.querySelectorAll('.atype-btn').forEach(b => b.classList.remove('active'));
  ['log-seller','log-company','log-canal','log-acv','log-mrr','log-impl','log-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('log-date').value = new Date().toISOString().slice(0,10);
  ['field-canal','field-valores','field-impl'].forEach(id =>
    document.getElementById(id).classList.remove('visible')
  );
}

async function submitLogEntry() {
  const seller  = document.getElementById('log-seller').value;
  const date    = document.getElementById('log-date').value;
  const company = document.getElementById('log-company').value.trim();
  if (!seller)  { showToast('⚠ Selecciona un vendedor','err'); return; }
  if (!date)    { showToast('⚠ Selecciona una fecha','err'); return; }
  if (!_currentActType) { showToast('⚠ Selecciona el tipo de actividad','err'); return; }
  if (!company) { showToast('⚠ Ingresa el nombre de la empresa','err'); return; }
  const entry = {
    id:      Date.now(),
    date,
    seller,
    type:    _currentActType,
    company,
    canal:   document.getElementById('log-canal').value || '',
    acv:     Number(document.getElementById('log-acv').value)  || 0,
    mrr:     Number(document.getElementById('log-mrr').value)  || 0,
    impl:    Number(document.getElementById('log-impl').value) || 0,
    notes:   document.getElementById('log-notes').value.trim(),
  };
  try {
    await sbFetch('POST', 'kpi_logs', [entry]);
    _kpiLogs.unshift(entry);
    showToast('✅ Actividad registrada — ' + company, 'ok');
    clearLogForm();
    renderLogTable();
    renderKPITab();
    updateGoalsFromLogs();
  } catch(e) { showToast('Error guardando actividad: ' + e.message, 'err'); }
}

let _kpiLogs = [];  // KPI log cache (loaded from Supabase)

// ── kpiLogsLoad: fetch logs from Supabase, migrate localStorage on first run
async function kpiLogsLoad() {
  try {
    const data = await sbFetch('GET', 'kpi_logs?select=id,date,seller,type,company,canal,acv,mrr,impl,notes,created_at&order=created_at.desc&limit=2000');
    _kpiLogs = Array.isArray(data) ? data : [];
    // One-time migration: move localStorage logs to Supabase
    if (_kpiLogs.length === 0) {
      const stored = localStorage.getItem('kpi_log');
      if (stored) {
        const localLogs = JSON.parse(stored);
        if (localLogs.length > 0) {
          await sbFetch('POST', 'kpi_logs', localLogs);
          _kpiLogs = localLogs;
          localStorage.removeItem('kpi_log');
          showToast('✅ ' + localLogs.length + ' actividades migradas a Supabase', 'ok');
        }
      }
    }
    renderLogTable();
    renderKPITab();
    updateGoalsFromLogs();
  } catch(e) {
    // Fallback to localStorage
    try { _kpiLogs = JSON.parse(localStorage.getItem('kpi_log') || '[]'); } catch { _kpiLogs = []; }
    renderLogTable(); renderKPITab(); updateGoalsFromLogs();
  }
}

function getKPILogs() {
  return _kpiLogs;
}

async function deleteLogEntry(id) {
  try {
    await sbFetch('DELETE', `kpi_logs?id=eq.${id}`);
    _kpiLogs = _kpiLogs.filter(e => e.id !== id);
  } catch(e) {
    // Fallback: remove locally
    _kpiLogs = _kpiLogs.filter(e => e.id !== id);
  }
  renderLogTable();
  renderKPITab();
  updateGoalsFromLogs();
}

const ACT_CONFIG = {
  lead:      { label:'🎯 Lead Calificado', cls:'act-lead'  },
  discovery: { label:'🔭 Discovery',       cls:'act-disc'  },
  demo:      { label:'💻 Demo',            cls:'act-demo'  },
  propuesta: { label:'💰 Propuesta',       cls:'act-prop'  },
  close:     { label:'🤝 Próx. a Cerrar',  cls:'act-close' },
  won:       { label:'🏆 Deal Ganado',     cls:'act-won'   },
};

function renderLogTable() {
  const tbody = document.getElementById('log-table-body');
  if (!tbody) return;
  const sellerF = document.getElementById('kpi-seller-filter');
  const periodF = document.getElementById('kpi-period-filter');
  const seller  = sellerF ? sellerF.value : 'all';
  const period  = periodF ? periodF.value : 'month';
  let logs = getKPILogs();
  if (seller !== 'all') logs = logs.filter(e => e.seller === seller);
  logs = filterByPeriod(logs, period);
  if (!logs.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="no-data">Sin registros para este filtro.</td></tr>';
    return;
  }
  tbody.innerHTML = logs.map(e => {
    const cfg = ACT_CONFIG[e.type] || { label: e.type, cls:'' };
    return `<tr>
      <td style="white-space:nowrap">${e.date}</td>
      <td><span class="owner-chip">${e.seller.split(' ')[0]}</span></td>
      <td><span class="act-badge ${cfg.cls}">${cfg.label}</span></td>
      <td style="font-weight:600">${e.company}</td>
      <td style="color:var(--muted)">${e.canal || '—'}</td>
      <td style="font-weight:700">${e.acv ? '$'+e.acv.toLocaleString() : '—'}</td>
      <td style="color:var(--green-text);font-weight:700">${e.mrr ? '$'+e.mrr.toLocaleString()+'/mo' : '—'}</td>
      <td style="color:#7c3aed;font-weight:700">${e.impl ? '$'+e.impl.toLocaleString() : '—'}</td>
      <td style="color:var(--muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${e.notes}">${e.notes || '—'}</td>
      <td><button class="del-btn" onclick="deleteLogEntry(${e.id})" title="Eliminar">✕</button></td>
    </tr>`;
  }).join('');
}

function filterByPeriod(arr, period) {
  if (period === 'all') return arr;
  const now = new Date();
  if (period === 'month') {
    const y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2,'0');
    const prefix = y+'-'+m;
    return arr.filter(e => e.date && e.date.startsWith(prefix));
  }
  if (period === 'week') {
    const day = now.getDay() || 7;
    const mon = new Date(now); mon.setDate(now.getDate() - day + 1); mon.setHours(0,0,0,0);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return arr.filter(e => { const d = new Date(e.date); return d >= mon && d <= sun; });
  }
  return arr;
}

function renderKPITab() {
  renderSellerCards();
  renderChannelBreakdown();
  renderLogTable();
  updateGoalsFromLogs();
}

function updateGoalsFromLogs() {
  // Update goal progress bars from the KPI activity log (month-to-date)
  const logs = filterByPeriod(getKPILogs(), 'month');

  // Update card title to current month
  const now = new Date();
  const monthName = now.toLocaleString('es', { month: 'long' });
  const titleEl = document.querySelector('.card-title');
  if (titleEl && titleEl.textContent.startsWith('Metas')) {
    titleEl.textContent = 'Metas ' + monthName.charAt(0).toUpperCase() + monthName.slice(1) + ' · Progreso';
  }

  const MAP = [
    { id: 'calificado', type: 'lead',      goal: 150 },
    { id: 'discovery',  type: 'discovery', goal: 50  },
    { id: 'demo',       type: 'demo',      goal: 25  },
    { id: 'propuesta',  type: 'propuesta', goal: 25  },
  ];
  MAP.forEach(m => {
    const count = logs.filter(e => e.type === m.type).length;
    const pct = Math.min(Math.round(count / m.goal * 100), 100);
    const el   = document.getElementById('g-' + m.id);
    const fill = document.getElementById('gf-' + m.id);
    const sub  = document.getElementById('gs-' + m.id);
    if (el)   el.textContent = count;
    if (fill) fill.style.width = pct + '%';
    if (sub)  sub.textContent = pct + '% de meta ' + m.goal + ' · faltan ' + Math.max(m.goal - count, 0);
  });
}

function renderSellerCards() {
  const grid = document.getElementById('seller-cards-grid');
  if (!grid) return;
  const sellerF = document.getElementById('kpi-seller-filter');
  const periodF = document.getElementById('kpi-period-filter');
  const sellerFilter = sellerF ? sellerF.value : 'all';
  const period = periodF ? periodF.value : 'month';

  const logs = filterByPeriod(getKPILogs(), period);
  const sellers = sellerFilter === 'all' ? SELLERS : SELLERS.filter(s => s.name === sellerFilter);

  grid.innerHTML = sellers.map(s => {
    // Pipeline metrics from Supabase (_pipeData)
    let at = { cal:0, disc:0, demo:0, prop:0, c2c:0, cerrado:0, acv:0, mrr:0, impl:0 };
    (_pipeData||[]).filter(r=>r.owner===s.name).forEach(r => {
      const status = r.status||'';
      const acv  = parseFloat(r.acv)||0;
      const mrr  = parseFloat(r.mrr)||0;
      const impl = parseFloat(r.implementaciones)||0;
      if (status==='Calificado')    { at.cal++;     at.acv+=acv; }
      if (status==='Discovery')     { at.disc++;    at.acv+=acv; }
      if (status==='Demo')          { at.demo++;    at.acv+=acv; }
      if (status==='Propuesta')     { at.prop++;    at.acv+=acv; }
      if (status==='Close 2 close') { at.c2c++;     at.acv+=acv; }
      if (status==='Cerrado')       { at.cerrado++; at.mrr+=mrr; at.impl+=impl; at.acv+=acv; }
    });
    // Manual log totals for this seller
    const sLogs = logs.filter(e => e.seller === s.name);
    const wonLogs = sLogs.filter(e => e.type === 'won');
    const logWonACV = wonLogs.reduce((a,e) => a+e.acv, 0);
    const logWonMRR = wonLogs.reduce((a,e) => a+e.mrr, 0);
    const logWonImpl = wonLogs.reduce((a,e) => a+e.impl, 0);

    const displayACV  = at.acv  || logWonACV  || 0;
    const displayMRR  = at.mrr  || logWonMRR  || 0;
    const displayImpl = at.impl || logWonImpl || 0;

    return `<div class="seller-card">
      <div class="seller-header">
        <div class="seller-avatar" style="background:${s.color}">${s.initial}</div>
        <div>
          <div class="seller-name">${s.name}</div>
          <div class="seller-role">${at.acv ? 'Pipeline desde Supabase' : 'Sin datos sync — usa ⚡ Sync'}</div>
        </div>
      </div>
      <div class="seller-metrics">
        <div class="seller-metric"><div class="sm-val" style="color:#3b6ef8">${at.cal || sLogs.filter(e=>e.type==='lead').length || '—'}</div><div class="sm-lbl">Calificados</div></div>
        <div class="seller-metric"><div class="sm-val" style="color:#7c3aed">${at.disc || sLogs.filter(e=>e.type==='discovery').length || '—'}</div><div class="sm-lbl">Discovery</div></div>
        <div class="seller-metric"><div class="sm-val" style="color:#16a34a">${at.cerrado || sLogs.filter(e=>e.type==='won').length || '—'}</div><div class="sm-lbl">Cerrados</div></div>
        <div class="seller-metric"><div class="sm-val" style="color:#ea580c">${at.prop || sLogs.filter(e=>e.type==='propuesta').length || '—'}</div><div class="sm-lbl">Propuestas</div></div>
        <div class="seller-metric"><div class="sm-val" style="color:#15803d">${at.c2c || sLogs.filter(e=>e.type==='close').length || '—'}</div><div class="sm-lbl">Close 2c</div></div>
        <div class="seller-metric"><div class="sm-val" style="color:#6d28d9">${at.demo || sLogs.filter(e=>e.type==='demo').length || '—'}</div><div class="sm-lbl">Demos</div></div>
      </div>
      <div class="seller-footer">
        ${displayACV  ? `<span class="sf-tag sf-acv">ACV: $${displayACV.toLocaleString()}</span>` : ''}
        ${displayMRR  ? `<span class="sf-tag sf-mrr">MRR: $${displayMRR.toLocaleString()}/mo</span>` : ''}
        ${displayImpl ? `<span class="sf-tag sf-impl">Impl: $${displayImpl.toLocaleString()}</span>` : ''}
        ${!displayACV && !displayMRR ? '<span style="font-size:10px;color:var(--muted)">Carga el pipeline para ver valores</span>' : ''}
      </div>
    </div>`;
  }).join('');
}

function renderChannelBreakdown() {
  const el = document.getElementById('channel-breakdown');
  if (!el) return;
  const sellerF = document.getElementById('kpi-seller-filter');
  const periodF = document.getElementById('kpi-period-filter');
  const seller = sellerF ? sellerF.value : 'all';
  const period = periodF ? periodF.value : 'month';
  let logs = getKPILogs().filter(e => e.type === 'lead' && e.canal);
  if (seller !== 'all') logs = logs.filter(e => e.seller === seller);
  logs = filterByPeriod(logs, period);
  if (!logs.length) {
    el.innerHTML = '<span style="color:var(--muted);font-size:12px">Sin registros de canal aún — registra leads para ver el desglose.</span>';
    return;
  }
  const counts = {};
  logs.forEach(e => { counts[e.canal] = (counts[e.canal]||0)+1; });
  const CANAL_EMOJIS = {
    'LinkedIn':'💼','Referido':'🤝','Outbound (email/llamada)':'📧',
    'Inbound (web/form)':'🌐','Evento / Feria':'🎪','Partnership':'🔗','Otro':'📌'
  };
  const total = logs.length;
  el.innerHTML = Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([canal,cnt]) =>
    `<span class="channel-pill">${CANAL_EMOJIS[canal]||'📌'} ${canal} <span class="channel-count">${cnt}</span> <span style="font-size:10px;color:var(--muted)">${Math.round(cnt/total*100)}%</span></span>`
  ).join('') + `<span style="margin-left:auto;font-size:11px;color:var(--muted);align-self:center">Total: <strong>${total}</strong> leads</span>`;
}

function exportKPILog() {
  const logs = getKPILogs();
  if (!logs.length) { showToast('Sin datos para exportar','err'); return; }
  const header = ['Fecha','Vendedor','Tipo','Empresa','Canal','ACV','MRR','Implementación','Notas'];
  const rows = logs.map(e => [
    e.date, e.seller,
    ACT_CONFIG[e.type]?.label || e.type,
    e.company, e.canal, e.acv||'', e.mrr||'', e.impl||'', e.notes
  ].map(v => '"'+String(v||'').replace(/"/g,'""')+'"').join(','));
  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url;
  a.download = 'birdie-kpi-log-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click(); URL.revokeObjectURL(url);
}

function addCard(colId) {
  const col = document.getElementById(colId);
  const btn = col.querySelector('.add-initiative-btn');
  const ph = col.querySelector('div[style*="text-align:center"]');
  if(ph) ph.remove();
  const card = document.createElement('div');
  card.className = 'initiative-card';
  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <input style="font-size:20px;width:40px;border:1px solid var(--border2);border-radius:6px;padding:2px;background:var(--card2)" value="📌">
      <input style="flex:1;border:1px solid var(--border2);border-radius:7px;padding:6px 10px;font-size:13px;font-weight:700;background:var(--card2)" placeholder="Nombre de la iniciativa">
    </div>
    <div class="initiative-field"><label>Responsable</label><select><option value="">— Asignar —</option><option>Abraham Lopez</option><option>Héctor Nícola</option><option>Daniel Luna</option><option>Equipo Marketing</option></select></div>
    <div class="initiative-field"><label>Status</label><select><option>Planeación</option><option>En progreso</option><option>En revisión</option><option>Completado ✓</option></select></div>
    <div class="initiative-field"><label>Fecha límite</label><input type="date"></div>
    <div class="initiative-field"><label>Notas</label><textarea placeholder="Notas, links, blockers..."></textarea></div>
    <button onclick="this.closest('.initiative-card').remove()" style="width:100%;padding:6px;border:1px solid #fecaca;background:#fef2f2;color:#dc2626;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;margin-top:6px">🗑 Eliminar</button>`;
  col.insertBefore(card, btn);
}

// Used by auto-sync in main.js to update module state without toast spam
function kpiSetData(data) {
  _kpiLogs = Array.isArray(data) ? data : [];
  renderLogTable();
  updateGoalsFromLogs();
}

export { kpiLogsLoad, kpiSetData, getKPILogs, submitLogEntry, deleteLogEntry,
         renderKPITab, renderLogTable, updateGoalsFromLogs,
         renderSellerCards, renderChannelBreakdown, setActType,
         clearLogForm, exportKPILog, addCard };
