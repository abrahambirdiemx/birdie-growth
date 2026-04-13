import { sbFetch } from '../api/supabase.js';
import { showToast } from './utils.js';
import { SELLERS, STAGE_PROB } from './config.js';
import { goalsLoad, getAllGoals, goalsSave, currentQuarter } from './goals.js';

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

// ── kpiLogsLoad: fetch logs from Supabase + load goals for current quarter
async function kpiLogsLoad() {
  // Load goals from Supabase (replaces localStorage GOALS_KEY)
  await goalsLoad(currentQuarter());

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

  const goals = getAllGoals();
  const MAP = [
    { id: 'calificado', type: 'lead',      goalKey: 'new_leads'   },
    { id: 'discovery',  type: 'discovery', goalKey: 'discovery'   },
    { id: 'demo',       type: 'demo',      goalKey: 'demo'        },
    { id: 'propuesta',  type: 'propuesta', goalKey: 'propuesta'   },
  ];
  MAP.forEach(m => {
    const goal  = goals[m.goalKey] || 0;
    const count = logs.filter(e => e.type === m.type).length;
    const pct   = goal > 0 ? Math.min(Math.round(count / goal * 100), 100) : 0;
    const el   = document.getElementById('g-' + m.id);
    const fill = document.getElementById('gf-' + m.id);
    const sub  = document.getElementById('gs-' + m.id);
    if (el)   el.textContent = count;
    if (fill) fill.style.width = pct + '%';
    if (sub)  sub.textContent = goal
      ? `${pct}% de meta ${goal} · faltan ${Math.max(goal - count, 0)}`
      : `${count} registrados — sin meta definida`;
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

// ── INITIATIVES BOARD ────────────────────────────────────────────────────────
const INIT_KEY = 'birdie_initiatives';

// Default seeded initiatives (used only on first load)
const DEFAULT_INITIATIVES = [
  { id: 'video',   emoji:'🎬', title:'Videos para Redes Sociales',       desc:'Contenido de video para LinkedIn, Instagram y YouTube. Demos del producto, casos de éxito y thought leadership.', priority:'alta',  owner:'', status:'En Progreso', date:'2026-04-30', notes:'Script inicial pendiente. Coordinar con diseño para branding.' },
  { id: 'campana', emoji:'📣', title:'Lanzamiento Campaña Promocional',  desc:'Nueva campaña de adquisición. Paid Ads, email y LinkedIn. Audiencia: importadoras y distribuidoras con +200 ops/mes.', priority:'alta',  owner:'', status:'En Progreso', date:'2026-04-24', notes:'Definir oferta de descuento o trial. Creativos en revisión con agencia.' },
  { id: 'lm',      emoji:'🧮', title:'Lead Magnet: Calculadora de Eficiencia', desc:'Herramienta interactiva que muestra ROI y horas ahorradas al implementar Birdie.', priority:'media', owner:'', status:'Planeación', date:'2026-04-30', notes:'Output: $ ahorrado + ROI proyectado. Distribuir en cold outreach y LinkedIn.' },
];

const COL_FOR_STATUS = {
  'Planeación':    'col-planeacion',
  'En Progreso':   'col-progreso',
  'En Revisión':   'col-progreso',
  'Completado ✓':  'col-completado',
};

function _loadInits() {
  try { return JSON.parse(localStorage.getItem(INIT_KEY) || 'null') || DEFAULT_INITIATIVES; }
  catch { return DEFAULT_INITIATIVES; }
}
function _saveInits(arr) { localStorage.setItem(INIT_KEY, JSON.stringify(arr)); }

function _buildInitCard(init) {
  const STATUSES = ['Planeación', 'En Progreso', 'En Revisión', 'Completado ✓'];
  const OWNERS   = ['— Asignar —', 'Abraham Lopez', 'Héctor Nícola', 'Daniel Luna', 'Equipo Marketing', 'Agencia / Freelancer'];
  const PRI_MAP  = { alta:'🔴 Alta', media:'🟡 Media', baja:'🟢 Baja' };
  const PRI_CLS  = { alta:'ip-alta', media:'ip-media', baja:'ip-baja' };
  const sOpts = STATUSES.map(s => `<option${init.status===s?' selected':''}>${s}</option>`).join('');
  const oOpts = OWNERS.map(o   => `<option${init.owner===o?' selected':''}>${o}</option>`).join('');
  const id = init.id;
  return `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="font-size:22px">${init.emoji}</span>
      <div style="flex:1;font-size:13px;font-weight:700">${init.title}</div>
    </div>
    ${init.desc ? `<div class="initiative-desc">${init.desc}</div>` : ''}
    <span class="initiative-priority ${PRI_CLS[init.priority]||'ip-media'}">● ${PRI_MAP[init.priority]||'Media'}</span>
    <div class="initiative-field"><label>Responsable</label><select onchange="saveInit('${id}','owner',this.value)">${oOpts}</select></div>
    <div class="initiative-field"><label>Status</label><select onchange="saveInit('${id}','status',this.value)">${sOpts}</select></div>
    <div class="initiative-field"><label>Fecha límite</label><input type="date" value="${init.date||''}" onchange="saveInit('${id}','date',this.value)"></div>
    <div class="initiative-field"><label>Notas</label><textarea onchange="saveInit('${id}','notes',this.value)">${init.notes||''}</textarea></div>
    <button onclick="deleteInit('${id}')" style="width:100%;padding:6px;border:1px solid #fecaca;background:#fef2f2;color:#dc2626;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;margin-top:8px">🗑 Eliminar iniciativa</button>`;
}

function renderInitBoard() {
  const inits = _loadInits();
  const colIds = ['col-progreso', 'col-planeacion', 'col-completado'];
  for (const colId of colIds) {
    const col = document.getElementById(colId);
    if (!col) continue;
    const btn = col.querySelector('.add-initiative-btn');
    col.querySelectorAll('.initiative-card').forEach(c => c.remove());
    col.querySelectorAll('.init-empty').forEach(e => e.remove());
    const mine = inits.filter(i => (COL_FOR_STATUS[i.status] || 'col-planeacion') === colId);
    if (mine.length === 0) {
      const ph = document.createElement('div');
      ph.className = 'init-empty';
      ph.style.cssText = 'text-align:center;padding:24px 16px;color:var(--muted2);font-size:12px';
      ph.innerHTML = '<div style="font-size:24px;margin-bottom:6px">🎯</div>Vacío';
      col.insertBefore(ph, btn);
    } else {
      for (const init of mine) {
        const card = document.createElement('div');
        card.className = 'initiative-card';
        card.dataset.initId = init.id;
        card.innerHTML = _buildInitCard(init);
        col.insertBefore(card, btn);
      }
    }
  }
}

function saveInit(id, field, value) {
  const inits = _loadInits();
  const item  = inits.find(i => i.id === id);
  if (!item) return;
  item[field] = value;
  _saveInits(inits);
  if (field === 'status') renderInitBoard(); // move card to correct column
}

function deleteInit(id) {
  if (!confirm('¿Eliminar esta iniciativa?')) return;
  _saveInits(_loadInits().filter(i => i.id !== id));
  renderInitBoard();
}

function addCard(colId) {
  const STATUS_FOR_COL = { 'col-progreso':'En Progreso', 'col-planeacion':'Planeación', 'col-completado':'Completado ✓' };
  const inits = _loadInits();
  inits.push({ id:'init_'+Date.now(), emoji:'📌', title:'Nueva iniciativa', desc:'', priority:'media', owner:'', status:STATUS_FOR_COL[colId]||'Planeación', date:'', notes:'' });
  _saveInits(inits);
  renderInitBoard();
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
         clearLogForm, exportKPILog, addCard,
         renderInitBoard, saveInit, deleteInit };
