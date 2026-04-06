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
  const MAP = [
    { id: 'calificado', type: 'lead',      goal: 150 },
    { id: 'discovery',  type: 'discovery', goal: 50  },
    { id: 'demo',       type: 'demo',      goal: 25  },
    { id: 'propuesta',  type: 'propuesta', goal: 25  },
  ];
  MAP.forEach(m => {
    const count = logs.filter(e => e.type === m.type).length;
    if (count === 0) return; // don't overwrite if no log entries yet
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

// Derive dashboard metrics directly from Supabase pipeline data
function parseSupabaseData(data) {
  const ACTIVE = new Set(['Weekly Hunt','Active Lead','Active lead','Calificado','Discovery','Demo','Propuesta','Close 2 close','Piloto']);
  const stageCounts = {}, stageACV = {};
  let totalACV=0, totalMRR=0, cerradoMRR=0, cerradoACV=0, cerradoImpl=0;
  let clienteMRR=0, clienteACV=0, clienteCount=0;
  let activeCount=0;
  const cerradoAccounts=[], clienteAccounts=[];
  // projected MRR by month: { 'YYYY-MM': { mrr, deals:[] } }
  const projectedByMonth = {};
  const today = new Date().toISOString().slice(0,7); // YYYY-MM

  for (const r of data) {
    const status = r.status||'';
    if (!status) continue;
    stageCounts[status] = (stageCounts[status]||0)+1;
    const acv  = parseFloat(r.acv)||0;
    const mrr  = parseFloat(r.mrr)||0;
    stageACV[status] = (stageACV[status]||0)+acv;
    if (ACTIVE.has(status)) { activeCount++; totalACV+=acv; totalMRR+=mrr; }

    if (status==='Cerrado') {
      const impl = parseFloat(r.implementaciones)||0;
      const cierreMonth = (r.cierre_date||'').slice(0,7);
      if (cierreMonth === today) {
        cerradoMRR+=mrr; cerradoACV+=acv; cerradoImpl+=impl;
      }
      cerradoAccounts.push({ name:r.opportunity_name||'(sin nombre)', mrr, acv, impl, owner:r.owner||'—', nextT:r.next_touchpoint||null, dias:r.ingreso_lead?daysBetween(r.ingreso_lead):null, cierre:r.cierre_date||null });
    }
    if (status==='Cliente') {
      clienteCount++; clienteMRR+=mrr; clienteACV+=acv;
      clienteAccounts.push({ name:r.opportunity_name||'(sin nombre)', mrr, acv, owner:r.owner||'—' });
    }
    // Projected MRR: deals with a future cierre_date and mrr
    if (mrr > 0 && r.cierre_date) {
      const cMonth = r.cierre_date.slice(0,7);
      if (cMonth >= today) {
        const prob = (r.probability ?? STAGE_PROB[status] ?? 50) / 100;
        if (!projectedByMonth[cMonth]) projectedByMonth[cMonth] = { projMRR:0, deals:[] };
        projectedByMonth[cMonth].projMRR += mrr * prob;
        projectedByMonth[cMonth].deals.push({ name:r.opportunity_name, mrr, prob:Math.round(prob*100), owner:r.owner, status });
      }
    }
  }

  return {
    total: data.length, activeCount,
    totalACV, totalMRR,
    cerradoMRR, cerradoACV, cerradoImpl,
    clienteMRR, clienteACV, clienteCount, clienteAccounts,
    stageCounts, stageACV,
    cerradoAccounts: cerradoAccounts.sort((a,b)=>b.mrr-a.mrr),
    projectedByMonth,
  };
}

function fmt$(n) {
  if (n >= 1000000) return '$' + (n/1000000).toFixed(1) + 'M';
  if (n >= 1000)    return '$' + Math.round(n/1000) + 'K';
  return '$' + n.toLocaleString();
}
function fmtMRR(n) { return '$' + n.toLocaleString() + '/mo'; }

function renderDashboard(d) {
  // ── KPIs — todos los 4 cards
  const cerradoCnt = d.stageCounts['Cerrado'] || 0;
  const mrrGoalPct = Math.round(d.cerradoMRR / 7000 * 100);

  function setEl(id, val) { const e = document.getElementById(id); if (e) e.textContent = val; }
  function setClass(id, cls) { const e = document.getElementById(id); if (e) { e.className = 'stat-delta ' + cls; } }

  // ACV Total
  setEl('kpi-acv',       fmt$(d.totalACV));
  setEl('kpi-acv-sub',   d.activeCount + ' deals con valor');
  setEl('kpi-acv-delta', '↑ ' + d.activeCount + ' deals activos · ' + d.total + ' totales');
  setClass('kpi-acv-delta', 'delta-new');

  // MRR Pipeline
  setEl('kpi-mrr-pipeline',       fmt$(d.totalMRR));
  setEl('kpi-mrr-pipeline-sub',   '/mes en deals activos');
  setEl('kpi-mrr-pipeline-delta', mrrGoalPct >= 100 ? '✅ Meta $7K superada · ' + mrrGoalPct + '%' : mrrGoalPct + '% de meta $7K');
  setClass('kpi-mrr-pipeline-delta', mrrGoalPct >= 100 ? 'delta-ok' : 'delta-warn');

  // Deals Activos
  setEl('kpi-activos',       d.activeCount);
  setEl('kpi-activos-sub',   'de ' + d.total + ' registros totales');
  setEl('kpi-activos-delta', '📊 ' + Object.keys(d.stageCounts).length + ' etapas · última sync ahora');
  setClass('kpi-activos-delta', 'delta-new');

  // MRR Confirmado
  setEl('kpi-mrr-confirmed',       '$' + d.cerradoMRR.toLocaleString());
  setEl('kpi-mrr-confirmed-sub',   '/mes · ' + cerradoCnt + ' cuenta' + (cerradoCnt !== 1 ? 's' : '') + ' cerrada' + (cerradoCnt !== 1 ? 's' : ''));
  setEl('kpi-mrr-confirmed-delta', mrrGoalPct >= 100 ? '🏆 META SUPERADA · ' + mrrGoalPct + '%' : '→ ' + mrrGoalPct + '% de meta $7K');
  setClass('kpi-mrr-confirmed-delta', mrrGoalPct >= 100 ? 'delta-ok' : 'delta-warn');

  // ── Goals (Metas de Marzo)
  // Las metas miden avance acumulado del mes, no el snapshot actual por etapa.
  // Solo se actualiza el MRR confirmado (dato exacto desde Cerrado).
  // Los conteos de leads/discovery/demo/propuesta se deben actualizar manualmente
  // desde la pestaña KPIs → Registro de Actividad.
  const mrrPct = Math.min(Math.round(d.cerradoMRR / 7000 * 100), 133);
  const gMrr = document.getElementById('g-mrr');
  const gfMrr = document.getElementById('gf-mrr');
  const gsMrr = document.getElementById('gs-mrr');
  if (gMrr) gMrr.textContent = '$' + d.cerradoMRR.toLocaleString();
  if (gfMrr) gfMrr.style.width = Math.min(mrrPct, 100) + '%';
  if (gsMrr) {
    const cerradoCnt = d.stageCounts['Cerrado'] || 0;
    gsMrr.textContent = mrrPct >= 100
      ? '✅ META SUPERADA · ' + mrrPct + '% · ' + cerradoCnt + ' cuentas'
      : mrrPct + '% · ' + cerradoCnt + ' cuentas · faltan $' + Math.max(7000 - d.cerradoMRR, 0).toLocaleString();
    gsMrr.style.color = mrrPct >= 100 ? 'var(--green-text)' : '';
    gsMrr.style.fontWeight = mrrPct >= 100 ? '700' : '';
  }

  // ── Funnel rows
  const STAGE_ORDER = [
    { key:'Calificado',     label:'✅ Calificado',     color:'linear-gradient(90deg,#3b6ef8,#6c4ef7)', textColor:'#3b6ef8' },
    { key:'Weekly Hunt',    label:'🌐 Weekly Hunt',   color:'#64748b', textColor:'#64748b' },
    { key:'Active lead',    label:'🎯 Active lead',    color:'#2563eb', textColor:'var(--text)' },
    { key:'Active Lead',    label:'🎯 Active Lead',    color:'#2563eb', textColor:'var(--text)' },
    { key:'Discovery',      label:'🔭 Discovery',      color:'#7c3aed', textColor:'#7c3aed' },
    { key:'Demo',           label:'💻 Demo',           color:'#5b21b6', textColor:'#6d28d9' },
    { key:'Propuesta',      label:'💰 Propuesta',      color:'#c2410c', textColor:'#ea580c' },
    { key:'Close 2 close',  label:'🤝 Close 2 close', color:'#15803d', textColor:'#15803d' },
    { key:'Cerrado',        label:'🔓 Cerrado',        color:'#1d4ed8', textColor:'#1d4ed8' },
    { key:'Piloto',         label:'🚀 Piloto',         color:'#4338ca', textColor:'#6d28d9' },
    { key:'Cliente',        label:'⭐ Cliente',         color:'#d97706', textColor:'#d97706' },
  ];
  const maxCount = Math.max(...STAGE_ORDER.map(s => d.stageCounts[s.key] || 0), 1);
  const fr = document.getElementById('funnel-rows');
  if (fr) {
    fr.innerHTML = STAGE_ORDER.map(s => {
      const cnt = d.stageCounts[s.key] || 0;
      const acv = d.stageACV[s.key] || 0;
      const pct = Math.max(Math.round(cnt / maxCount * 100), 2);
      const acvStr = acv > 0 ? fmt$(acv) : '—';
      const bg = s.color.startsWith('linear') ? s.color : s.color;
      return `
        <div class="funnel-row">
          <div class="funnel-stage" style="color:${s.textColor}">${s.label}</div>
          <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${pct}%;background:${bg}">${cnt}</div></div>
          <div class="funnel-count">${cnt}</div><div class="funnel-acv">${acvStr}</div>
        </div>`;
    }).join('');
  }

  // ── Cerrado KPIs
  const ck = document.getElementById('cerrado-kpis');
  if (ck) {
    const cerradoCnt = d.stageCounts['Cerrado'] || 0;
    const mrrGoalPct = Math.round(d.cerradoMRR / 7000 * 100);
    ck.innerHTML = `
      <div class="cerrado-kpi green">
        <div class="cerrado-kpi-value">$${d.cerradoMRR.toLocaleString()}</div>
        <div class="cerrado-kpi-label">MRR Confirmado / mes</div>
        <div class="cerrado-kpi-sub">${cerradoCnt} cuentas · En activación</div>
        <div class="cerrado-kpi-delta">✓ ${mrrGoalPct}% de meta $7K</div>
      </div>
      <div class="cerrado-kpi blue">
        <div class="cerrado-kpi-value">${fmt$(d.cerradoACV)}</div>
        <div class="cerrado-kpi-label">ACV Total Cerrado</div>
        <div class="cerrado-kpi-sub">Valor anual combinado</div>
      </div>
      <div class="cerrado-kpi purple">
        <div class="cerrado-kpi-value">$${d.cerradoImpl.toLocaleString()}</div>
        <div class="cerrado-kpi-label">Ingresos por Implementación</div>
        <div class="cerrado-kpi-sub">Setup + Onboarding</div>
      </div>`;
  }

  // ── Cerrado accounts
  const ca = document.getElementById('cerrado-accounts');
  if (ca) {
    if (d.cerradoAccounts.length === 0) {
      ca.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">Sin cuentas cerradas aún</div>';
    } else {
      ca.innerHTML = d.cerradoAccounts.map((acc, i) => {
        const today = new Date().toISOString().slice(0,10);
        const nextLabel = !acc.nextT ? '<span class="overdue">Sin registrar ⚠</span>'
          : acc.nextT < today ? `<span class="overdue">${acc.nextT} (vencido)</span>`
          : `<span style="color:var(--green-text)">${acc.nextT}</span>`;
        return `
          <div class="account-card${i < 2 ? ' is-new' : ''}">
            <div class="account-header" onclick="toggleAccount(this)">
              <div style="font-size:20px">🏢</div>
              <div class="account-name">${acc.name}</div>
              <span class="status-badge sb-activacion">⚡ Cerrado</span>
              <div style="display:flex;gap:8px;align-items:center">
                <span class="owner-chip">${acc.owner}</span>
                <div style="text-align:right">
                  <div class="account-mrr">$${acc.mrr.toLocaleString()}/mo</div>
                  <div style="font-size:10px;color:var(--muted)">${acc.acv ? '$'+acc.acv.toLocaleString()+' ACV' : '—'}</div>
                </div>
              </div>
              <div class="account-chevron">▼</div>
            </div>
            <div class="account-detail">
              <div class="detail-grid">
                <div class="detail-item"><div class="detail-label">MRR Mensual</div><div class="detail-value" style="color:#16a34a">$${acc.mrr.toLocaleString()}</div></div>
                <div class="detail-item"><div class="detail-label">ACV Anual</div><div class="detail-value">${acc.acv ? '$'+acc.acv.toLocaleString() : '—'}</div></div>
                <div class="detail-item"><div class="detail-label">Fee Implementación</div><div class="detail-value" style="color:#7c3aed">${acc.impl ? '$'+acc.impl.toLocaleString() : '—'}</div></div>
                <div class="detail-item"><div class="detail-label">Días en Pipe</div><div class="detail-value">${acc.dias ? acc.dias+'d' : '—'}</div></div>
                <div class="detail-item"><div class="detail-label">Próximo Toque</div><div class="detail-value">${nextLabel}</div></div>
                <div class="detail-item"><div class="detail-label">Responsable</div><div class="detail-value">${acc.owner}</div></div>
              </div>
            </div>
          </div>`;
      }).join('');
    }
  }

  // ── Cliente KPIs
  const ticket = d.clienteCount > 0 ? Math.round(d.clienteMRR / d.clienteCount) : 0;
  setEl('kpi-cliente-mrr',        d.clienteMRR ? '$' + d.clienteMRR.toLocaleString() + '/mo' : '—');
  setEl('kpi-cliente-mrr-sub',    d.clienteCount + ' cliente' + (d.clienteCount !== 1 ? 's' : '') + ' activo' + (d.clienteCount !== 1 ? 's' : ''));
  setEl('kpi-cliente-mrr-delta',  d.clienteMRR ? '✅ Ingresos recurrentes confirmados' : 'Sin clientes activos aún');
  setEl('kpi-cliente-acv',        d.clienteACV ? '$' + d.clienteACV.toLocaleString() : '—');
  setEl('kpi-cliente-acv-sub',    'Valor anual combinado');
  setEl('kpi-cliente-ticket',     ticket ? '$' + ticket.toLocaleString() + '/mo' : '—');
  setEl('kpi-cliente-ticket-sub', 'MRR / cliente');
  setEl('kpi-cliente-count',      d.clienteCount || '0');
  setEl('kpi-cliente-count-sub',  'cuentas en etapa Cliente');

  // ── Ventas Proyectadas por Mes
  const pb = document.getElementById('proj-bars');
  if (pb && d.projectedByMonth) {
    const months = Object.keys(d.projectedByMonth).sort();
    if (months.length === 0) {
      pb.innerHTML = '<span style="color:var(--muted);font-size:13px;padding:20px 0">Sin deals con cierre estimado y MRR registrado</span>';
    } else {
      const maxProj = Math.max(...months.map(m => d.projectedByMonth[m].projMRR), 1);
      // Store deals in a global map indexed by month to avoid HTML escaping issues
      window._projDealsCache = d.projectedByMonth;
      pb.innerHTML = months.map(m => {
        const { projMRR, deals } = d.projectedByMonth[m];
        const h = Math.max(Math.round(projMRR / maxProj * 140), 6);
        return `<div class="proj-col" onclick="showProjDeals('${m}')">
          <div class="proj-amount">$${Math.round(projMRR).toLocaleString()}</div>
          <div class="proj-bar" style="height:${h}px"></div>
          <div class="proj-label">${fmtMonth(m)}</div>
          <div class="proj-count">${deals.length} deal${deals.length !== 1 ? 's' : ''}</div>
        </div>`;
      }).join('');
    }
  }

  // ── Topbar + footer
  const now = new Date();
  const timeStr = now.toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'});
  const dateStr = now.toLocaleDateString('es-MX', {weekday:'long',day:'numeric',month:'long',year:'numeric'});
  // topbar-sub is managed by startLiveClock() — updates every minute automatically
  // (keeping dateStr/timeStr for footer)
  const ft = document.getElementById('footer-text');
  if (ft) ft.textContent = 'Birdie Growth Dashboard · Última sincronización: ' + dateStr + ' ' + timeStr + ' · Fuente: Supabase Pipeline (' + d.total + ' registros)';
}

// ─────────────────────────────────────────────────────────────────────────────

function showProjDeals(month) {
  const cache = window._projDealsCache || {};
  const deals = (cache[month] && cache[month].deals) ? cache[month].deals : [];
  const titleEl = document.getElementById('proj-deals-title');
  const listEl  = document.getElementById('proj-deals-list');
  const panel   = document.getElementById('proj-deals-panel');
  if (!titleEl || !listEl || !panel) return;
  titleEl.textContent = '📅 ' + fmtMonth(month) + ' — ' + deals.length + ' deal' + (deals.length !== 1 ? 's' : '');
  listEl.innerHTML = deals
    .slice().sort((a, b) => b.mrr - a.mrr)
    .map(d => `
      <div class="proj-deal-row">
        <div>
          <strong style="font-size:13px">${d.name}</strong>
          <span style="margin-left:8px;font-size:11px;color:var(--muted)">${d.owner || ''}</span>
        </div>
        <div style="display:flex;gap:16px;align-items:center;flex-shrink:0">
          <span style="font-size:11px;color:${STAGE_COLORS[d.status]||'#64748b'};font-weight:600">${d.status}</span>
          <span style="font-size:11px;color:#d97706;font-weight:700">${d.prob}%</span>
          <strong style="color:#16a34a;font-size:13px">$${Number(d.mrr).toLocaleString()}/mo</strong>
        </div>
      </div>`).join('');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ─────────────────────────────────────────────────────────────────────────────

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

export { kpiLogsLoad, getKPILogs, submitLogEntry, deleteLogEntry,
         renderKPITab, renderLogTable, updateGoalsFromLogs,
         renderSellerCards, renderChannelBreakdown, setActType };
