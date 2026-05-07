import { sbFetch } from '../api/supabase.js';
import { showToast } from './utils.js';

// ── State ────────────────────────────────────────────────────────────────────
let _crmData     = [];   // companies with embedded contacts
let _crmFiltered = [];
let crmSortKey   = 'nombre';
let crmSortAsc   = true;
let crmPage      = 1;
const CRM_PAGE_SIZE = 75;

// ── Stage badge config ───────────────────────────────────────────────────────
const ST_BADGE = {
  'Lead':          'st-badge st-lead',
  'Calificado':    'st-badge st-cal',
  'Discovery':     'st-badge st-disc',
  'Demo':          'st-badge st-demo',
  'Propuesta':     'st-badge st-prop',
  'Close 2 close': 'st-badge st-close',
  'Cerrado':       'st-badge st-cerrado',
  'Client':        'st-badge st-client',
  'Piloto':        'st-badge st-pilot',
  'activo':        'st-badge st-lead',
  'inactivo':      'st-badge',
};

// ── Public getters/setters ───────────────────────────────────────────────────
function crmGet() { return _crmData; }
function crmSet(data) { _crmData = data; }

// ── crmLoad: fetch companies + embedded first contact from Supabase ──────────
async function crmLoad() {
  try {
    const data = await sbFetch('GET',
      'companies?select=id,nombre,owner,estado,industria,canal,tamaño,mrr,acv,notas,fuente,web,created_at,' +
      'contacts(id,nombre,cargo,email,telefono,estado)' +
      '&order=created_at.desc&limit=5000'
    );
    _crmData = Array.isArray(data) ? data : [];
    crmRender();
  } catch(e) {
    showToast('⚠ CRM offline: ' + e.message, 'err');
    _crmData = [];
    crmRender();
  }
}

// ── crmSetData: used by auto-sync (no toast) ─────────────────────────────────
function crmSetData(data) {
  _crmData = Array.isArray(data) ? data : [];
  crmRender();
}

// ── Sorting ──────────────────────────────────────────────────────────────────
function crmSort(key) {
  if (crmSortKey === key) crmSortAsc = !crmSortAsc;
  else { crmSortKey = key; crmSortAsc = true; }
  crmRender();
}

// ── Render ───────────────────────────────────────────────────────────────────
function crmRender() {
  const data   = _crmData;
  const q      = (document.getElementById('crm-search')?.value || '').toLowerCase();
  const owner  = document.getElementById('crm-f-owner')?.value  || '';
  const status = document.getElementById('crm-f-status')?.value || '';
  const ind    = document.getElementById('crm-f-industry')?.value || '';
  const canal  = document.getElementById('crm-f-canal')?.value  || '';

  // Primary contact helper
  const pc = r => (r.contacts && r.contacts.length) ? r.contacts[0] : {};

  let filtered = data.filter(r => {
    if (owner  && r.owner     !== owner)  return false;
    if (status && r.estado    !== status) return false;
    if (ind    && r.industria !== ind)    return false;
    if (canal  && r.canal     !== canal)  return false;
    if (q) {
      const contact = pc(r);
      const hay = ((r.nombre||'')+(contact.nombre||'')+(contact.email||'')+(contact.telefono||'')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Sort
  filtered.sort((a, b) => {
    let av = (a[crmSortKey] ?? '').toString();
    let bv = (b[crmSortKey] ?? '').toString();
    if (crmSortKey === 'mrr' || crmSortKey === 'acv') {
      av = parseFloat(av) || 0; bv = parseFloat(bv) || 0;
      return crmSortAsc ? av - bv : bv - av;
    }
    return crmSortAsc ? av.localeCompare(bv, 'es') : bv.localeCompare(av, 'es');
  });

  _crmFiltered = filtered;

  // Stats
  const PIPELINE_ST = new Set(['Calificado','Discovery','Demo','Propuesta','Close 2 close','Cerrado','Piloto']);
  const leads   = data.filter(r => r.estado === 'Lead' || r.estado === 'activo').length;
  const inPipe  = data.filter(r => PIPELINE_ST.has(r.estado)).length;
  const clients = data.filter(r => r.estado === 'Client').length;
  const totalMRR = data.reduce((s, r) => s + (parseFloat(r.mrr) || 0), 0);

  const el = id => document.getElementById(id);
  if (el('cs-total'))    el('cs-total').textContent   = data.length.toLocaleString();
  if (el('cs-leads'))    el('cs-leads').textContent   = leads.toLocaleString();
  if (el('cs-pipeline')) el('cs-pipeline').textContent = inPipe.toLocaleString();
  if (el('cs-clients'))  el('cs-clients').textContent = clients.toLocaleString();
  if (el('cs-mrr'))      el('cs-mrr').textContent     = '$' + Math.round(totalMRR).toLocaleString();

  // Pagination
  const total      = filtered.length;
  const totalPages = Math.ceil(total / CRM_PAGE_SIZE) || 1;
  if (crmPage > totalPages) crmPage = totalPages;
  const start = (crmPage - 1) * CRM_PAGE_SIZE;
  const page  = filtered.slice(start, start + CRM_PAGE_SIZE);

  // Rows
  const tbody = document.getElementById('crm-tbody');
  if (!tbody) return;
  if (!page.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="no-data">Sin resultados para este filtro.</td></tr>';
  } else {
    tbody.innerHTML = page.map(r => {
      const mrr = parseFloat(r.mrr) || 0;
      const acv = parseFloat(r.acv) || 0;
      const badgeCls = ST_BADGE[r.estado] || 'st-badge st-lead';
      const contact  = pc(r);
      const safeId   = String(r.id).replace(/'/g, "\\'");
      return `<tr onclick="crmOpenEdit('${safeId}')">
        <td>
          <span class="crm-name" title="${(r.nombre||'').replace(/"/g,'')}">${r.nombre||'—'}</span>
          <span class="crm-sub">${r.industria||''}</span>
        </td>
        <td><span class="owner-chip">${(r.owner||'—').split(' ')[0]}</span></td>
        <td><span class="${badgeCls}">${r.estado||'Lead'}</span></td>
        <td style="color:var(--muted)">${r.industria||'—'}</td>
        <td style="color:var(--muted)">${r.canal||'—'}</td>
        <td>
          <div style="font-size:11px;font-weight:600">${contact.nombre||'—'}</div>
          <div style="font-size:10px;color:var(--muted)">${contact.email||''}</div>
        </td>
        <td style="font-weight:700;color:var(--green-text)">${mrr ? '$'+mrr.toLocaleString() : '—'}</td>
        <td style="font-weight:700">${acv ? '$'+acv.toLocaleString() : '—'}</td>
        <td><button class="del-btn" onclick="event.stopPropagation();crmDeleteId('${safeId}')" title="Eliminar">✕</button></td>
      </tr>`;
    }).join('');
  }

  // Pagination bar
  const pag = document.getElementById('crm-pagination');
  if (!pag) return;
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

// ── Open Edit Modal ──────────────────────────────────────────────────────────
function crmOpenEdit(id) {
  const rec = _crmData.find(r => String(r.id) === String(id));
  if (!rec) return;

  const contact = (rec.contacts && rec.contacts.length) ? rec.contacts[0] : {};

  document.getElementById('crm-modal-title').textContent = '✏️ Editar Empresa';
  document.getElementById('crm-edit-id').value       = rec.id;
  document.getElementById('crm-contact-id').value    = contact.id || '';
  document.getElementById('cf-name').value           = rec.nombre    || '';
  document.getElementById('cf-web').value            = rec.web       || '';
  document.getElementById('cf-owner').value          = rec.owner     || '';
  document.getElementById('cf-status').value         = rec.estado    || 'Lead';
  document.getElementById('cf-industry').value       = rec.industria || '';
  document.getElementById('cf-canal').value          = rec.canal     || '';
  document.getElementById('cf-size').value           = rec.tamaño    || '';
  document.getElementById('cf-contact').value        = contact.nombre    || '';
  document.getElementById('cf-puesto').value         = contact.cargo     || '';
  document.getElementById('cf-email').value          = contact.email     || '';
  document.getElementById('cf-phone').value          = contact.telefono  || '';
  document.getElementById('cf-mrr').value            = parseFloat(rec.mrr) || '';
  document.getElementById('cf-acv').value            = parseFloat(rec.acv) || '';
  document.getElementById('cf-notes').value          = rec.notas     || '';

  document.getElementById('crm-delete-btn').style.display = 'inline-flex';
  openModal('modalCRMNew');
}

// ── Clear / Close Modal ──────────────────────────────────────────────────────
function crmCloseModal() {
  closeModal('modalCRMNew');
  document.getElementById('crm-modal-title').textContent = '🏢 Nueva Empresa';
  document.getElementById('crm-edit-id').value    = '';
  document.getElementById('crm-contact-id').value = '';
  document.getElementById('crm-delete-btn').style.display = 'none';
  [
    'cf-name','cf-web','cf-owner','cf-industry','cf-canal','cf-size',
    'cf-contact','cf-puesto','cf-email','cf-phone','cf-mrr','cf-acv','cf-notes',
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  // Reset selects to defaults
  const st = document.getElementById('cf-status');
  if (st) st.value = 'Lead';
}

// ── Save (Create or Update) ──────────────────────────────────────────────────
async function crmSave() {
  const nombre = document.getElementById('cf-name').value.trim();
  const owner  = document.getElementById('cf-owner').value;
  if (!nombre) { showToast('⚠ Ingresa el nombre de la empresa', 'err'); return; }
  if (!owner)  { showToast('⚠ Selecciona un responsable', 'err');       return; }

  const editId    = document.getElementById('crm-edit-id').value.trim();
  const contactId = document.getElementById('crm-contact-id').value.trim();

  const companyPayload = {
    nombre,
    web:       document.getElementById('cf-web').value.trim()  || null,
    owner,
    estado:    document.getElementById('cf-status').value      || 'Lead',
    industria: document.getElementById('cf-industry').value    || null,
    canal:     document.getElementById('cf-canal').value       || null,
    tamaño:    document.getElementById('cf-size').value        || null,
    mrr:       parseFloat(document.getElementById('cf-mrr').value)  || 0,
    acv:       parseFloat(document.getElementById('cf-acv').value)  || 0,
    notas:     document.getElementById('cf-notes').value.trim() || null,
    fuente:    'Manual',
    updated_at: new Date().toISOString(),
  };

  // Contact info (optional)
  const contactNombre  = document.getElementById('cf-contact').value.trim();
  const contactCargo   = document.getElementById('cf-puesto').value.trim();
  const contactEmail   = document.getElementById('cf-email').value.trim();
  const contactTelefono= document.getElementById('cf-phone').value.trim();
  const hasContact     = contactNombre || contactEmail;

  try {
    let companyId = editId;

    if (editId) {
      // ── UPDATE existing company ──────────────────────────────────────────
      await sbFetch('PATCH', `companies?id=eq.${editId}`, companyPayload);

      // Update local cache
      const idx = _crmData.findIndex(r => String(r.id) === editId);
      if (idx >= 0) {
        _crmData[idx] = { ..._crmData[idx], ...companyPayload, id: editId };
      }

      // Update or create contact
      if (hasContact) {
        const contactPayload = {
          company_id: editId,
          nombre:     contactNombre || null,
          cargo:      contactCargo  || null,
          email:      contactEmail  || null,
          telefono:   contactTelefono || null,
          updated_at: new Date().toISOString(),
        };
        if (contactId) {
          await sbFetch('PATCH', `contacts?id=eq.${contactId}`, contactPayload);
          if (idx >= 0) {
            _crmData[idx].contacts = [{ ..._crmData[idx].contacts?.[0], ...contactPayload, id: contactId }];
          }
        } else {
          contactPayload.estado = 'nuevo';
          contactPayload.tipo_contacto = 'otro';
          const newContact = await sbFetch('POST', 'contacts', [contactPayload]);
          if (idx >= 0 && Array.isArray(newContact) && newContact[0]) {
            _crmData[idx].contacts = [newContact[0]];
          }
        }
      }

      showToast('✅ Empresa actualizada — ' + nombre, 'ok');

    } else {
      // ── CREATE new company ───────────────────────────────────────────────
      const [newCompany] = await sbFetch('POST', 'companies', [companyPayload]);
      companyId = newCompany?.id;

      const newRecord = { ...companyPayload, id: companyId, contacts: [] };

      // Create contact if provided
      if (hasContact && companyId) {
        const contactPayload = {
          company_id:   companyId,
          nombre:       contactNombre || null,
          cargo:        contactCargo  || null,
          email:        contactEmail  || null,
          telefono:     contactTelefono || null,
          estado:       'nuevo',
          tipo_contacto:'otro',
        };
        const [newContact] = await sbFetch('POST', 'contacts', [contactPayload]);
        if (newContact) newRecord.contacts = [newContact];
      }

      _crmData.unshift(newRecord);
      showToast('✅ Empresa registrada — ' + nombre, 'ok');
    }

    crmCloseModal();
    crmRender();
  } catch(e) {
    showToast('Error guardando empresa: ' + e.message, 'err');
  }
}

// ── Delete by id (from table row ✕ button) ──────────────────────────────────
async function crmDeleteId(id) {
  if (!confirm('¿Eliminar esta empresa del CRM? También se eliminarán sus contactos.')) return;
  try {
    await sbFetch('DELETE', `companies?id=eq.${id}`);
    _crmData = _crmData.filter(r => String(r.id) !== String(id));
    crmRender();
    showToast('Empresa eliminada', '');
  } catch(e) { showToast('Error eliminando: ' + e.message, 'err'); }
}

// ── Delete from edit modal ───────────────────────────────────────────────────
async function crmDeleteCurrent() {
  const id = document.getElementById('crm-edit-id').value.trim();
  if (!id) return;
  if (!confirm('¿Eliminar esta empresa del CRM? También se eliminarán sus contactos.')) return;
  try {
    await sbFetch('DELETE', `companies?id=eq.${id}`);
    _crmData = _crmData.filter(r => String(r.id) !== id);
    crmCloseModal();
    crmRender();
    showToast('Empresa eliminada', '');
  } catch(e) { showToast('Error eliminando: ' + e.message, 'err'); }
}

// ── Export CSV ───────────────────────────────────────────────────────────────
function crmExportCSV() {
  const data = _crmFiltered.length ? _crmFiltered : _crmData;
  const HEADERS = ['ID','Empresa','Web','Responsable','Status','Industria','Canal','Tamaño','Contacto','Puesto','Email','Telefono','MRR','ACV','Notas'];
  const rows = data.map(r => {
    const c = (r.contacts && r.contacts.length) ? r.contacts[0] : {};
    return [
      r.id, r.nombre, r.web, r.owner, r.estado, r.industria, r.canal, r.tamaño,
      c.nombre, c.cargo, c.email, c.telefono, r.mrr, r.acv, r.notas
    ].map(v => '"'+String(v||'').replace(/"/g,'""')+'"').join(',');
  });
  const csv  = [HEADERS.join(','), ...rows].join('\n');
  const blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'birdie-crm-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Helpers used by pipeline.js (CRM company search in deal form) ────────────
function crmNextId() { return null; } // kept for backward compat; UUID auto-generated now

export {
  crmLoad, crmRender, crmSetData, crmSave, crmDeleteId, crmDeleteCurrent,
  crmGet, crmNextId, crmOpenEdit, crmExportCSV, crmSort, crmGoPage,
  crmCloseModal,
};
