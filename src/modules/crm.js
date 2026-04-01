import { sbFetch } from '../api/supabase.js';
import { showToast } from './utils.js';

let _crmData     = [];  // shared CRM state (loaded from Supabase)
let _crmFiltered = [];

const ST_BADGE = {
  'Lead':        'st-badge st-lead',
  'Calificado':  'st-badge st-cal',
  'Discovery':   'st-badge st-disc',
  'Demo':        'st-badge st-demo',
  'Propuesta':   'st-badge st-prop',
  'Close 2 close':'st-badge st-close',
  'Cerrado':     'st-badge st-cerrado',
  'Client':      'st-badge st-client',
  'Piloto':      'st-badge st-pilot',
};

// ── CRM: returns in-memory cache (loaded from Supabase via crmLoad)
function crmGet() { return _crmData; }

// crmSet: updates local cache only (individual saves go via sbFetch)
function crmSet(data) { _crmData = data; }

// ── crmLoad: fetch all CRM records from Supabase
async function crmLoad() {
  try {
    const data = await sbFetch('GET', 'crm?select=id,n,r,st,ind,e,sz,c,p,em,tel,mrr,acv,notes,created_at&order=created_at.desc&limit=5000');
    _crmData = Array.isArray(data) ? data : [];
    crmRender();
  } catch(e) {
    showToast('⚠ CRM offline: ' + e.message, 'err');
    _crmData = [];
    crmRender();
  }
}

function crmNextId() {
  const data = crmGet();
  return data.length ? Math.max(...data.map(r => r.id || 0)) + 1 : 1;
}

function parseMoney(s) {
  if (!s) return 0;
  return parseFloat(String(s).replace(/[$,]/g, '')) || 0;
}

function crmSort(key) {
  if (crmSortKey === key) crmSortAsc = !crmSortAsc;
  else { crmSortKey = key; crmSortAsc = true; }
  crmRender();
}

function crmRender() {
  const data = crmGet();
  const q      = (document.getElementById('crm-search')?.value || '').toLowerCase();
  const owner  = document.getElementById('crm-f-owner')?.value  || '';
  const status = document.getElementById('crm-f-status')?.value || '';
  const ind    = document.getElementById('crm-f-industry')?.value || '';
  const canal  = document.getElementById('crm-f-canal')?.value  || '';

  let filtered = data.filter(r => {
    if (owner  && r.r  !== owner)  return false;
    if (status && r.st !== status) return false;
    if (ind    && r.ind !== ind)   return false;
    if (canal  && r.e  !== canal)  return false;
    if (q) {
      const hay = ((r.n||'')+(r.c||'')+(r.em||'')+(r.tel||'')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Sort
  filtered.sort((a, b) => {
    let av = (a[crmSortKey] || '').toString();
    let bv = (b[crmSortKey] || '').toString();
    if (crmSortKey === 'mrr' || crmSortKey === 'acv') {
      av = parseMoney(av); bv = parseMoney(bv);
      return crmSortAsc ? av - bv : bv - av;
    }
    return crmSortAsc ? av.localeCompare(bv, 'es') : bv.localeCompare(av, 'es');
  });

  _crmFiltered = filtered;

  // Stats
  const PIPELINE_ST = new Set(['Calificado','Discovery','Demo','Propuesta','Close 2 close','Cerrado','Piloto']);
  const leads    = data.filter(r => r.st === 'Lead').length;
  const inPipe   = data.filter(r => PIPELINE_ST.has(r.st)).length;
  const clients  = data.filter(r => r.st === 'Client').length;
  const totalMRR = data.reduce((s, r) => s + parseMoney(r.mrr), 0);
  document.getElementById('cs-total').textContent   = data.length.toLocaleString();
  document.getElementById('cs-leads').textContent   = leads.toLocaleString();
  document.getElementById('cs-pipeline').textContent= inPipe.toLocaleString();
  document.getElementById('cs-clients').textContent = clients.toLocaleString();
  document.getElementById('cs-mrr').textContent     = '$' + Math.round(totalMRR).toLocaleString();

  // Pagination
  const total = filtered.length;
  const totalPages = Math.ceil(total / CRM_PAGE_SIZE) || 1;
  if (crmPage > totalPages) crmPage = totalPages;
  const start = (crmPage - 1) * CRM_PAGE_SIZE;
  const page  = filtered.slice(start, start + CRM_PAGE_SIZE);

  // Render rows
  const tbody = document.getElementById('crm-tbody');
  if (!page.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="no-data">Sin resultados para este filtro.</td></tr>';
  } else {
    tbody.innerHTML = page.map(r => {
      const mrr = parseMoney(r.mrr);
      const acv = parseMoney(r.acv);
      const badgeCls = ST_BADGE[r.st] || 'st-badge st-lead';
      return `<tr onclick="crmOpenEdit(${r.id})">
        <td><span class="crm-name" title="${(r.n||'').replace(/"/g,'')}">${r.n||'—'}</span><span class="crm-sub">${r.ind||''}</span></td>
        <td><span class="owner-chip">${(r.r||'—').split(' ')[0]}</span></td>
        <td><span class="${badgeCls}">${r.st||'Lead'}</span></td>
        <td style="color:var(--muted)">${r.ind||'—'}</td>
        <td style="color:var(--muted)">${r.e||'—'}</td>
        <td><div style="font-size:11px;font-weight:600">${r.c||'—'}</div><div style="font-size:10px;color:var(--muted)">${r.em||''}</div></td>
        <td style="font-weight:700;color:var(--green-text)">${mrr ? '$'+mrr.toLocaleString() : '—'}</td>
        <td style="font-weight:700">${acv ? '$'+acv.toLocaleString() : '—'}</td>
        <td><button class="del-btn" onclick="event.stopPropagation();crmDeleteId(${r.id})" title="Eliminar">✕</button></td>
      </tr>`;
    }).join('');
  }

  // Pagination bar
  const pages = Math.min(totalPages, 7);
  const pag = document.getElementById('crm-pagination');
  let btns = '';
  for (let i = 1; i <= totalPages; i++) {
    if (totalPages > 7) {
      if (i > 3 && i < totalPages - 1 && Math.abs(i - crmPage) > 1) {
        if (i === 4) btns += '<span style="padding:4px 6px;color:var(--muted)">…</span>';
        continue;
      }
    }
    btns += `<button class="crm-page-btn${i===crmPage?' active':''}" onclick="crmGoPage(${i})">${i}</button>`;
  }
  pag.innerHTML = `<span>Mostrando ${start+1}–${Math.min(start+CRM_PAGE_SIZE,total)} de <strong>${total}</strong> cuentas</span>
    <div class="crm-page-btns">
      <button class="crm-page-btn" onclick="crmGoPage(${crmPage-1})" ${crmPage<=1?'disabled':''}>‹</button>
      ${btns}
      <button class="crm-page-btn" onclick="crmGoPage(${crmPage+1})" ${crmPage>=totalPages?'disabled':''}>›</button>
    </div>`;
}

function crmGoPage(p) {
  const totalPages = Math.ceil(_crmFiltered.length / CRM_PAGE_SIZE) || 1;
  crmPage = Math.max(1, Math.min(p, totalPages));
  crmRender();
}

function crmOpenEdit(id) {
  const data = crmGet();
  const rec  = data.find(r => r.id === id);
  if (!rec) return;
  document.getElementById('crm-modal-title').textContent = '✏️ Editar Cuenta';
  document.getElementById('crm-edit-id').value    = id;
  document.getElementById('cf-name').value        = rec.n    || '';
  document.getElementById('cf-owner').value       = rec.r    || '';
  document.getElementById('cf-status').value      = rec.st   || 'Lead';
  document.getElementById('cf-industry').value    = rec.ind  || '';
  document.getElementById('cf-canal').value       = rec.e    || '';
  document.getElementById('cf-size').value        = rec.sz   || '';
  document.getElementById('cf-contact').value     = rec.c    || '';
  document.getElementById('cf-puesto').value      = rec.p    || '';
  document.getElementById('cf-email').value       = rec.em   || '';
  document.getElementById('cf-phone').value       = rec.tel  || '';
  document.getElementById('cf-mrr').value         = parseMoney(rec.mrr) || '';
  document.getElementById('cf-acv').value         = parseMoney(rec.acv) || '';
  document.getElementById('cf-notes').value       = rec.notes || '';
  document.getElementById('crm-delete-btn').style.display = 'inline-flex';
  openModal('modalCRMNew');
}

function crmCloseModal() {
  closeModal('modalCRMNew');
  document.getElementById('crm-modal-title').textContent = '🏢 Nueva Cuenta';
  document.getElementById('crm-edit-id').value = '';
  document.getElementById('crm-delete-btn').style.display = 'none';
  ['cf-name','cf-owner','cf-status','cf-industry','cf-canal','cf-size',
   'cf-contact','cf-puesto','cf-email','cf-phone','cf-mrr','cf-acv','cf-notes'
  ].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  document.getElementById('cf-status').value = 'Lead';
}

async function crmSave() {
  const name  = document.getElementById('cf-name').value.trim();
  const owner = document.getElementById('cf-owner').value;
  if (!name)  { showToast('⚠ Ingresa el nombre de la empresa','err'); return; }
  if (!owner) { showToast('⚠ Selecciona un responsable','err'); return; }
  const editId = parseInt(document.getElementById('crm-edit-id').value) || 0;
  const rec = {
    id:    editId || crmNextId(),
    n:     name,
    r:     owner,
    st:    document.getElementById('cf-status').value    || 'Lead',
    ind:   document.getElementById('cf-industry').value || null,
    e:     document.getElementById('cf-canal').value     || null,
    sz:    document.getElementById('cf-size').value      || null,
    c:     document.getElementById('cf-contact').value   || null,
    p:     document.getElementById('cf-puesto').value    || null,
    em:    document.getElementById('cf-email').value     || null,
    tel:   document.getElementById('cf-phone').value     || null,
    mrr:   document.getElementById('cf-mrr').value  ? '$'+document.getElementById('cf-mrr').value  : null,
    acv:   document.getElementById('cf-acv').value  ? '$'+document.getElementById('cf-acv').value  : null,
    notes: document.getElementById('cf-notes').value     || null,
  };
  try {
    if (editId) {
      await sbFetch('PATCH', `crm?id=eq.${editId}`, rec);
      const idx = _crmData.findIndex(r => r.id === editId);
      if (idx >= 0) _crmData[idx] = rec; else _crmData.push(rec);
    } else {
      await sbFetch('POST', 'crm', [rec]);
      _crmData.unshift(rec);
    }
    crmCloseModal();
    crmRender();
    showToast((editId ? '✅ Cuenta actualizada — ' : '✅ Cuenta registrada — ') + name, 'ok');
  } catch(e) { showToast('Error guardando CRM: ' + e.message, 'err'); }
}

async function crmDeleteId(id) {
  if (!confirm('¿Eliminar esta cuenta del CRM?')) return;
  try {
    await sbFetch('DELETE', `crm?id=eq.${id}`);
    _crmData = _crmData.filter(r => r.id !== id);
    crmRender();
    showToast('Cuenta eliminada', '');
  } catch(e) { showToast('Error eliminando: ' + e.message, 'err'); }
}

async function crmDeleteCurrent() {
  const id = parseInt(document.getElementById('crm-edit-id').value);
  if (!id) return;
  if (!confirm('¿Eliminar esta cuenta del CRM?')) return;
  try {
    await sbFetch('DELETE', `crm?id=eq.${id}`);
    _crmData = _crmData.filter(r => r.id !== id);
    crmCloseModal();
    crmRender();
    showToast('Cuenta eliminada', '');
  } catch(e) { showToast('Error eliminando: ' + e.message, 'err'); }
}

function crmExportCSV() {
  const data = _crmFiltered.length ? _crmFiltered : crmGet();
  const HEADERS = ['ID','Empresa','Responsable','Status','Industria','Canal','Tamaño','Contacto','Puesto','Email','Telefono','MRR','ACV','Notas'];
  const rows = data.map(r => [
    r.id, r.n, r.r, r.st, r.ind, r.e, r.sz, r.c, r.p, r.em, r.tel, r.mrr, r.acv, r.notes
  ].map(v => '"'+String(v||'').replace(/"/g,'""')+'"').join(','));
  const csv = [HEADERS.join(','), ...rows].join('\n');
  const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = 'birdie-crm-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click(); URL.revokeObjectURL(url);
}

// Init CRM on tab open (lazy) — now loads from Supabase
document.addEventListener('DOMContentLoaded', () => {
  // crmLoad() is called from showApp() after login
});

export { crmLoad, crmRender, crmSave, crmDeleteId, crmDeleteCurrent,
         crmGet, crmNextId, crmOpenEdit, crmExportCSV, crmSort, crmGoPage };
