import { STAGE_COLORS, STAGE_ORDER_LIST, STAGE_PROB, ACTIVE_STAGES, MONTH_NAMES_ES } from './config.js';
import { fmt$, fmtMonth, parsePipeMoney, daysBetween } from './utils.js';

function parseSupabaseData(data) {
  const ACTIVE = new Set(['Weekly Hunt','Active Lead','Active lead','Calificado','Discovery','Demo','Propuesta','Close 2 close','Piloto']);
  const stageCounts = {}, stageACV = {};
  let totalACV=0, totalMRR=0, cerradoMRR=0, cerradoMRRThisMonth=0, cerradoACV=0, cerradoImpl=0;
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
    const acv  = parsePipeMoney(r.acv);
    const mrr  = parsePipeMoney(r.mrr);
    stageACV[status] = (stageACV[status]||0)+acv;
    if (ACTIVE.has(status)) { activeCount++; totalACV+=acv; totalMRR+=mrr; }

    if (status==='Cerrado') {
      const impl = parsePipeMoney(r.implementaciones);
      const cierreMonth = (r.cierre_date||'').slice(0,7);
      cerradoMRR+=mrr; cerradoACV+=acv; cerradoImpl+=impl;
      if (cierreMonth === today) {
        cerradoMRRThisMonth+=mrr;
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
    cerradoMRR, cerradoMRRThisMonth, cerradoACV, cerradoImpl,
    clienteMRR, clienteACV, clienteCount, clienteAccounts,
    stageCounts, stageACV,
    cerradoAccounts: cerradoAccounts.sort((a,b)=>b.mrr-a.mrr),
    projectedByMonth,
  };
}

function renderDashboard(d) {
  // ── KPIs — todos los 4 cards
  const cerradoCnt = d.stageCounts['Cerrado'] || 0;
  const mrrGoalPct = Math.round(d.cerradoMRRThisMonth / 7000 * 100);

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
  setEl('kpi-mrr-confirmed-delta', d.cerradoMRRThisMonth > 0 ? '🏆 +$' + d.cerradoMRRThisMonth.toLocaleString() + ' nuevos este mes' : 'Acumulado · sin cierres este mes');
  setClass('kpi-mrr-confirmed-delta', d.cerradoMRRThisMonth > 0 ? 'delta-ok' : 'delta-new');

  // ── Goals (Metas de Marzo)
  // Las metas miden avance acumulado del mes, no el snapshot actual por etapa.
  // Solo se actualiza el MRR confirmado (dato exacto desde Cerrado).
  // Los conteos de leads/discovery/demo/propuesta se deben actualizar manualmente
  // desde la pestaña KPIs → Registro de Actividad.
  const mrrPct = Math.min(Math.round(d.cerradoMRRThisMonth / 7000 * 100), 133);
  const gMrr = document.getElementById('g-mrr');
  const gfMrr = document.getElementById('gf-mrr');
  const gsMrr = document.getElementById('gs-mrr');
  if (gMrr) gMrr.textContent = '$' + d.cerradoMRRThisMonth.toLocaleString();
  if (gfMrr) gfMrr.style.width = Math.min(mrrPct, 100) + '%';
  if (gsMrr) {
    const cerradoCnt = d.stageCounts['Cerrado'] || 0;
    gsMrr.textContent = mrrPct >= 100
      ? '✅ META SUPERADA · ' + mrrPct + '% · ' + cerradoCnt + ' cuentas'
      : mrrPct + '% · ' + cerradoCnt + ' cuentas · faltan $' + Math.max(7000 - d.cerradoMRRThisMonth, 0).toLocaleString();
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
    const mrrGoalPct = Math.round(d.cerradoMRRThisMonth / 7000 * 100);
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

export { parseSupabaseData, renderDashboard, showProjDeals };
