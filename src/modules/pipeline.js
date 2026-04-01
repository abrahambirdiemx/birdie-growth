import { sbFetch } from '../api/supabase.js';
import { showToast, fmtMonth, parsePipeMoney, debounce } from './utils.js';
import { STAGE_COLORS, STAGE_ORDER_LIST, STAGE_PROB, ACTIVE_STAGES, DATE_TRIGGER, DATE_LABELS, MONTH_NAMES_ES } from './config.js';

// ─── PIPELINE (Supabase) ─────────────────────────────────────────────────
let _pipeData    = [];
let _pipeFiltered= [];
let pipePage     = 1;
let pipeSortKey  = 'ingreso_lead';
let pipeSortAsc  = false;
const PIPE_PAGE  = 75;

// Pending date event state
let _dateEventDealId  = null;
let _dateEventField   = null;

// Callback registered by main.js to update the dashboard after pipe changes
let _onPipeChange = null;
export function setPipeChangeCb(fn) { _onPipeChange = fn; }

async function pipeLoad() {
  const btn = document.getElementById('syncBtn');
  if (btn) { btn.classList.add('syncing'); btn.textContent='⏳ Sync'; }
  try {
    const data = await sbFetch('GET','pipeline?select=id,opportunity_name,status,mrr,acv,owner,cierre_date,probability,ingreso_lead,discovery_date,demo_date,proposal_date,next_touchpoint,estrategia,size,notes,created_at,updated_at&order=created_at.desc&limit=2000');
    _pipeData = Array.isArray(data) ? data : [];
    const _syncTime = new Date().toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'});
    window._lastSyncLabel = _syncTime;
    pipeRender();
    _onPipeChange?.(_pipeData);
    window.updateGoalsFromLogs?.();
    updateSbStatus(true, _pipeData.length + ' deals');
    showToast('✅ Pipeline sincronizado — '+_pipeData.length+' deals','ok');
  } catch(e) {
    updateSbStatus(false, 'Error: '+e.message);
    showToast('❌ Supabase: '+e.message,'err');
  } finally {
    if (btn) { btn.classList.remove('syncing'); btn.textContent='🔄 Sync'; }
  }
}

function updateSbStatus(connected, msg) {
  const dot = document.getElementById('sb-dot');
  const txt = document.getElementById('sb-status-txt');
  if (dot) dot.className = 'sb-status-dot'+(connected?' connected':'');
  if (txt) txt.textContent = connected ? '✅ Conectado — '+msg : '🔴 '+msg;
}

function pipeSort(k) {
  if (pipeSortKey===k) pipeSortAsc=!pipeSortAsc;
  else { pipeSortKey=k; pipeSortAsc=true; }
  pipeRender();
}

async function pipeSaveCierreMonth(id, ym) {
  // Convert YYYY-MM to YYYY-MM-01 for storage as DATE
  const dateVal = ym ? ym + '-01' : null;
  await pipeUpdateField(id, 'cierre_date', dateVal);
}

function daysBetween(d1, d2) {
  if (!d1) return null;
  const a = new Date(d1), b = d2 ? new Date(d2) : new Date();
  return Math.round((b-a)/(1000*60*60*24));
}

function pipeRender() {
  const q      = (document.getElementById('pipe-search')?.value||'').toLowerCase();
  const owner  = document.getElementById('pf-owner')?.value||'';
  const status = document.getElementById('pf-status')?.value||'';
  const canal  = document.getElementById('pf-canal')?.value||'';

  let filt = _pipeData.filter(r => {
    if (owner  && r.owner   !== owner)  return false;
    if (status && r.status  !== status) return false;
    if (canal  && r.estrategia !== canal) return false;
    if (q) {
      const hay = ((r.opportunity_name||'')+(r.cuenta_crm||'')+(r.owner||'')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  filt.sort((a,b) => {
    let av=a[pipeSortKey], bv=b[pipeSortKey];
    if (!av && !bv) return 0;
    if (!av) return 1; if (!bv) return -1;
    if (typeof av==='number'||pipeSortKey==='mrr'||pipeSortKey==='acv') {
      av=parsePipeMoney(av); bv=parsePipeMoney(bv);
      return pipeSortAsc ? av-bv : bv-av;
    }
    return pipeSortAsc ? String(av).localeCompare(String(bv),'es') : String(bv).localeCompare(String(av),'es');
  });
  _pipeFiltered = filt;

  // KPI row
  const activeDeals = filt.filter(r=>ACTIVE_STAGES.has(r.status));
  const c2c         = filt.filter(r=>r.status==='Close 2 close');
  const totMRR = activeDeals.reduce((s,r)=>s+parsePipeMoney(r.mrr),0);
  const totACV = activeDeals.reduce((s,r)=>s+parsePipeMoney(r.acv),0);
  document.getElementById('pk-total').textContent  = filt.length.toLocaleString();
  document.getElementById('pk-activos').textContent= activeDeals.length;
  document.getElementById('pk-close').textContent  = c2c.length;
  document.getElementById('pk-mrr').textContent    = totMRR ? '$'+Math.round(totMRR).toLocaleString()+'/mo' : '—';
  document.getElementById('pk-acv').textContent    = totACV ? '$'+Math.round(totACV/1000)+'K' : '—';

  const tot = filt.length;
  const today = new Date().toISOString().slice(0,10);
  const tbody = document.getElementById('pipe-tbody');

  function buildRow(r) {
    const col  = STAGE_COLORS[r.status]||'#64748b';
    const dias = daysBetween(r.ingreso_lead);
    const nextT = r.next_touchpoint;
    const nextStyle = nextT && nextT < today ? 'color:var(--red);font-weight:700' : nextT===today ? 'color:var(--green);font-weight:700' : '';
    const mrr  = parsePipeMoney(r.mrr);
    const acv  = parsePipeMoney(r.acv);
    const prob = r.probability ?? STAGE_PROB[r.status] ?? 50;
    // cierre_date stored as YYYY-MM-DD, display as month selector (YYYY-MM)
    const cierreMonth = r.cierre_date ? r.cierre_date.slice(0,7) : '';
    const cierreLabel = cierreMonth ? fmtMonth(cierreMonth) : '—';
    // inline date cell helper: always shows input, empty if null
    const dInline = (val, field, color) =>
      `<input type="date" class="cell-date-input" value="${val||''}" onchange="pipeUpdateField(${r.id},'${field}',this.value||null)" style="${color?'color:'+color:''}" title="${field}">`;
    return `<tr>
      <td><span class="cell cell-name" title="Clic para editar" style="cursor:pointer" onclick="pipeOpenEdit(${r.id})">${r.opportunity_name||'—'}</span></td>
      <td class="cell-select">
        <select onchange="pipeUpdateField(${r.id},'owner',this.value)">
          <option ${r.owner==='Abraham Lopez'?'selected':''}>Abraham Lopez</option>
          <option ${r.owner==='Héctor Nícola'?'selected':''}>Héctor Nícola</option>
          <option ${r.owner==='Daniel Luna'?'selected':''}>Daniel Luna</option>
        </select>
      </td>
      <td class="cell-select">
        <select style="color:${col};font-weight:700" onchange="pipeStatusChange(${r.id},this.value,this)">
          ${STAGE_ORDER_LIST.map(s=>`<option value="${s}" ${r.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td><span class="cell cell-money">${mrr?'$'+mrr.toLocaleString():''}</span></td>
      <td><span class="cell cell-money acv">${acv?'$'+acv.toLocaleString():''}</span></td>
      <td class="cell-date">${dInline(r.ingreso_lead,'ingreso_lead','')}</td>
      <td class="cell-date">${dInline(r.discovery_date,'discovery_date','#7c3aed')}</td>
      <td class="cell-date">${dInline(r.demo_date,'demo_date','#5b21b6')}</td>
      <td class="cell-date">${dInline(r.proposal_date,'proposal_date','#ea580c')}</td>
      <td class="cell-date"><input type="date" class="cell-date-input" value="${nextT||''}" onchange="pipeUpdateField(${r.id},'next_touchpoint',this.value||null)" style="${nextStyle}" title="Próx. touchpoint"></td>
      <td class="cell-date" style="white-space:nowrap">
        <input type="month" class="cell-date-input" value="${cierreMonth}" onchange="pipeSaveCierreMonth(${r.id},this.value)" style="color:#15803d;width:100px;max-width:100px" title="Cierre estimado mes">
      </td>
      <td style="max-width:110px;overflow:hidden;white-space:nowrap"><span class="cell" style="color:var(--muted);font-size:11px">${r.estrategia||'—'}</span></td>
      <td><span class="cell" style="font-size:11px;color:#64748b">${r.size||'—'}</span></td>
      <td>
        <input type="number" class="cell-date-input" value="${prob}" min="0" max="100"
          onchange="pipeUpdateField(${r.id},'probability',parseInt(this.value)||0)"
          style="width:46px;text-align:center;font-size:12px;color:${prob>=70?'#16a34a':prob>=40?'#d97706':'#64748b'};font-weight:700"
          title="Probabilidad de cierre %">
      </td>
      <td><span class="cell" style="color:${dias&&dias>120?'var(--orange)':dias&&dias>60?'var(--yellow)':'var(--muted)'};font-size:11px">${dias!=null?dias+'d':'—'}</span></td>
    </tr>`;
  }

  const pag = document.getElementById('pipe-pagination');

  if (_pipeGroupBy) {
    // ── Group-by-stage mode (collapsible) ──────────────────────────────────
    let html = '';
    let stageCount = 0;
    for (const stage of STAGE_ORDER_LIST) {
      const group = filt.filter(r=>r.status===stage);
      if (!group.length) continue;
      stageCount++;
      const col = STAGE_COLORS[stage]||'#64748b';
      const collapsed = _collapsedGroups.has(stage);
      const groupMRR = group.reduce((s,r)=>s+parsePipeMoney(r.mrr),0);
      const groupACV = group.reduce((s,r)=>s+parsePipeMoney(r.acv),0);
      const projMRR  = group.reduce((s,r)=>s+parsePipeMoney(r.mrr)*((r.probability??STAGE_PROB[r.status]??50)/100),0);
      html += `<tr style="background:${col}18;border-top:2px solid ${col}40;cursor:pointer" onclick="pipeToggleStageCollapse('${stage.replace(/'/g,"\\'")}')">
        <td colspan="16" style="padding:9px 14px;font-weight:700;font-size:12px;color:${col};user-select:none">
          <span style="margin-right:8px;font-size:10px">${collapsed?'▶':'▼'}</span>${stage}
          <span style="font-weight:400;color:var(--muted);margin-left:8px">${group.length} deal${group.length!==1?'s':''}</span>
          ${groupMRR?`<span style="margin-left:16px;color:#16a34a;font-weight:600">MRR $${Math.round(groupMRR).toLocaleString()}/mo</span>`:''}
          ${groupACV?`<span style="margin-left:10px;color:#3b6ef8">ACV ${fmt$(groupACV)}</span>`:''}
          ${projMRR?`<span style="margin-left:10px;color:#d97706">Proyectado $${Math.round(projMRR).toLocaleString()}/mo</span>`:''}
          <span style="float:right;font-size:10px;color:var(--muted);font-weight:400">${collapsed?'Expandir':'Colapsar'}</span>
        </td></tr>`;
      if (!collapsed) html += group.map(r=>buildRow(r)).join('');
    }
    tbody.innerHTML = html || '<tr><td colspan="16" style="text-align:center;padding:40px;color:var(--muted)">Sin deals para este filtro.</td></tr>';
    pag.innerHTML = `<span style="color:var(--muted);font-size:12px">${tot} deals · ${stageCount} etapas · Clic en etapa para colapsar/expandir</span>`;
  } else {
    // ── Flat paginated mode ─────────────────────────────────────────────────
    const totPages = Math.ceil(tot/PIPE_PAGE)||1;
    if (pipePage>totPages) pipePage=totPages;
    const start=(pipePage-1)*PIPE_PAGE;
    const page=filt.slice(start,start+PIPE_PAGE);
    tbody.innerHTML = page.length
      ? page.map(r=>buildRow(r)).join('')
      : '<tr><td colspan="16" style="text-align:center;padding:40px;color:var(--muted)">Sin deals para este filtro.</td></tr>';
    const totP = Math.ceil(tot/PIPE_PAGE)||1;
    let btns='';
    for (let i=1;i<=totP;i++) {
      if (totP>8&&i>3&&i<totP-1&&Math.abs(i-pipePage)>1){if(i===4)btns+='<span style="padding:4px 6px;color:var(--muted)">…</span>';continue;}
      btns+=`<button class="pipe-page-btn${i===pipePage?' active':''}" onclick="pipeGoPage(${i})">${i}</button>`;
    }
    pag.innerHTML=`<span>${start+1}–${Math.min(start+PIPE_PAGE,tot)} de <strong>${tot}</strong> deals</span>
      <div class="pipe-page-btns"><button class="pipe-page-btn" onclick="pipeGoPage(${pipePage-1})" ${pipePage<=1?'disabled':''}>‹</button>${btns}<button class="pipe-page-btn" onclick="pipeGoPage(${pipePage+1})" ${pipePage>=totP?'disabled':''}>›</button></div>`;
  }
}

function pipeGoPage(p){const t=Math.ceil(_pipeFiltered.length/PIPE_PAGE)||1;pipePage=Math.max(1,Math.min(p,t));pipeRender();}

async function pipeUpdateField(id, field, value) {
  // Optimistic update — apply locally immediately, sync in background
  const idx = _pipeData.findIndex(r=>r.id===id);
  if (idx>=0) _pipeData[idx][field] = (value===''||value===undefined) ? null : value;
  // Async fire-and-forget with silent retry on schema cache errors
  (async () => {
    try {
      await sbFetch('PATCH',`pipeline?id=eq.${id}`,{[field]: (value===''||value===undefined)?null:value, updated_at:new Date().toISOString()});
    } catch(e) {
      // If column doesn't exist in schema cache, skip silently for 'probability'
      if (e.message && (e.message.includes('schema cache') || e.message.includes('Could not find'))) {
        if (field==='probability') return; // column not yet added — user must run ALTER TABLE
        showToast('⚠ Columna no encontrada: '+field,'err');
      } else {
        showToast('Error guardando: '+e.message,'err');
      }
    }
  })();
}

async function pipeStatusChange(id, newStatus, selectEl) {
  await pipeUpdateField(id, 'status', newStatus);
  selectEl.style.color = STAGE_COLORS[newStatus]||'#64748b';
  // Check if this stage requires a date
  const field = DATE_TRIGGER[newStatus];
  if (field) {
    const rec = _pipeData.find(r=>r.id===id);
    if (rec && !rec[field]) promptDateEvent(id, field, DATE_LABELS[field]||newStatus);
  }
}

function promptDateEvent(dealId, field, label) {
  _dateEventDealId = dealId;
  _dateEventField  = field;
  const rec = _pipeData.find(r=>r.id===dealId);
  document.getElementById('date-event-title').textContent = '📅 Fecha de '+label;
  document.getElementById('date-event-desc').textContent  = `Empresa: ${rec?.opportunity_name||'—'} · Registra la fecha en que ocurrió este evento.`;
  document.getElementById('date-event-value').value = new Date().toISOString().slice(0,10);
  openModal('modalDateEvent');
}

async function saveDateEvent() {
  const val = document.getElementById('date-event-value').value;
  if (!val||!_dateEventDealId||!_dateEventField) return;
  await pipeUpdateField(_dateEventDealId, _dateEventField, val);
  closeModal('modalDateEvent');
  pipeRender();
  showToast('✅ Fecha guardada','ok');
}

function pipeOpenEdit(id) {
  const r = _pipeData.find(x=>x.id===id); if(!r) return;
  document.getElementById('pipe-modal-title').textContent='✏️ Editar Deal';
  document.getElementById('pipe-edit-id').value=id;
  document.getElementById('pipe-delete-btn').style.display='block';
  // Hide CRM search section (only for new deals)
  const css = document.getElementById('crm-search-section');
  if (css) css.style.display='none';
  const setV = (elId, val) => { const e=document.getElementById(elId); if(e) e.value=val||''; };
  setV('pf-name',        r.opportunity_name);
  setV('pf-owner-f',     r.owner);
  setV('pf-status-f',    r.status);
  setV('pf-canal-f',     r.estrategia);
  setV('pf-size-f',      r.size);
  setV('pf-mrr-f',       r.mrr||'');
  setV('pf-acv-f',       r.acv||'');
  setV('pf-impl-f',      r.implementaciones||'');
  setV('pf-piloto-f',    r.piloto||'');
  setV('pf-ingreso-f',   r.ingreso_lead);
  setV('pf-discovery-f', r.discovery_date);
  setV('pf-demo-f',      r.demo_date);
  setV('pf-proposal-f',  r.proposal_date);
  setV('pf-touch-f',     r.next_touchpoint);
  setV('pf-close-f',     r.cierre_date ? r.cierre_date.slice(0,7) : '');
  setV('pf-prob-f',      r.probability ?? STAGE_PROB[r.status] ?? 50);
  setV('pf-product-f',   r.product_interest);
  setV('pf-feedback-f',  r.feedback);
  openModal('modalPipeDeal');
}

// ── Group-by-stage toggle ───────────────────────────────────────────────────
let _pipeGroupBy = false;
let _collapsedGroups = new Set();
function pipeToggleGroup() {
  _pipeGroupBy = !_pipeGroupBy;
  _collapsedGroups.clear();
  const btn = document.getElementById('groupByBtn');
  if (btn) { btn.style.background = _pipeGroupBy ? '#3b6ef8' : ''; btn.style.color = _pipeGroupBy ? '#fff' : ''; }
  pipeRender();
}
function pipeToggleStageCollapse(stage) {
  if (_collapsedGroups.has(stage)) _collapsedGroups.delete(stage);
  else _collapsedGroups.add(stage);
  pipeRender();
}

// ── CRM lookup for new deal modal ───────────────────────────────────────────
function crmDealSearch() {
  const q = (document.getElementById('crm-deal-search')?.value||'').toLowerCase().trim();
  const res = document.getElementById('crm-deal-results');
  if (!q || q.length < 2) { res.style.display='none'; return; }
  const crm = crmGet();
  const matches = crm.filter(r=>(r.n||'').toLowerCase().includes(q)).slice(0,8);
  if (!matches.length) { res.style.display='none'; return; }
  res.style.display='block';
  res.innerHTML = matches.map(r=>`
    <div onclick="crmDealSelect(${r.id})" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:10px" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
      <span style="font-size:18px">🏢</span>
      <div>
        <div style="font-weight:600;color:#0f172a;font-size:13px">${r.n}</div>
        <div style="font-size:11px;color:#64748b">${r.e||''}${r.sz?' · '+r.sz:''}${r.r?' · '+r.r:''}</div>
      </div>
    </div>`).join('');
}

function crmDealSelect(crmId) {
  const crm = crmGet();
  const rec = crm.find(r=>r.id===crmId);
  if (!rec) return;
  const setVal = (id, val) => { const e=document.getElementById(id); if(e&&val) e.value=val; };
  setVal('pf-name',    rec.n);
  setVal('pf-canal-f', rec.e);
  setVal('pf-size-f',  rec.sz);
  // Try to match owner
  const ownerMap = {'Abraham Lopez':'Abraham Lopez','Héctor Nícola':'Héctor Nícola','Daniel Luna':'Daniel Luna'};
  const ownerEl = document.getElementById('pf-owner-f');
  if (ownerEl && rec.r && ownerMap[rec.r]) ownerEl.value = ownerMap[rec.r];
  // Hide search
  document.getElementById('crm-deal-results').style.display='none';
  document.getElementById('crm-deal-search').value=rec.n;
  showToast('✅ Datos de '+rec.n+' cargados desde CRM','ok');
}

function pipeNewDeal() {
  document.getElementById('pipe-modal-title').textContent='🔥 Nuevo Deal';
  document.getElementById('pipe-edit-id').value='';
  document.getElementById('pipe-delete-btn').style.display='none';
  // Show CRM search section
  const css = document.getElementById('crm-search-section');
  if (css) { css.style.display='block'; }
  document.getElementById('crm-deal-search').value='';
  document.getElementById('crm-deal-results').style.display='none';
  ['pf-name','pf-mrr-f','pf-acv-f','pf-impl-f','pf-piloto-f','pf-ingreso-f','pf-discovery-f','pf-demo-f','pf-proposal-f','pf-touch-f','pf-close-f','pf-product-f','pf-feedback-f','pf-prob-f'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  ['pf-owner-f','pf-status-f','pf-canal-f','pf-size-f'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('pf-status-f').value='Weekly Hunt';
  document.getElementById('pf-ingreso-f').value=new Date().toISOString().slice(0,10);
  openModal('modalPipeDeal');
}

async function pipeSave() {
  const name  = document.getElementById('pf-name').value.trim();
  const owner = document.getElementById('pf-owner-f').value;
  if (!name)  { showToast('⚠ Ingresa el nombre del deal','err'); return; }
  if (!owner) { showToast('⚠ Selecciona un owner','err'); return; }
  if (!SB_URL){ showToast('Conecta Supabase primero','err'); return; }
  const editId = parseInt(document.getElementById('pipe-edit-id').value)||0;
  const rec = {
    opportunity_name: name,
    owner, status: document.getElementById('pf-status-f').value,
    estrategia:   document.getElementById('pf-canal-f').value||null,
    mrr:          parseFloat(document.getElementById('pf-mrr-f').value)||null,
    acv:          parseFloat(document.getElementById('pf-acv-f').value)||null,
    implementaciones: parseFloat(document.getElementById('pf-impl-f').value)||null,
    piloto:       parseFloat(document.getElementById('pf-piloto-f').value)||null,
    ingreso_lead: document.getElementById('pf-ingreso-f').value||null,
    discovery_date: document.getElementById('pf-discovery-f').value||null,
    demo_date:    document.getElementById('pf-demo-f').value||null,
    proposal_date:document.getElementById('pf-proposal-f').value||null,
    next_touchpoint:document.getElementById('pf-touch-f').value||null,
    cierre_date:  (document.getElementById('pf-close-f').value ? document.getElementById('pf-close-f').value+'-01' : null),
    probability:  parseInt(document.getElementById('pf-prob-f')?.value)||null,
    size:         document.getElementById('pf-size-f').value||null,
    product_interest:document.getElementById('pf-product-f').value||null,
    feedback:     document.getElementById('pf-feedback-f').value||null,
    updated_at:   new Date().toISOString(),
  };
  try {
    if (editId) {
      await sbFetch('PATCH',`pipeline?id=eq.${editId}`,rec);
      const idx=_pipeData.findIndex(r=>r.id===editId);
      if(idx>=0) _pipeData[idx]={..._pipeData[idx],...rec};
    } else {
      const created = await sbFetch('POST','pipeline',[rec]);
      if (Array.isArray(created)&&created.length) _pipeData.unshift(created[0]);
    }
    closeModal('modalPipeDeal');
    pipeRender();
    _onPipeChange?.(_pipeData);
    showToast((editId?'✅ Deal actualizado — ':'✅ Deal creado — ')+name,'ok');
  } catch(e){ showToast('Error: '+e.message,'err'); }
}

async function pipeDeleteCurrent() {
  const id=parseInt(document.getElementById('pipe-edit-id').value);
  if(!id) return;
  if(!confirm('¿Eliminar este deal del pipeline?')) return;
  try {
    await sbFetch('DELETE',`pipeline?id=eq.${id}`);
    _pipeData=_pipeData.filter(r=>r.id!==id);
    closeModal('modalPipeDeal');
    pipeRender();
    _onPipeChange?.(_pipeData);
    showToast('Deal eliminado','');
  } catch(e){ showToast('Error: '+e.message,'err'); }
}

function pipeExport() {
  const data=_pipeFiltered.length?_pipeFiltered:_pipeData;
  const H=['ID','Oportunidad','Owner','Etapa','Canal','MRR','ACV','Implementaciones','Ingreso Lead','Discovery','Demo','Propuesta','Cierre','Próx.Touch','Días Pipe','Feedback'];
  const rows=data.map(r=>[r.id,r.opportunity_name,r.owner,r.status,r.estrategia,r.mrr,r.acv,r.implementaciones,r.ingreso_lead,r.discovery_date,r.demo_date,r.proposal_date,r.cierre_date,r.next_touchpoint,daysBetween(r.ingreso_lead),r.feedback].map(v=>'"'+String(v||'').replace(/"/g,'""')+'"').join(','));
  const csv=[H.join(','),...rows].join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='birdie-pipeline-'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();
}

// Credentials are hardcoded — no init needed

// ─── CRM ─────────────────────────────────────────────────────────────────
const CRM_KEY  = 'birdie_crm_v1';
const CRM_PAGE_SIZE = 50;
let crmPage    = 1;
let crmSortKey = 'n';
let crmSortAsc = true;

export { pipeLoad, pipeRender, pipeUpdateField, pipeSave, pipeDeleteCurrent,
         pipeSort, pipeGoPage, pipeNewDeal, pipeOpenEdit, pipeToggleGroup,
         pipeToggleStageCollapse, pipeStatusChange, pipeSaveCierreMonth,
         promptDateEvent, saveDateEvent };
