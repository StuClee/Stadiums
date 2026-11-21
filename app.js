/* User interface. State lives in this browser (localStorage); export/import JSON to move or back it up. */
(function () {
  'use strict';
  const M = window.MODEL, C = window.CORE;
  const KEY = 'stadium-performance-model.v1';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f1 = v => v == null ? '–' : (+v).toFixed(1);
  const f0 = v => v == null ? '–' : Math.round(v).toString();
  const money = v => v == null ? '–' : (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-NZ');
  const pc = v => v == null ? '–' : (Math.round(v * 1000) / 10) + '%';
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthOf = d => { if (!d) return ''; const [y, m] = d.split('-'); return MN[+m - 1] + '-' + y; };
  const uid = p => p + Math.random().toString(36).slice(2, 9);
  const KPI = Object.fromEntries(M.kpis.map(k => [k.id, k]));
  const SHORT = { 'KPI-M': 'Mowing', 'KPI-L': 'Line marking', 'KPI-I': 'Irrigation', 'KPI-G': 'Goal posts', 'KPI-N': 'Nutrition', 'KPI-R': 'Surface repair', 'KPI-T': 'Turf health', 'KPI-P': 'Playability', 'KPI-V': 'Renovation', 'KPI-O': 'Operations', 'KPI-C': 'Compliance', 'KPI-GD': 'Gardens', 'KPI-HS': 'Hard surfaces' };
  const shortName = id => SHORT[id] || (KPI[id] || {}).name || id;
  // Column heading with a short explanation underneath and a hover tip
  const th = (label, sub, tip) => `<th${tip ? ` title="${esc(tip)}"` : ''}>${label}${sub ? `<span class="th-sub">${sub}</span>` : ''}</th>`;
  const kth = k => th(k.id.replace('KPI-', ''), shortName(k.id), `${k.id} ${k.name}: event score out of 100`);

  /* ---------- state ---------- */
  function newYear(id, name, months) { return { id, name, months: months.slice() }; }
  function emptyData() { return { events: [], deductions: [], notAssessed: {}, bands: {}, lastReported: '', trendsImproving: false }; }
  function fresh() {
    const c = window.SAMPLE ? SAMPLE.contractor : 'Contractor';
    return { settings: { values: {}, weights: {}, pass: {}, categories: {} },
             contractors: [c], years: [newYear(M.contractYear.id, M.contractYear.name, M.contractYear.months)],
             data: {}, ui: { contractor: c, year: M.contractYear.id, month: M.contractYear.months[0], event: null, kfilter: 'all', q: '' } };
  }
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch (e) { S = fresh(); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save in this browser'); } }
  let modelNotice = '';
  if (S.modelVersion !== M.version) {
    if (S.modelVersion !== undefined || Object.keys((S.settings || {}).weights || {}).length) {
      if (Object.keys((S.settings || {}).weights || {}).length || Object.keys((S.settings || {}).mweights || {}).length) { S.settings.weights = {}; S.settings.mweights = {}; modelNotice = 'The model was updated to V4 (21 November 2026): 13 scored KPIs weighted month by month, Sports Lighting removed and Usage Cameras reported only. Saved KPI weightings were reset to the new model weightings; your events and deductions are kept.'; }
    }
    S.modelVersion = M.version; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  }
  const cfg = () => C.cfgFrom(S.settings);
  const yearObj = () => S.years.find(y => y.id === S.ui.year) || S.years[0];
  const months = () => yearObj().months;
  const yd = (c = S.ui.contractor, y = S.ui.year) => (((S.data[c] = S.data[c] || {})[y] = S.data[c][y] || emptyData()));
  const hasData = () => Object.values(S.data).some(ys => Object.values(ys || {}).some(d => (d.events || []).length || (d.deductions || []).length));
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 2200); }
  function defaultMonth() { const d = yd(); const ms = months(); if (d.lastReported && ms.includes(d.lastReported)) return d.lastReported; return ms[0]; }

  /* ---------- helpers ---------- */
  const statusOf = (r, pass, k, m) => {
    if (r.result != null) return r.result < pass ? `<span class="status s-below">Below ${pass}</span>` : '<span class="status s-pass">Pass</span>';
    if (!m.reported) return '<span class="status s-na">Not reported</span>';
    if (r.offMonth) return '<span class="status s-na">Not scored this month</span>';
    if (r.notAssessed) return '<span class="status s-na">Not assessed</span>';
    return '<span class="status s-na">–</span>';
  };
  function heatColour(v, pass) {
    if (v == null) return '';
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    if (v < pass) { const t = Math.min(1, (pass - v) / 20); return dark ? `background:rgba(236,138,120,${0.18 + 0.4 * t})` : `background:rgba(244,177,131,${0.35 + 0.65 * t})`; }
    const t = Math.min(1, (v - pass) / 10); return dark ? `background:rgba(108,196,184,${0.08 + 0.32 * t})` : `background:rgba(157,206,198,${0.15 + 0.7 * t})`;
  }

  /* ---------- top bar ---------- */
  function renderCtx() {
    $('#contractorSel').innerHTML = S.contractors.map(s => `<option ${s === S.ui.contractor ? 'selected' : ''}>${esc(s)}</option>`).join('');
    $('#yearSel').innerHTML = S.years.map(y => `<option value="${y.id}" ${y.id === S.ui.year ? 'selected' : ''}>${esc(y.name)}</option>`).join('');
    if (!months().includes(S.ui.month)) S.ui.month = defaultMonth();
    const last = yd().lastReported;
    $('#monthSel').innerHTML = months().map(m => `<option ${m === S.ui.month ? 'selected' : ''} value="${m}">${m}${last && months().indexOf(m) > months().indexOf(last) ? ' (not reported)' : ''}</option>`).join('');
  }

  /* ---------- dashboard ---------- */
  function vDashboard() {
    const c = cfg(), d = yd(), Y = C.year(c, d, months()), m = Y.months.find(x => x.month === S.ui.month) || Y.months[0];
    const st = c.settings;
    const kRows = M.kpis.map(k => { const r = m.kpi[k.id], a = Y.kpiAvg[k.id], pass = c.pass[k.id];
      return `<tr><td><span class="pill-k">${k.id}</span></td><td>${esc(k.name)}<div class="muted small">TS ${esc(k.ts)} ${esc(k.service)}</div></td>
        <td class="num">${pc(m.weights[k.id])}</td><td class="num"><b>${f1(r.result)}</b></td><td>${statusOf(r, pass, k, m)}</td>
        <td class="num">${r.events ? f1(r.mean) : '<span class="muted">no event</span>'}</td><td class="num">${r.ded ? '−' + r.ded : '0'}</td>
        <td class="num">${f1(a.avg)}</td><td class="num">${a.below}</td><td class="num">${a.fails}</td></tr>`; }).join('');
    const heat = `<table class="t heat"><thead><tr>${th('KPI', 'Key performance indicator')}${th('Avg weight', 'Across the year')}${Y.months.map(x => `<th class="${x.month === m.month ? 'sel' : ''}" style="text-align:center">${x.month.replace('-20', ' ')}</th>`).join('')}</tr></thead><tbody>
      ${M.kpis.map(k => `<tr><td><span class="pill-k">${k.id}</span> <span class="small">${esc(shortName(k.id))}</span></td><td class="num muted">${pc(C.avgWeight(c, k.id))}</td>${Y.months.map(x => { const v = x.kpi[k.id].result; return `<td class="h ${x.month === m.month ? 'sel' : ''}" style="${heatColour(v, c.pass[k.id])}" title="${k.id} ${x.month}: ${v == null ? (x.reported ? (x.kpi[k.id].offMonth ? 'not scored this month (0% weight)' : 'not assessed') : 'not reported') : f1(v)}">${v == null ? (x.reported && x.kpi[k.id].offMonth ? '<span class="muted">–</span>' : '') : f0(v)}</td>`; }).join('')}</tr>`).join('')}
      <tr><td><b>Overall</b></td><td></td>${Y.months.map(x => `<td class="h ${x.month === m.month ? 'sel' : ''}" style="${heatColour(x.overall, st.passThreshold)}"><b>${x.overall == null ? '' : f1(x.overall)}</b></td>`).join('')}</tr></tbody></table>`;
    const fails = m.failures.map(f => `<tr><td>${esc(f.event.date)}</td><td>${esc(f.event.name)}</td><td><span class="pill-k">${f.ref}</span> ${esc(f.s.name)}${f.s.critical ? ' <span class="crit">CRITICAL</span>' : ''}</td><td>${esc(f.note || '')}</td></tr>`).join('');
    const deds = (d.deductions || []).filter(x => x.month === m.month).map(x => { const s = C.STD[x.ref] || {}; return `<tr><td><span class="pill-k">${esc(x.ref)}</span> ${esc(s.name || '')}</td><td class="num">${esc(x.count)}</td><td class="num">${x.confirmed ? (x.count * C.points(c, x.ref)) : '<span class="muted">not confirmed</span>'}</td><td>${esc(x.note || '')}</td></tr>`; }).join('');
    const yesNo = b => b ? '<span class="status s-below">Yes</span>' : '<span class="status s-pass">No</span>';
    const bandsTot = M.bands.reduce((a, b) => { const r = C.band(c, (d.bands || {})[b.id] || {}); a.extra += r.extra; a.credit += r.credit; return a; }, { extra: 0, credit: 0 });
    return `
    ${S.sample ? `<div class="card small no-print" style="background:var(--warn-soft);border-color:var(--warn-soft)"><b>Showing sample data for ${esc(SAMPLE.contractor)}.</b> These are illustrative results, not real assessments. Clear them in Setup before you start recording.</div>` : ''}
    ${!hasData() ? '<div class="card small no-print">Nothing recorded yet. <a href="#events">Record an event</a>, or <a href="#setup">load sample data</a> in Setup to see how the dashboard works.</div>' : ''}
    <div class="head"><div><div class="label">${esc(S.ui.contractor)} · ${esc(yearObj().name)} · ${esc(m.month)}</div><h1>Performance dashboard</h1></div>
      <div class="row no-print"><button class="btn primary" data-act="pdf">Save as PDF</button><button class="btn" data-act="print">Print</button></div></div>
    <div class="tiles">
      <div class="card tile ${m.below ? 'bad' : ''}"><div class="label">Overall score · ${esc(m.month)}</div><div class="big">${m.overall == null ? '–' : f1(m.overall)}</div>
        <div class="small">${m.overall == null ? (m.reported ? 'No KPIs assessed' : `After the last month reported (${esc(d.lastReported)})`) : m.below ? `Below the pass threshold of ${st.passThreshold}` : `Pass (threshold ${st.passThreshold})`}</div></div>
      <div class="card tile"><div class="label">Fee paid</div><div class="big">${m.feePct == null ? '–' : pc(m.feePct)}</div><div class="small">${m.fee == null ? '' : `${money(m.feePaid)} of ${money(m.fee)}`}</div></div>
      <div class="card tile ${m.abatement ? 'bad' : ''}"><div class="label">Abatement</div><div class="big">${money(m.abatement)}</div><div class="small">Year to date ${money(Y.abatement)}</div></div>
      <div class="card tile ${m.rectification ? 'bad' : 'good'}"><div class="label">Rectification plan</div><div class="big" style="font-size:1.5rem">${m.reported ? (m.rectification ? 'Required' : 'Not required') : '–'}</div>
        <div class="small">Event failure: ${m.eventFailure ? 'Yes' : 'No'} · Critical: ${m.critical.length ? 'Yes' : 'No'} · Months below in a row: ${m.consecutive}</div></div>
      <div class="card tile"><div class="label">Year to date score</div><div class="big">${f1(Y.average)}</div><div class="small">${Y.reported} months reported · ${Y.monthsBelow} below ${st.passThreshold}</div></div>
      <div class="card tile ${Y.incentive ? 'good' : ''}"><div class="label">Incentive (Part F)</div><div class="big" style="font-size:1.5rem">${Y.incentive ? 'Released' : 'Not yet'}</div>
        <div class="small">${Y.atIncentive} of ${st.incentiveMonths} months at ${st.incentiveScore}+ · trends ${d.trendsImproving ? 'improving' : 'not confirmed'}</div></div>
    </div>
    <div class="charts">
      <figure class="card chart-card"><figcaption><h2>Overall score by month</h2><span class="muted small">Dashed lines mark the pass threshold (${st.passThreshold}) and incentive score (${st.incentiveScore})</span></figcaption><div class="chart-box"><canvas id="chScore" role="img" aria-label="Bar chart of the overall performance score by month"></canvas></div></figure>
      <figure class="card chart-card"><figcaption><h2>Fee paid and abatement by month</h2><span class="muted small">Monthly performance fee ${money(st.monthlyFee)}</span></figcaption><div class="chart-box"><canvas id="chFee" role="img" aria-label="Stacked bar chart of fee paid and abatement by month"></canvas></div></figure>
    </div>
    <div class="card"><div class="flex-between"><h2>KPI results · ${esc(m.month)}</h2><span class="muted small">Result = mean event score less capped monthly deductions</span></div><div class="tablebox"><table class="t">
      <thead><tr>${th('KPI', 'Code')}${th('Name', 'Key performance indicator')}${th('Weight this month', 'Share of the overall score')}${th('Result', 'Out of 100')}${th('Status', 'Against the KPI pass mark')}${th('Event score', 'Average of the month\'s events')}${th('Deductions', 'Confirmed points taken off')}${th('Year avg', 'Months reported so far')}${th('Months below', 'Below the pass mark this year')}${th('Event fails', 'Failed standards this year')}</tr></thead>
      <tbody>${kRows}</tbody></table></div></div>
    <div class="card"><h2>KPI results by month</h2><p class="muted small">Orange below the pass threshold, teal towards 100. Blank = not reported or not assessed; – = not scored that month (0% weight). The month shown is in bold.</p><div class="tablebox">${heat}</div></div>
    <div class="grid">
      <div class="card"><h2>Event failures · ${esc(m.month)}</h2>${fails ? `<div class="tablebox"><table class="t"><thead><tr><th>Date</th><th>Event</th><th>Standard</th><th>Note</th></tr></thead><tbody>${fails}</tbody></table></div>` : '<p class="muted small">No failed event standards this month.</p>'}</div>
      <div class="card"><h2>Monthly deductions · ${esc(m.month)}</h2>${deds ? `<div class="tablebox"><table class="t"><thead><tr><th>Standard</th><th class="num">Count</th><th class="num">Points</th><th>Note</th></tr></thead><tbody>${deds}</tbody></table></div>` : '<p class="muted small">No deductions logged this month.</p>'}</div>
    </div>
    <div class="grid">
      <div class="card"><h2>Escalation and incentive (Part F)</h2><table class="t"><tbody>
        <tr><td>Months below threshold</td><td class="num"><b>${Y.monthsBelow}</b></td></tr>
        <tr><td>Three months below in any rolling six?</td><td class="num">${yesNo(Y.threeInSix)}</td></tr>
        <tr><td>Six months below in any twelve?</td><td class="num">${yesNo(Y.sixInTwelve)}</td></tr>
        <tr><td>Months with a critical failure</td><td class="num"><b>${Y.criticalMonths}</b></td></tr>
        <tr><td>Months with a rectification plan required</td><td class="num"><b>${Y.rectMonths}</b></td></tr>
        <tr><td>Months at or above ${st.incentiveScore}</td><td class="num"><b>${Y.atIncentive}</b></td></tr>
        <tr><td>Incentive pool released?</td><td class="num">${Y.incentive ? '<span class="status s-pass">Yes</span>' : '<span class="status s-na">No</span>'}</td></tr></tbody></table></div>
      <div class="card"><h2>Fee and bands, months reported</h2><table class="t"><tbody>
        <tr><td>Performance fee for months reported</td><td class="num">${money(Y.feeTotal)}</td></tr>
        <tr><td>Fee paid after abatement</td><td class="num">${money(Y.feePaid)}</td></tr>
        <tr><td>Abatements withheld (pool value if released)</td><td class="num">${money(Y.abatement)}</td></tr>
        <tr><td>Band extra payments to contractor</td><td class="num">${money(bandsTot.extra)}</td></tr>
        <tr><td>Band credits to Principal</td><td class="num">${money(bandsTot.credit)}</td></tr>
        <tr><td><b>Total paid to contractor</b></td><td class="num"><b>${money(Y.feePaid + bandsTot.extra - bandsTot.credit)}</b></td></tr></tbody></table>
        <p class="muted small">Bands are reconciled once a year (<a href="#bands">Bands</a>).</p></div>
    </div>`;
  }

  /* ---------- charts ---------- */
  let charts = [];
  function destroyCharts() { charts.forEach(c => c.destroy()); charts = []; }
  function palette(forceLight) {
    const dark = !forceLight && matchMedia('(prefers-color-scheme: dark)').matches;
    return dark ? { main: '#6cc4b8', bad: '#ec8a78', soft: '#2c5a55', ink: '#e3eceb', muted: '#97a8a5', grid: '#2c3a38', surface: '#18211f', ref: '#97a8a5', inc: '#e0b061' }
                : { main: '#1c6a64', bad: '#b3412f', soft: '#9dcec6', ink: '#172422', muted: '#5a6866', grid: '#e3eae9', surface: '#ffffff', ref: '#5a6866', inc: '#8a5a12' };
  }
  function drawCharts(target, forceLight) {
    if (!window.Chart) return [];
    const cv = target || { score: $('#chScore'), fee: $('#chFee') };
    const c = cfg(), Y = C.year(c, yd(), months()), P = palette(forceLight), st = c.settings;
    const X = forceLight ? { animation: false, devicePixelRatio: 3, responsive: false } : {};
    Chart.defaults.font.family = '"Source Sans 3", "Segoe UI", system-ui, sans-serif'; Chart.defaults.color = P.muted;
    const labels = Y.months.map(m => m.month.replace('-20', ' '));
    const scaleX = { grid: { display: false }, border: { color: P.grid }, ticks: { color: P.muted } };
    const tip = { backgroundColor: P.ink, titleColor: P.surface, bodyColor: P.surface, padding: 10, cornerRadius: 6, boxPadding: 4 };
    const legend = { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10, boxHeight: 10, color: P.ink, padding: 14 } };
    const ref = (v, txt, col) => ({ type: 'line', label: txt, data: labels.map(() => v), borderColor: col, borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0, pointHoverRadius: 0, isRef: true });
    const made = [];
    made.push(new Chart(cv.score, { type: 'bar',
      data: { labels, datasets: [{ label: 'Overall score', data: Y.months.map(m => m.overall == null ? null : +m.overall.toFixed(1)),
        backgroundColor: Y.months.map(m => m.below ? P.bad : P.main), borderRadius: 4, maxBarThickness: 34 },
        ref(st.passThreshold, `Pass ${st.passThreshold}`, P.ref), ref(st.incentiveScore, `Incentive ${st.incentiveScore}`, P.inc)] },
      options: { ...X, maintainAspectRatio: false, scales: { x: scaleX, y: { min: 0, max: 100, ticks: { stepSize: 20, color: P.muted }, grid: { color: P.grid }, border: { display: false } } },
        plugins: { legend: { ...legend, labels: { ...legend.labels, generateLabels: ch => Chart.defaults.plugins.legend.labels.generateLabels(ch).map((l, i) => i === 0 ? { ...l, fillStyle: P.main, strokeStyle: P.main } : l) } }, tooltip: { ...tip, filter: i => !i.dataset.isRef, callbacks: { label: x => ` Overall score: ${x.parsed.y == null ? 'not reported' : x.parsed.y.toFixed(1)}` } } } } }));
    made.push(new Chart(cv.fee, { type: 'bar',
      data: { labels, datasets: [
        { label: 'Fee paid', data: Y.months.map(m => m.feePaid == null ? null : Math.round(m.feePaid)), backgroundColor: P.soft, borderColor: P.surface, borderWidth: { top: 2 }, borderSkipped: 'bottom', maxBarThickness: 34 },
        { label: 'Abatement', data: Y.months.map(m => m.abatement == null ? null : Math.round(m.abatement)), backgroundColor: P.bad, borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom', maxBarThickness: 34 }] },
      options: { ...X, maintainAspectRatio: false, scales: { x: { ...scaleX, stacked: true }, y: { stacked: true, min: 0, ticks: { color: P.muted, callback: v => '$' + (v / 1000) + 'k' }, grid: { color: P.grid }, border: { display: false } } },
        plugins: { legend, tooltip: { ...tip, callbacks: { label: x => ` ${x.dataset.label}: ${money(x.parsed.y)}` } } } } }));
    return made;
  }

  /* ---------- events ---------- */
  function vEvents() {
    const c = cfg(), d = yd(), evs = (d.events || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let ev = evs.find(e => e.id === S.ui.event);
    const evKpis = M.kpis.filter(k => C.eventKpi(k.id));
    const list = evs.map(e => { const nf = Object.values(e.results || {}).filter(r => r.r === 'fail').length;
      const ok = months().includes(e.month);
      return `<tr class="${e.id === S.ui.event ? 'ev-sel' : ''}"><td style="white-space:nowrap">${esc(e.date)}</td><td><a href="#events" data-event="${e.id}" title="Open the scorecard to mark or change results"><b>${esc(e.name || 'Untitled event')}</b></a>${e.firstAfterRenovation ? ' <span class="chip">First after renovation</span>' : ''}${ok ? '' : ' <span class="warn-note">Date outside this contract year</span>'}</td>
        <td>${esc(e.tier ? 'Tier ' + e.tier : '')}</td><td class="num">${nf ? `<span class="status s-fail">${nf} fail${nf > 1 ? 's' : ''}</span>` : '<span class="status s-pass">All pass</span>'}</td>
        ${evKpis.map(k => { const v = C.eventScore(c, e, k.id); return `<td class="num" style="${heatColour(v, c.pass[k.id])}">${v == null ? '' : v}</td>`; }).join('')}</tr>`; }).join('');
    let detail = '';
    if (ev) {
      const groups = evKpis.map(k => {
        const stds = M.standards.filter(s => s.kpi === k.id && s.event);
        const off = k.id === 'KPI-V' && !ev.firstAfterRenovation;
        const sc = C.eventScore(c, ev, k.id);
        return `<div class="card"><div class="flex-between"><h3><span class="pill-k">${k.id}</span> ${esc(k.name)}</h3>
          <span>${off ? '<span class="status s-na">Scored only at the first event after renovation</span>' : `Event score <b>${sc}</b>`}</span></div>
          ${off ? '' : stds.map(s => { const r = (ev.results || {})[s.ref] || {};
            return `<div class="std-row" data-ref="${s.ref}"><span class="pill-k">${s.ref}</span>
              <div><b>${esc(s.name)}</b>${s.critical ? ' <span class="crit">CRITICAL</span>' : ''}<div class="small muted">${esc(s.target || '')}</div>
                <details><summary>How it is measured</summary><dl class="info"><dt>Applies</dt><dd>${esc(s.applies || '')}</dd><dt>Measurement</dt><dd>${esc(s.measure || '')}</dd><dt>Measured by</dt><dd>${esc(s.by || '')}</dd><dt>KPI link</dt><dd>${esc(s.link)}</dd></dl></details></div>
              <div class="pf"><button class="p" data-pf="pass" aria-pressed="${r.r === 'pass'}">Pass</button><button class="f" data-pf="fail" aria-pressed="${r.r === 'fail'}">Fail</button>${r.r ? '<button data-pf="" aria-pressed="false">Clear</button>' : ''}</div>
              ${r.r === 'fail' ? `<input class="note" type="text" data-evnote placeholder="Reading or observation, photo reference" value="${esc(r.note || '')}">` : ''}</div>`; }).join('')}</div>`; }).join('');
      const checked = Object.keys(ev.results || {}).length, total = M.standards.filter(s => s.event && (s.kpi !== 'KPI-V' || ev.firstAfterRenovation)).length;
      detail = `
      <div class="card sticky-bar" id="scorecard"><div class="flex-between"><div><div class="label">Readiness sign-off scorecard</div><h2>${esc(ev.name || 'Untitled event')}</h2></div>
        <div class="row"><a href="#events" class="btn" data-act="toList">Back to event list</a><span class="muted small">${checked} of ${total} standards checked</span><button class="btn" data-act="allPass">Mark unchecked as pass</button><button class="btn danger" data-act="delEvent">Delete event</button></div></div></div>
      <div class="card kv">
        <label class="field">Event date<input type="date" data-ev="date" value="${esc(ev.date || '')}"></label>
        <label class="field">Event and code<input type="text" data-ev="name" value="${esc(ev.name || '')}" placeholder="e.g. NRL round 12"></label>
        <label class="field">Tier<select data-ev="tier"><option value="">–</option><option ${ev.tier === 'A' ? 'selected' : ''} value="A">Tier A: internationals, finals, marquee</option><option ${ev.tier === 'B' ? 'selected' : ''} value="B">Tier B: regular season</option></select></label>
        <label class="field">Signed off by<input type="text" data-ev="signedBy" value="${esc(ev.signedBy || '')}"></label>
        <label class="row small"><input type="checkbox" data-ev="firstAfterRenovation" ${ev.firstAfterRenovation ? 'checked' : ''}> First event after renovation (scores KPI-V)</label>
        <div class="small muted">Month: <b>${esc(ev.month || '–')}</b>. A standard fixed before kick-off still records the fail.</div></div>
      ${groups}`;
    }
    return `
    <div class="head"><div><div class="label">${esc(S.ui.contractor)} · ${esc(yearObj().name)}</div><h1>Events and readiness sign-off</h1></div>
      <div class="row"><button class="btn primary" data-act="addEvent">Add event</button></div></div>
    <div class="card"><p class="muted small">Each KPI with event-scored standards starts at 100 at every event and loses ${c.settings.eventPoints} points for each failed standard. Click an event name to open its scorecard below the list, where you mark or change each standard. Each KPI column shows that KPI's event score out of 100: 100 means every standard passed; orange means the score is below the KPI's pass mark. Hover over a heading for the full KPI name.</p>
      <div class="tablebox"><table class="t"><thead><tr>${th('Date', 'Event day')}${th('Event', 'Click to open the scorecard')}${th('Tier', 'Event tier')}${th('Result', 'Failed standards')}${evKpis.map(kth).join('')}</tr></thead>
      <tbody>${list || `<tr><td colspan="99" class="muted">No events yet. Add one from the event calendar.</td></tr>`}</tbody></table></div></div>
    ${detail}`;
  }

  /* ---------- monthly deductions and relief ---------- */
  function vDeductions() {
    const c = cfg(), d = yd(), mo = S.ui.month, Mx = C.month(c, d, months(), mo);
    const rows = (d.deductions || []).map((x, i) => ({ x, i })).filter(o => o.x.month === mo);
    const opts = sel => M.kpis.map(k => `<optgroup label="${k.id} ${esc(k.name)}">${M.standards.filter(s => s.kpi === k.id && s.cat).map(s => `<option value="${s.ref}" ${s.ref === sel ? 'selected' : ''}>${s.ref} ${esc(s.name)} (cat ${s.cat}, ${C.points(c, s.ref)} pts)</option>`).join('')}</optgroup>`).join('') + `<optgroup label="Report only: Usage Cameras (not scored)">${M.standards.filter(s => s.kpi === 'Report only').map(s => `<option value="${s.ref}" ${s.ref === sel ? 'selected' : ''}>${s.ref} ${esc(s.name)}${s.critical ? ' (critical)' : ''}</option>`).join('')}</optgroup>`;
    const dRows = rows.map(({ x }) => { const s = C.STD[x.ref] || {};
      return `<tr data-did="${x.id}"><td style="min-width:260px"><select data-d="ref">${opts(x.ref)}</select><div class="small muted">${esc(s.link || '')}${s.critical ? ' · <span class="crit">CRITICAL</span>' : ''}</div></td>
        <td><input type="number" min="0" step="1" data-d="count" value="${esc(x.count)}" style="max-width:80px"></td>
        <td><label class="row small"><input type="checkbox" data-d="confirmed" ${x.confirmed ? 'checked' : ''}> Confirmed</label></td>
        <td class="num">${x.confirmed ? (Number(x.count) || 0) * C.points(c, x.ref) : '–'}</td>
        <td style="min-width:220px"><input type="text" data-d="note" value="${esc(x.note || '')}" style="width:100%"></td>
        <td><button class="btn danger" data-act="delDed">Remove</button></td></tr>`; }).join('');
    const kRows = M.kpis.map(k => { const r = Mx.kpi[k.id], na = ((d.notAssessed || {})[mo] || {})[k.id];
      return `<tr><td><span class="pill-k">${k.id}</span> ${esc(k.name)}</td><td class="num">${r.events}</td><td class="num">${f1(r.mean)}</td><td class="num">${r.ded ? '−' + r.ded : 0}</td>
        <td class="num"><b>${f1(r.result)}</b></td><td>${statusOf(r, c.pass[k.id], k, Mx)}</td>
        <td><label class="row small"><input type="checkbox" data-na="${k.id}" ${na != null ? 'checked' : ''}> Not assessed</label>${na != null ? `<input type="text" data-nareason="${k.id}" value="${esc(na)}" placeholder="Relief reason (Part F)" style="width:100%;margin-top:4px">` : ''}</td></tr>`; }).join('');
    return `
    <div class="head"><div><div class="label">${esc(S.ui.contractor)} · ${esc(mo)}</div><h1>Monthly deductions and relief</h1></div>
      <div class="row"><button class="btn primary" data-act="addDed">Add deduction</button></div></div>
    <div class="card sticky-bar"><div class="row" style="gap:22px">
      <div><div class="label">Overall score</div><div class="big" style="font-size:1.8rem">${f1(Mx.overall)}</div></div>
      <div><div class="label">Fee paid</div><div><b>${Mx.feePct == null ? '–' : pc(Mx.feePct)}</b> · abatement ${money(Mx.abatement)}</div></div>
      <div>${Mx.rectification ? '<span class="status s-below">Rectification plan required</span>' : ''}${!Mx.reported ? `<span class="status s-na">After the last month reported (${esc(d.lastReported)}); change it in Setup</span>` : ''}</div></div></div>
    <div class="card"><h2>Deductions logged · ${esc(mo)}</h2><p class="muted small">One row per confirmed incident, audit breach, late or incomplete item, or monthly measured standard outside tolerance. Only rows confirmed by the Principal's Representative count. Each standard is capped at ${c.settings.capPerStandard} points a month.</p>
      <div class="tablebox"><table class="t"><thead><tr><th>Standard</th><th>Count</th><th>Confirmed by PR</th><th class="num">Points</th><th>Note</th><th></th></tr></thead>
      <tbody>${dRows || '<tr><td colspan="6" class="muted">No deductions this month.</td></tr>'}</tbody></table></div></div>
    <div class="card"><h2>KPI results · ${esc(mo)}</h2><p class="muted small">Tick Not assessed for Part F relief (for example a field closed by TAU, a declared extreme weather event, or a failed TAU asset). That KPI's weight is reallocated to the KPIs assessed. A month with no event starts at ${c.settings.noEventScore}. A KPI with 0% weight this month (Setup, monthly weightings) shows Not scored this month.</p>
      <div class="tablebox"><table class="t"><thead><tr>${th('KPI', 'Key performance indicator')}${th('Events', 'Scored this month')}${th('Mean event score', 'Average of the event scores, out of 100')}${th('Deductions', 'Confirmed points taken off (capped)')}${th('Result', 'Mean event score less deductions')}${th('Status', 'Result against the KPI pass mark')}${th('Relief', 'Part F: tick if not assessed')}</tr></thead><tbody>${kRows}</tbody></table></div></div>`;
  }

  /* ---------- bands ---------- */
  function vBands() {
    const c = cfg(), d = yd(); d.bands = d.bands || {};
    let tot = { lump: 0, extra: 0, credit: 0, net: 0 };
    const inp = (b, f, w = 90) => `<input type="number" data-band="${b.id}" data-bf="${f}" value="${esc((d.bands[b.id] || {})[f] ?? '')}" style="max-width:${w}px">`;
    const rows = M.bands.map(b => { const v = d.bands[b.id] || {}, r = C.band(c, v);
      tot.lump += r.lump || 0; tot.extra += r.extra; tot.credit += r.credit; tot.net += r.net;
      return `<tr><td><b>${esc(b.ts)}</b><div class="small muted">${esc(b.band)} · ${esc(b.item)} · ${esc(b.unit)}</div></td>
        <td>${inp(b, 'lump', 110)}</td><td>${inp(b, 'min', 70)}</td><td>${inp(b, 'max', 70)}</td><td>${inp(b, 'rate')}</td><td>${inp(b, 'credit')}</td><td>${inp(b, 'logged', 70)}</td><td>${inp(b, 'principal', 70)}</td>
        <td><input type="checkbox" data-band="${b.id}" data-bf="allMet" ${v.allMet ? 'checked' : ''} aria-label="All standards met"></td>
        <td><span class="status ${r.status === 'Within band' ? 's-pass' : r.status === 'Not entered' ? 's-na' : 's-warn'}">${r.status}</span></td>
        <td class="num">${money(r.extra)}</td><td class="num">${money(r.credit)}</td><td class="num"><b>${money(r.net)}</b></td></tr>`; }).join('');
    return `
    <div class="head"><div><div class="label">${esc(S.ui.contractor)} · ${esc(yearObj().name)}</div><h1>Annual band reconciliation (Part E)</h1></div></div>
    <div class="card small"><p>Enter the tendered band and rates for each line, the quantity logged for the year and the units above the maximum that TAU caused. Payable units are the lesser of units above the maximum and TAU-caused units; growth, weather or contractor-driven units above the maximum earn no payment. Units below the minimum earn a credit, reduced to ${pc(c.settings.creditShare)} where every standard in that service area was met all year. Renovation has no band and is reconciled against the approved programme and budget.</p></div>
    <div class="card"><div class="tablebox"><table class="t"><thead><tr><th>Band</th><th>Lump sum</th><th>Min</th><th>Max</th><th>Rate above max</th><th>Credit below min</th><th>Logged</th><th>TAU-caused</th><th>All met</th><th>Status</th><th class="num">Extra</th><th class="num">Credit</th><th class="num">Net</th></tr></thead>
      <tbody>${rows}<tr class="sub"><td>Total</td><td class="num">${money(tot.lump)}</td><td colspan="8"></td><td class="num">${money(tot.extra)}</td><td class="num">${money(tot.credit)}</td><td class="num">${money(tot.net)}</td></tr></tbody></table></div></div>`;
  }

  /* ---------- model ---------- */
  function vModel() {
    const c = cfg(), f = S.ui.kfilter || 'all', q = (S.ui.q || '').toLowerCase();
    const list = M.standards.filter(s => (f === 'all' || s.kpi === f || (f === 'critical' && s.critical) || (f === 'event' && s.event)) && (!q || (s.ref + ' ' + s.name + ' ' + (s.target || '')).toLowerCase().includes(q)));
    const wTot = M.kpis.reduce((a, k) => a + C.avgWeight(c, k.id), 0);
    return `
    <div class="head"><div><div class="label">${esc(M.version)}</div><h1>Model reference</h1></div></div>
    <div class="card"><h2>KPI scorecard (Part B)</h2><div class="tablebox"><table class="t"><thead><tr><th>KPI</th><th>Name</th><th>TS section</th><th class="num">Standards</th><th class="num">Event-scored</th><th class="num">Avg weight</th><th class="num">Pass</th></tr></thead><tbody>
      ${M.kpis.map(k => `<tr><td><span class="pill-k">${k.id}</span></td><td>${esc(k.name)}</td><td>TS ${esc(k.ts)} ${esc(k.service)}</td><td class="num">${M.standards.filter(s => s.kpi === k.id).length}</td><td class="num">${M.standards.filter(s => s.kpi === k.id && s.event).length}</td><td class="num">${pc(C.avgWeight(c, k.id))}</td><td class="num">${c.pass[k.id]}</td></tr>`).join('')}
      <tr class="sub"><td colspan="5">Total</td><td class="num">${pc(wTot)}</td><td></td></tr></tbody></table></div></div>
    <div class="grid">
      <div class="card"><h2>Scoring (Part C)</h2><table class="t"><thead><tr><th>Cat.</th><th>Category</th><th class="num">Points</th></tr></thead><tbody>
        ${Object.entries(M.categories).sort().map(([k, v]) => `<tr><td><b>${k}</b></td><td class="txt">${esc(v.name)}<div class="small muted">${esc(v.wording)}</div></td><td class="num">${k === 'A' ? c.settings.eventPoints + ' per fail' : c.categories[k]}</td></tr>`).join('')}</tbody></table>
        <p class="muted small">KPI result = mean of the month's event scores (or ${c.settings.noEventScore} with no event) less confirmed deductions, capped at ${c.settings.capPerStandard} points per standard per month.</p></div>
      <div class="card"><h2>Score to fee (Part D)</h2><table class="t"><thead><tr><th>Overall score</th><th>Fee paid</th><th>Other consequence</th></tr></thead><tbody>${M.scoreToFee.map(r => `<tr>${r.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    </div>
    <div class="card"><h2>Escalation and incentive (Part F)</h2><table class="t"><thead><tr><th>Trigger</th><th>Step</th><th>Who acts</th></tr></thead><tbody>${M.escalation.map(r => `<tr>${r.map(x => `<td class="txt">${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="card"><div class="flex-between"><h2>Standards register (${list.length} of ${M.standards.length})</h2>
      <div class="row"><select data-kfilter><option value="all">All KPIs</option><option value="event" ${f === 'event' ? 'selected' : ''}>Event-scored only</option><option value="critical" ${f === 'critical' ? 'selected' : ''}>Critical only</option><option value="Report only" ${f === 'Report only' ? 'selected' : ''}>Report only (Usage Cameras, not scored)</option>${M.kpis.map(k => `<option value="${k.id}" ${f === k.id ? 'selected' : ''}>${k.id} ${esc(k.name)}</option>`).join('')}</select>
      <input type="text" data-q placeholder="Search standards" value="${esc(S.ui.q || '')}"></div></div>
      <div class="tablebox"><table class="t"><thead><tr><th>Std</th><th>Standard and target</th><th>KPI link</th><th>Cat.</th><th class="num">Points</th></tr></thead><tbody>
      ${list.map(s => `<tr><td><span class="pill-k">${s.ref}</span>${s.critical ? '<div class="crit">CRITICAL</div>' : ''}</td><td class="txt"><b>${esc(s.name)}</b><div class="small">${esc(s.target || '')}</div><details><summary>Measurement</summary><dl class="info"><dt>Applies</dt><dd>${esc(s.applies || '')}</dd><dt>Method</dt><dd>${esc(s.measure || '')}</dd><dt>By</dt><dd>${esc(s.by || '')}</dd></dl></details></td><td class="small">${esc(s.link)}</td><td>${s.event ? 'A' + (s.cat ? ' + ' + s.cat : '') : esc(s.cat)}</td><td class="num">${s.event ? c.settings.eventPoints : ''}${s.event && s.cat ? ' / ' : ''}${s.cat ? C.points(c, s.ref) : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  /* ---------- overview: the model in plain English ---------- */
  function vOverview() {
    const c = cfg(), st = c.settings, nStd = M.standards.length, nEv = M.standards.filter(s => s.event).length;
    const nCrit = M.standards.filter(s => s.critical).length;
    const W = k => Math.round(C.avgWeight(c, k) * 1000) / 10;
    const groups = [
      ['Event day', 'What players, officials and broadcasters see and feel at kick-off', ['KPI-M', 'KPI-P', 'KPI-O', 'KPI-L', 'KPI-R']],
      ['Surface between events', 'Keeping the surface healthy through the season', ['KPI-I', 'KPI-N', 'KPI-V', 'KPI-C']],
      ['Support services', 'Treatments and equipment', ['KPI-T', 'KPI-G']],
      ['Gardens and hard surfaces', 'Precinct presentation, cleanliness and safety', ['KPI-GD', 'KPI-HS']]];
    const maxW = Math.max(...M.kpis.map(k => W(k.id)), 1);
    const coreW = Math.round((M.coreShare ? M.coreShare.kpis : M.kpis.map(k => k.id)).reduce((a, k) => a + W(k), 0) * 10) / 10;
    const weightBars = groups.map(([g, sub, ks]) => `
      <div class="ov-wgroup"><div class="ov-wg-head"><b>${g}</b><span class="muted small">${sub}</span><span class="ov-wg-tot">${Math.round(ks.reduce((a, k) => a + W(k), 0) * 10) / 10}%</span></div>
      ${ks.map(k => `<div class="ov-wbar"><span class="pill-k">${k}</span><span class="ov-wname">${esc(KPI[k].name)}</span><span class="ov-wtrack"><span style="width:${W(k) / maxW * 100}%"></span></span><span class="num">${W(k)}%</span></div>`).join('')}</div>`).join('');

    // score to fee step chart (SVG): x = score 60..100, y = fee 80..100%
    const x = s => 40 + (s - 60) / 40 * 520, y = f => 20 + (100 - f) / 20 * 160;
    const pts = []; for (let s = 60; s <= 100; s += 0.5) { const fee = s >= st.passThreshold ? 100 : Math.max(100 - st.abatementCap * 100, 100 - Math.floor(st.passThreshold - s + 1e-9) * st.abatementPerPoint * 100); pts.push(`${x(s).toFixed(1)},${y(fee).toFixed(1)}`); }
    const capScore = st.passThreshold - st.abatementCap / st.abatementPerPoint;
    const feeSvg = `<svg viewBox="0 0 600 230" class="ov-svg" role="img" aria-label="Chart of fee paid against the overall score: 100% at ${st.passThreshold} or above, falling ${pc(st.abatementPerPoint)} per point below, never below ${pc(1 - st.abatementCap)}">
      ${[80, 85, 90, 95, 100].map(f => `<line x1="40" x2="560" y1="${y(f)}" y2="${y(f)}" stroke="var(--line)"/><text x="32" y="${y(f) + 4}" text-anchor="end" class="ov-t">${f}%</text>`).join('')}
      ${[60, 70, 75, 80, 90, 95, 100].map(s => `<text x="${x(s)}" y="204" text-anchor="middle" class="ov-t">${s}</text>`).join('')}
      <text x="300" y="224" text-anchor="middle" class="ov-t">Overall monthly score</text>
      <rect x="${x(st.passThreshold)}" y="20" width="${x(100) - x(st.passThreshold)}" height="160" fill="var(--good-soft)" opacity=".7"/>
      <rect x="${x(capScore)}" y="20" width="${x(st.passThreshold) - x(capScore)}" height="160" fill="var(--warn-soft)" opacity=".7"/>
      <rect x="40" y="20" width="${x(capScore) - 40}" height="160" fill="var(--bad-soft)" opacity=".7"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round"/>
      <line x1="${x(st.incentiveScore)}" x2="${x(st.incentiveScore)}" y1="20" y2="180" stroke="var(--warn)" stroke-dasharray="5 4" stroke-width="1.5"/>
      <text x="${x(st.passThreshold) + 6}" y="36" class="ov-t ov-b">Full fee</text>
      <text x="${x(st.incentiveScore) - 6}" y="56" text-anchor="end" class="ov-t" style="fill:var(--warn)">Incentive ${st.incentiveScore}+</text>
      <text x="${x(capScore) + 6}" y="36" class="ov-t ov-b">−${pc(st.abatementPerPoint)} per point</text>
      <text x="46" y="36" class="ov-t ov-b">Capped at −${pc(st.abatementCap)}</text></svg>`;

    // escalation staircase (SVG)
    const steps = [['Rectification plan', 'Any event failure, critical failure, or ' + st.rectificationMonths + ' months below ' + st.passThreshold + ' in a row'],
      ['Formal review', '3 months below ' + st.passThreshold + ' in any 6'], ['Notice of default', '6 months below in any 12, or a failed plan'], ['Termination', 'Default not remedied']];
    const escSvg = `<div class="ov-stairs" role="img" aria-label="Escalation ladder: rectification plan, formal review, notice of default, termination">${steps.map(([t, d], i) => `<div class="ov-stair"><b>${t}</b><span class="small muted">${esc(d)}</span><div class="ov-bar" style="height:${24 + i * 26}px;opacity:${0.35 + i * 0.2}"></div></div>`).join('')}</div>
      <div class="ov-inc"><b>Incentive.</b> ${st.incentiveMonths} or more months at ${st.incentiveScore}+ with improving condition trends releases the incentive pool and earns an extension year.</div>`;

    // band diagram (SVG)
    const bandSvg = `<svg viewBox="0 0 600 150" class="ov-svg ov-narrow" role="img" aria-label="Annual band: below the minimum earns TAU a credit, within the band the price is unchanged, above the maximum is paid only for units TAU caused">
      <rect x="20" y="50" width="160" height="34" rx="6" fill="var(--warn-soft)"/><rect x="180" y="50" width="240" height="34" fill="var(--good-soft)"/><rect x="420" y="50" width="160" height="34" rx="6" fill="var(--soil-soft)"/>
      <line x1="180" x2="180" y1="40" y2="94" stroke="var(--ink)" stroke-width="2"/><line x1="420" x2="420" y1="40" y2="94" stroke="var(--ink)" stroke-width="2"/>
      <text x="180" y="32" text-anchor="middle" class="ov-t ov-b">Declared minimum</text><text x="420" y="32" text-anchor="middle" class="ov-t ov-b">Declared maximum</text>
      <text x="100" y="72" text-anchor="middle" class="ov-t ov-b">Below the band</text><text x="300" y="72" text-anchor="middle" class="ov-t ov-b">Within the band</text><text x="500" y="72" text-anchor="middle" class="ov-t ov-b">Above the band</text>
      <text x="100" y="112" text-anchor="middle" class="ov-t ov-s">Credit to TAU per unit,</text><text x="100" y="128" text-anchor="middle" class="ov-t ov-s">${pc(st.creditShare)} if every standard was met</text>
      <text x="300" y="112" text-anchor="middle" class="ov-t ov-s">Lump sum unchanged</text>
      <text x="500" y="112" text-anchor="middle" class="ov-t ov-s">Paid at the tendered rate only</text><text x="500" y="128" text-anchor="middle" class="ov-t ov-s">for extra units TAU caused</text></svg>`;

    // live example from the current data
    const Y = C.year(c, yd(), months()), m = Y.months.find(z => z.month === S.ui.month) || Y.months[0];
    const mK = m.kpi['KPI-M'];
    const example = m.overall == null ? '' : `
      <div class="card"><h2>A worked example from ${esc(S.ui.contractor)}, ${esc(m.month)}</h2>
        <ol class="ov-ex">
          <li>Mowing (KPI-M) was checked at ${mK.events} event${mK.events === 1 ? '' : 's'} this month, averaging an event score of <b>${f1(mK.mean)}</b>.</li>
          <li>${mK.ded ? `Confirmed monthly deductions took off <b>${mK.ded}</b> points` : 'There were no confirmed mowing deductions'}, so KPI-M scored <b>${f1(mK.result)}</b>${mK.below ? `, below its pass mark of ${c.pass['KPI-M']}` : ''}.</li>
          <li>The ${M.kpis.length} KPI results, weighted, give an overall score of <b>${f1(m.overall)}</b>.</li>
          <li>${m.feePct >= 1 ? 'That is at or above ' + st.passThreshold + ', so the full fee is paid' : `That is ${Math.floor(st.passThreshold - m.overall + 1e-9)} full point${Math.floor(st.passThreshold - m.overall + 1e-9) === 1 ? '' : 's'} below ${st.passThreshold}, so <b>${pc(m.feePct)}</b> of the fee is paid (${money(m.abatement)} abatement)`}.</li>
          <li>${m.rectification ? `A rectification plan is required because ${[m.eventFailure ? 'an event standard failed' : '', m.critical.length ? 'a critical standard failed' : '', m.consecutive >= st.rectificationMonths ? 'the score has been below ' + st.passThreshold + ' for ' + m.consecutive + ' months in a row' : ''].filter(Boolean).join(' and ')}.` : 'No rectification plan is needed this month.'}</li>
        </ol><p class="muted small">Change the month in the Dashboard to see another month worked through.${S.sample ? ' These are sample results, not a real assessment.' : ''}</p></div>`;

    return `
    <div class="head"><div><div class="label">Schedule 1 Performance Model, in plain English</div><h1>Model overview</h1></div></div>
    <div class="card ov-lead"><p>TAU pays the contractor a fixed monthly fee for the condition of the stadium surface and the services around it, not for how many times the field is mown or treated. Each month the contractor's work is checked against the standards in the Technical Specification, turned into a single score out of 100, and that score decides how much of the fee is paid and whether anything needs fixing.</p></div>
    <div class="ov-cards">
      <div class="card"><div class="label">Pay for outcomes</div><p>The specification says what a good result looks like. How the contractor gets there is up to them, set out in their Maintenance &amp; Operations Plan.</p></div>
      <div class="card"><div class="label">Event day matters most</div><p>Most points are won or lost at the joint readiness check before each event, and the event-day services carry ${Math.round(groups[0][2].reduce((a, k) => a + W(k), 0) * 10) / 10}% of the weight. The core sports turf services carry ${coreW}% in all.</p></div>
      <div class="card"><div class="label">Fair to both sides</div><p>The contractor is only scored on what they control. Quantities are settled once a year, and safety failures always trigger action.</p></div>
    </div>

    <div class="card"><h2>How the pieces fit together</h2><p class="muted small">Five steps every month, from the standards in the specification to the fee and any follow-up. Each step has its own tab in this app.</p>
      <div class="ov-flow">
        <div class="ov-step"><div class="ov-n">1</div><div class="ov-st">Measure</div><p>${nStd} standards across ${M.kpis.length} service areas, each with a set test or check.</p><div class="ov-k">Events tab · Monthly tab</div></div>
        <div class="ov-arr" aria-hidden="true"></div>
        <div class="ov-step"><div class="ov-n">2</div><div class="ov-st">Score each service area</div><p>Each of the ${M.kpis.length} KPIs starts the month at 100 and loses points for confirmed failures.</p><div class="ov-k">−${st.eventPoints} event failure · −10 incident · −5 late</div></div>
        <div class="ov-arr" aria-hidden="true"></div>
        <div class="ov-step"><div class="ov-n">3</div><div class="ov-st">Combine</div><p>The ${M.kpis.length} results are weighted into one overall score out of 100.</p><div class="ov-k">Core sports turf ${coreW}% · Gardens and hard surfaces ${Math.round((100 - coreW) * 10) / 10}%</div></div>
        <div class="ov-arr" aria-hidden="true"></div>
        <div class="ov-step ov-dark"><div class="ov-n">4</div><div class="ov-st">Pay</div><p>The overall score sets how much of the ${money(st.monthlyFee)} monthly fee is paid.</p><div class="ov-k">${st.passThreshold}+ pays 100%</div></div>
        <div class="ov-arr" aria-hidden="true"></div>
        <div class="ov-step"><div class="ov-n">5</div><div class="ov-st">Act</div><p>Failures trigger a fix, repeated failure escalates, sustained excellence is rewarded.</p><div class="ov-k">Dashboard tab</div></div>
      </div>
      <div class="ov-notes">
        <div class="ov-note n1"><b>Once a year.</b> Cuts, set-outs, passes and repairs are checked against the range declared at tender (Bands tab).</div>
        <div class="ov-note n2"><b>Always.</b> ${nCrit} critical safety and compliance standards trigger a rectification plan whatever the score.</div>
        <div class="ov-note n3"><b>Relief.</b> Months or KPIs affected by TAU decisions, closures or declared extreme weather are not assessed.</div>
      </div></div>

    <div class="card"><h2>How one KPI is scored</h2><p class="muted small">Every service area has one KPI. Two kinds of evidence feed it.</p>
      <div class="ov-kpi">
        <div class="ov-src"><div class="label">At every event</div><b>Readiness sign-off</b><p>${nEv} standards are checked jointly before kick-off. Each KPI starts each event at 100 and loses ${st.eventPoints} for every standard that fails. A problem fixed before kick-off still counts.</p>
          <div class="ov-mini"><span>Event 1: <b>80</b></span><span>Event 2: <b>100</b></span><span>Average: <b>90</b></span></div></div>
        <div class="ov-op" aria-hidden="true">−</div>
        <div class="ov-src"><div class="label">During the month</div><b>Confirmed deductions</b><p>Incidents and audit breaches cost ${c.categories.B} points each; late or incomplete items cost ${c.categories.D}. No single standard can cost more than ${st.capPerStandard} points in a month.</p>
          <div class="ov-mini"><span>Late report: <b>5</b></span></div></div>
        <div class="ov-op" aria-hidden="true">=</div>
        <div class="ov-src ov-res"><div class="label">KPI result</div><b class="ov-big">85</b><p>Pass mark ${st.passThreshold}. With no event in the month the KPI starts at ${st.noEventScore}.</p></div>
      </div></div>

    <div class="card"><h2>Which service areas count most</h2><p class="muted small">Average weight of each KPI over the contract year. Weights are set month by month in Setup (each month totals 100%), so seasonal work such as renovations only counts in the months it is planned. Usage Cameras are reported, not scored.</p>
      <div class="ov-weights">${weightBars}</div></div>

    <div class="grid">
      <div class="card"><h2>How the score sets the fee</h2><p class="muted small">At ${st.passThreshold} or above the full fee is paid. Below ${st.passThreshold} the fee drops ${pc(st.abatementPerPoint)} for each full point, but never by more than ${pc(st.abatementCap)}.</p>${feeSvg}</div>
      <div class="card"><h2>What happens when performance slips</h2><p class="muted small">Each step up the ladder is more serious. Nine months at ${st.incentiveScore} or above, with improving turf condition, releases an incentive instead.</p>${escSvg}</div>
    </div>

    <div class="card"><h2>Quantities are settled once a year</h2><p class="muted small">For mowing, line marking, goal post changeovers, peaking programmes, repairs, treatments and event attendance, the contractor declares a minimum and maximum at tender. Cutting more because of growth or weather is the contractor's risk; extra work TAU causes is paid.</p>${bandSvg}</div>

    ${example}

    <div class="card"><h2>The monthly routine</h2>
      <ol class="ov-cycle">
        <li><b>Before each event</b><span>Contractor and the Principal's Representative complete the readiness sign-off (Events tab).</span></li>
        <li><b>During the month</b><span>Incidents, audit breaches and late items are logged and confirmed (Monthly tab).</span></li>
        <li><b>By the 5th working day</b><span>Contractor submits the monthly report; set the last month reported in Setup.</span></li>
        <li><b>Within 5 working days</b><span>The Principal's Representative verifies, applies any relief and certifies the fee (Dashboard, Save as PDF).</span></li>
        <li><b>Once a year</b><span>Bands reconciled, incentive tested, weightings and targets reviewed in time for the 30 September budget reports.</span></li>
      </ol></div>`;
  }

  /* ---------- setup ---------- */
  function vSetup() {
    const c = cfg(), d = yd(), st = c.settings, y = yearObj();
    const num = (k, label, step = 1, pct) => `<label class="field">${label}<input type="number" step="${step}" data-setv="${k}" data-pct="${pct ? 1 : ''}" value="${pct ? +(st[k] * 100).toFixed(2) : st[k]}"></label>`;
    const wTot = M.kpis.reduce((a, k) => a + (c.weights[k.id] || 0), 0);
    return `
    <div class="head"><h1>Setup</h1></div>
    <div class="card"><h2>Contractor</h2><div class="row" style="margin-top:10px">${S.contractors.map((s, i) => `<input type="text" data-con="${i}" value="${esc(s)}" aria-label="Contractor ${i + 1}">`).join('')}
      <button class="btn" data-act="addContractor">Add contractor</button></div>
      <p class="muted small">${esc(SAMPLE.contractor)} is the sample contractor. Rename it to the appointed contractor before recording real results.</p></div>
    <div class="card"><h2>${esc(y.name)} reporting</h2><div class="kv" style="margin-top:10px">
      <label class="field">Year name<input type="text" data-yname value="${esc(y.name)}"></label>
      <label class="field">First month of the contract year<input type="month" data-ystart value="${(() => { const [mm, yy] = y.months[0].split('-'); return yy + '-' + String(MN.indexOf(mm) + 1).padStart(2, '0'); })()}"></label>
      <label class="field">Last month reported<select data-last><option value="">All months</option>${y.months.map(m => `<option ${m === d.lastReported ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label class="row small"><input type="checkbox" data-trends ${d.trendsImproving ? 'checked' : ''}> Condition trends improving (manual check for the incentive)</label></div>
      <p class="muted small">Months after the last month reported are left blank, so they do not score ${st.noEventScore} by default or count towards the incentive.</p>
      <div class="row"><button class="btn" data-act="addYear">Add next contract year</button></div></div>
    <div class="card"><h2>Fee and score settings (Part D)</h2><div class="kv" style="margin-top:10px">
      ${num('monthlyFee', 'Monthly performance fee (NZD)', 100)}${num('passThreshold', 'Pass threshold')}${num('abatementPerPoint', 'Abatement per point (%)', 0.1, 1)}${num('abatementCap', 'Abatement cap (%)', 1, 1)}
      ${num('incentiveScore', 'Incentive score')}${num('incentiveMonths', 'Incentive months')}${num('rectificationMonths', 'Consecutive months below before a plan')}</div></div>
    <div class="card"><h2>Scoring settings (Part C)</h2><div class="kv" style="margin-top:10px">
      ${num('eventPoints', 'Points per failed event standard (A)')}${num('capPerStandard', 'Cap per standard per month')}${num('noEventScore', 'Score for a month with no event')}${num('creditShare', 'Band credit share when all standards met (%)', 5, 1)}
      ${Object.entries(M.categories).filter(([k]) => k !== 'A').sort().map(([k, v]) => `<label class="field">Category ${k}: ${esc(v.name)}<input type="number" step="1" data-cat="${k}" value="${c.categories[k]}"></label>`).join('')}</div></div>
    <div class="card"><h2>KPI weightings by month (Part B)</h2><p class="muted small">Each KPI's weight in each month, in %. A KPI at 0% is not scored that month. Each month should total 100%; if it does not, the score uses the weights entered as shares of their total.</p><div class="tablebox"><table class="t"><thead><tr><th>KPI</th>${y.months.map(m => `<th class="num">${m.replace('-20', ' ')}</th>`).join('')}<th class="num">Pass</th></tr></thead><tbody>
      ${M.kpis.map(k => `<tr><td><span class="pill-k">${k.id}</span></td>${y.months.map((m, i) => `<td><input type="number" step="0.1" min="0" style="width:58px" data-mw="${k.id}|${i}" value="${+((c.mweights[k.id][i] || 0) * 100).toFixed(2)}"></td>`).join('')}<td><input type="number" step="1" style="width:52px" data-p="${k.id}" value="${c.pass[k.id]}"></td></tr>`).join('')}
      <tr class="sub"><td>Total</td>${y.months.map((m, i) => { const t = M.kpis.reduce((a, k) => a + (c.mweights[k.id][i] || 0), 0); return `<td class="num">${pc(t)}${Math.abs(t - 1) > 1e-6 ? ' <span class="warn-note">≠100%</span>' : ''}</td>`; }).join('')}<td></td></tr></tbody></table></div>
      <div class="row" style="margin-top:10px"><button class="btn" data-act="resetSettings">Restore model settings</button></div></div>
    <div class="card"><h2>Data</h2><p class="muted small">Results are saved in this browser only and are not uploaded to Netlify. Export a backup file to share with a colleague or move to another computer, then import it there.</p>
      <div class="row"><button class="btn primary" data-act="exportXlsx">Export to Excel</button><button class="btn" data-act="exportJson">Export backup (JSON)</button>
      <button class="btn" data-act="importJson">Import backup</button><input id="importFile" type="file" accept=".json" hidden>
      <button class="btn danger" data-act="reset">Clear all data</button></div></div>
    <div class="card"><h2>Sample data</h2><p class="muted small">Fill ${esc(SAMPLE.contractor)} with illustrative events, deductions and band rates for July to October 2026 to see how the dashboard, charts and PDF report work. This replaces any results saved in this browser.</p>
      <div class="row"><button class="btn" data-act="sample">Load sample data</button></div></div>`;
  }

  /* ---------- PDF ---------- */
  async function chartImages() {
    const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-10000px;top:0;width:640px';
    const mk = () => { const c = document.createElement('canvas'); c.width = 640; c.height = 270; c.style.cssText = 'width:640px;height:270px'; box.appendChild(c); return c; };
    const cv = { score: mk(), fee: mk() }; document.body.appendChild(box);
    const made = drawCharts(cv, true); await new Promise(r => setTimeout(r, 60));
    const white = c => { const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; const x = o.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, o.width, o.height); x.drawImage(c, 0, 0); return o.toDataURL('image/png'); };
    const imgs = { score: white(cv.score), fee: white(cv.fee) }; made.forEach(c => c.destroy()); box.remove(); return imgs;
  }
  async function savePdf(btn) {
    if (!window.jspdf || !window.Chart) return toast('PDF library not loaded. Check your connection and try again.');
    btn.disabled = true; const old = btn.textContent; btn.textContent = 'Preparing...';
    try {
      const { jsPDF } = window.jspdf, c = cfg(), d = yd(), Y = C.year(c, d, months()), m = Y.months.find(x => x.month === S.ui.month) || Y.months[0], st = c.settings;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), mg = 14;
      const teal = [28, 106, 100], ink = [23, 36, 34], muted = [90, 104, 102], line = [213, 223, 221], red = [179, 65, 47], green = [46, 125, 79];
      const stamp = new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' });
      doc.setFillColor(...teal); doc.rect(0, 0, W, 4, 'F');
      doc.setTextColor(...muted); doc.setFontSize(9); doc.text('TATAKI AUCKLAND UNLIMITED · STADIUMS MAINTENANCE PERFORMANCE MODEL', mg, 13);
      doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text('Monthly Performance Report', mg, 22);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...muted); doc.text(`${S.ui.contractor} · ${yearObj().name} · ${m.month}${S.sample ? ' · SAMPLE DATA' : ''}`, mg, 29);
      const tiles = [['Overall score', m.overall == null ? '–' : f1(m.overall), m.overall == null ? 'Not reported' : m.below ? `Below threshold ${st.passThreshold}` : `Pass (threshold ${st.passThreshold})`, m.below ? red : teal],
        ['Fee paid', m.feePct == null ? '–' : pc(m.feePct), m.fee == null ? '' : `${money(m.feePaid)} of ${money(m.fee)}`, ink],
        ['Abatement', money(m.abatement), `Year to date ${money(Y.abatement)}`, m.abatement ? red : ink],
        ['Rectification plan', m.reported ? (m.rectification ? 'Required' : 'Not required') : '–', `Event failure ${m.eventFailure ? 'Yes' : 'No'} · Critical ${m.critical.length ? 'Yes' : 'No'}`, m.rectification ? red : green],
        ['Year to date score', f1(Y.average), `${Y.reported} months · ${Y.monthsBelow} below ${st.passThreshold}`, ink]];
      const tw = (W - 2 * mg - 16) / 5, ty = 34;
      tiles.forEach(([lab, val, sub, col], i) => { const x = mg + i * (tw + 4);
        doc.setDrawColor(...line); doc.setFillColor(255, 255, 255); doc.roundedRect(x, ty, tw, 26, 2, 2, 'FD');
        doc.setFontSize(7.5); doc.setTextColor(...muted); doc.text(lab.toUpperCase(), x + 3.5, ty + 6);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...col); doc.text(String(val), x + 3.5, ty + 15);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...ink); doc.text(doc.splitTextToSize(sub, tw - 7).slice(0, 2), x + 3.5, ty + 21); });
      const img = await chartImages(); const cw = (W - 2 * mg - 6) / 2, ch = cw * 270 / 640, cy = 70;
      [['Overall score by month', img.score], ['Fee paid and abatement by month', img.fee]].forEach(([t, im], i) => { const x = mg + i * (cw + 6);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...ink); doc.text(t, x, cy); doc.setFont('helvetica', 'normal'); doc.addImage(im, 'PNG', x, cy + 2, cw, ch); });
      const kpiStatus = r => r.result == null ? (m.reported ? (r.notAssessed ? 'Not assessed' : r.offMonth ? 'Not scored this month' : '–') : 'Not reported') : r.below ? 'Below' : 'Pass';
      doc.addPage(); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...ink); doc.text(`KPI results · ${m.month}`, mg, 16);
      doc.autoTable({ startY: 20, margin: { left: mg, right: mg }, theme: 'grid',
        head: [['KPI', 'Name', 'Weight', 'Event score', 'Deductions', 'Result', 'Status', 'Year avg', 'Months below']],
        body: M.kpis.map(k => { const r = m.kpi[k.id], a = Y.kpiAvg[k.id]; return [k.id, k.name, pc(m.weights[k.id]), r.events ? f1(r.mean) : 'no event', r.ded || 0, f1(r.result), kpiStatus(r), f1(a.avg), a.below]; }),
        styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: line, textColor: ink }, headStyles: { fillColor: teal, textColor: 255 },
        didParseCell: x => { if (x.section === 'body' && x.column.index === 6) x.cell.styles.textColor = x.cell.raw === 'Below' ? red : x.cell.raw === 'Pass' ? green : muted; } });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('KPI results by month', mg, doc.lastAutoTable.finalY + 10);
      doc.autoTable({ startY: doc.lastAutoTable.finalY + 13, margin: { left: mg, right: mg }, theme: 'grid',
        head: [['KPI'].concat(Y.months.map(x => x.month.replace('-20', ' ')))],
        body: M.kpis.map(k => [k.id].concat(Y.months.map(x => x.kpi[k.id].result == null ? '' : f0(x.kpi[k.id].result)))).concat([['Overall'].concat(Y.months.map(x => x.overall == null ? '' : f1(x.overall)))]),
        styles: { fontSize: 8, cellPadding: 1.4, halign: 'center', lineColor: line, textColor: ink }, headStyles: { fillColor: teal, textColor: 255 }, columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
        didParseCell: x => { if (x.section === 'body' && x.column.index > 0 && x.cell.raw !== '') { const v = +x.cell.raw; const k = M.kpis[x.row.index]; const pass = k ? c.pass[k.id] : st.passThreshold; x.cell.styles.fillColor = v < pass ? [248, 210, 190] : [214, 238, 234]; } } });
      const fails = m.failures.map(f => [f.event.date, f.event.name, `${f.ref} ${f.s.name}${f.s.critical ? ' (critical)' : ''}`, f.note || '']);
      const deds = (d.deductions || []).filter(x => x.month === m.month).map(x => [x.ref + ' ' + ((C.STD[x.ref] || {}).name || ''), x.count, x.confirmed ? x.count * C.points(c, x.ref) : 'not confirmed', x.note || '']);
      doc.addPage(); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(`Event failures · ${m.month}`, mg, 16);
      doc.autoTable({ startY: 20, margin: { left: mg, right: mg }, theme: 'grid', head: [['Date', 'Event', 'Standard', 'Note']], body: fails.length ? fails : [['', 'No failed event standards this month', '', '']],
        styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: line, textColor: ink }, headStyles: { fillColor: teal, textColor: 255 } });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(`Monthly deductions · ${m.month}`, mg, doc.lastAutoTable.finalY + 10);
      doc.autoTable({ startY: doc.lastAutoTable.finalY + 13, margin: { left: mg, right: mg }, theme: 'grid', head: [['Standard', 'Count', 'Points', 'Note']], body: deds.length ? deds : [['No deductions logged this month', '', '', '']],
        styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: line, textColor: ink }, headStyles: { fillColor: teal, textColor: 255 } });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('Escalation and incentive (Part F), year to date', mg, doc.lastAutoTable.finalY + 10);
      doc.autoTable({ startY: doc.lastAutoTable.finalY + 13, margin: { left: mg, right: W / 2 }, theme: 'grid', body: [
        ['Months below threshold', Y.monthsBelow], ['Three months below in any rolling six?', Y.threeInSix ? 'Yes' : 'No'], ['Six months below in any twelve?', Y.sixInTwelve ? 'Yes' : 'No'],
        ['Months with a critical failure', Y.criticalMonths], ['Months at or above ' + st.incentiveScore, Y.atIncentive], ['Incentive pool released?', Y.incentive ? 'Yes' : 'No'], ['Abatements withheld', money(Y.abatement)]],
        styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: line, textColor: ink }, columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } } });
      const n = doc.getNumberOfPages();
      for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(...muted);
        doc.text(`Stadium Performance Model · ${S.ui.contractor} · ${m.month} · produced ${stamp}${S.sample ? ' · sample data, not real results' : ''}`, mg, H - 7); doc.text(`Page ${i} of ${n}`, W - mg, H - 7, { align: 'right' }); }
      doc.save(`Stadium Performance Report - ${S.ui.contractor} - ${m.month}.pdf`); toast('PDF saved');
    } catch (e) { console.error(e); toast('Could not create the PDF'); }
    finally { btn.disabled = false; btn.textContent = old; }
  }

  /* ---------- Excel export ---------- */
  function exportXlsx() {
    if (!window.XLSX) return toast('Excel library not loaded');
    const c = cfg(), wb = XLSX.utils.book_new();
    S.contractors.forEach(con => S.years.forEach(y => {
      const d = ((S.data[con] || {})[y.id]) || emptyData(), Y = C.year(c, d, y.months);
      const tag = `${con} ${y.id}`.slice(0, 22);
      const sum = [[`${con} · ${y.name} · Stadium Performance Model`], [], ['Month', 'Overall score', 'Fee paid %', 'Fee paid', 'Abatement', 'Below threshold', 'Event failure', 'Critical failure', 'Rectification plan'].concat(M.kpis.map(k => k.id))];
      Y.months.forEach(m => sum.push([m.month, m.overall, m.feePct, m.feePaid, m.abatement, m.below ? 'Yes' : '', m.eventFailure ? 'Yes' : '', m.critical.length ? 'Yes' : '', m.rectification ? 'Yes' : ''].concat(M.kpis.map(k => m.kpi[k.id].result))));
      sum.push([], ['Year to date score', Y.average], ['Fee paid', Y.feePaid], ['Abatements', Y.abatement], ['Months below threshold', Y.monthsBelow], ['Three in any six', Y.threeInSix ? 'Yes' : 'No'], ['Incentive released', Y.incentive ? 'Yes' : 'No']);
      const ws1 = XLSX.utils.aoa_to_sheet(sum); ws1['!cols'] = [{ wch: 14 }].concat(Array(30).fill({ wch: 11 })); XLSX.utils.book_append_sheet(wb, ws1, `${tag} Summary`.slice(0, 31));
      const ev = [['Event date', 'Month', 'Event', 'Tier', 'First after renovation', 'Standard', 'KPI', 'Result', 'Note']];
      (d.events || []).forEach(e => Object.entries(e.results || {}).forEach(([ref, r]) => ev.push([e.date, e.month, e.name, e.tier, e.firstAfterRenovation ? 'Yes' : '', ref, (C.STD[ref] || {}).kpi, r.r === 'fail' ? 'Fail' : 'Pass', r.note || ''])));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ev), `${tag} Events`.slice(0, 31));
      const de = [['Month', 'Standard', 'KPI', 'Category', 'Count', 'Confirmed', 'Points', 'Note']];
      (d.deductions || []).forEach(x => de.push([x.month, x.ref, (C.STD[x.ref] || {}).kpi, (C.STD[x.ref] || {}).cat, x.count, x.confirmed ? 'Yes' : 'No', x.confirmed ? x.count * C.points(c, x.ref) : 0, x.note || '']));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(de), `${tag} Deductions`.slice(0, 31));
      const bd = [['Band', 'Item', 'Unit', 'Lump sum', 'Min', 'Max', 'Rate', 'Credit', 'Logged', 'TAU-caused', 'All met', 'Extra', 'Credit to TAU', 'Net']];
      M.bands.forEach(b => { const v = (d.bands || {})[b.id] || {}, r = C.band(c, v); bd.push([b.ts + ' ' + b.band, b.item, b.unit, v.lump, v.min, v.max, v.rate, v.credit, v.logged, v.principal, v.allMet ? 'Yes' : 'No', r.extra, r.credit, r.net]); });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bd), `${tag} Bands`.slice(0, 31));
    }));
    XLSX.writeFile(wb, `Stadium Performance Model - ${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

  /* ---------- help and user manual ---------- */
  const HELP_EMAIL = 'stu@greenspaceconsulting.co.nz';
  function helpSections() {
    const c = cfg(), st = c.settings, cat = k => c.categories[k];
    const mw = k => { const a = (c.mweights[k] || []).map((v, i) => [months()[i], v]); return a; };
    const onMonths = k => mw(k).filter(([, v]) => v > 0.031).map(([m]) => m.split('-')[0]).join(', ');
    return [
      { id: 'start', title: 'Getting started', body: `
        <p>This app scores the stadium maintenance contractor each month under Schedule 1 (the Performance Model). It follows the Performance Model Calculation Sheet V4 and the Stadiums Maintenance Technical Specification (21 November 2026), so the numbers match the Excel workbook.</p>
        <ol><li>Choose the <b>contractor</b>, <b>contract year</b> and <b>month</b> in the top bar. The month list only shows on the Dashboard and Monthly tabs.</li>
        <li>Record each event in <b>Events</b> and mark every event-scored standard Pass or Fail.</li>
        <li>Log incidents, audit breaches, late items and monthly measured standards in <b>Monthly</b>, and tick <b>Confirmed</b> once the Principal's Representative agrees.</li>
        <li>Check the result on the <b>Dashboard</b> and save the monthly report with <b>Save as PDF</b>.</li>
        <li>At year end, complete the <b>Bands</b> reconciliation.</li></ol>
        <p>The first time you open the app it shows sample data for FieldTurf NZ (July to October 2026) so the screens are not empty. Clear it or rename the contractor in <b>Setup</b> before recording real results.</p>` },
      { id: 'data', title: 'Where your data is kept', body: `
        <p>Results are saved in <b>this browser on this computer only</b>. Nothing is uploaded to the website, and other people cannot see your entries.</p>
        <ul><li>To share results or move to another computer, use <b>Setup &gt; Export backup (JSON)</b>, send the file, then <b>Import backup</b> on the other computer. Importing replaces what is in that browser.</li>
        <li>Export a backup at the end of each month. Clearing browser data, or using a private window, removes saved results.</li>
        <li><b>Export to Excel</b> gives a workbook of the year's results for filing or checking against the Calculation Sheet.</li></ul>` },
      { id: 'monthly-steps', title: 'The monthly routine', body: `
        <ol><li><b>During the month:</b> after each event, open it in Events, mark the readiness sign-off scorecard and record the person signing off.</li>
        <li><b>Month end:</b> enter confirmed deductions in Monthly. Only rows ticked Confirmed count.</li>
        <li>Tick <b>Not assessed</b> for any KPI covered by Part F relief (for example the field closed by TAU, a declared extreme weather event or a failed TAU asset) and record the reason.</li>
        <li>In Setup, set <b>Last month reported</b> to this month so later months stay blank.</li>
        <li>Review the Dashboard: overall score, fee paid, rectification test and escalation tests.</li>
        <li>Save the PDF report and export a backup.</li></ol>` },
      { id: 'dashboard', title: 'Dashboard', body: `
        <p>The Dashboard summarises the month chosen in the top bar and the year to date.</p>
        <dl><dt>Overall score</dt><dd>The weighted score for the month, out of 100.</dd>
        <dt>Fee paid and abatement</dt><dd>The share of the monthly performance fee paid, and the amount withheld.</dd>
        <dt>Rectification plan</dt><dd>Shows when a plan is required: any event failure, any critical standard failure, or ${st.rectificationMonths} consecutive months below ${st.passThreshold}.</dd>
        <dt>KPI results table</dt><dd>One row per KPI: its weight this month, result, status, event score, deductions, year average, months below and failed event standards this year.</dd>
        <dt>KPI results by month</dt><dd>A heat map of every KPI for every month. Orange is below the pass mark, teal is towards 100. Blank means not reported or not assessed; a dash means the KPI has 0% weight that month.</dd>
        <dt>Escalation and incentive</dt><dd>The Part F tests for the year: months below the threshold, three in any six, six in any twelve, critical months and incentive progress.</dd></dl>` },
      { id: 'events', title: 'Events and readiness sign-off', body: `
        <p><b>Add event</b>, enter the date, name and tier, then mark each standard Pass or Fail. To change an existing event, click its name in the events list: the page moves down to its scorecard, where you can change any Pass or Fail (or Clear it). <b>Back to event list</b> returns to the top.</p><p> A failed standard asks for a reading or observation (for example a photo reference).</p>
        <ul><li>Each KPI with event-scored standards starts at 100 at every event and loses ${st.eventPoints} points per failed standard (not below 0).</li>
        <li>The KPI columns in the events list (M, L, I, G and so on) show each KPI's event score. Hover over a heading for the full KPI name.</li>
        <li><b>Mark unchecked as pass</b> fills in every standard you have not marked yet.</li>
        <li>KPI-V Renovation is scored only at the <b>first event after renovation</b>; tick that box on the event.</li>
        <li>A standard fixed before kick-off still records the fail.</li></ul>` },
      { id: 'deductions', title: 'Monthly deductions and relief', body: `
        <p>Use <b>Add deduction</b> for each confirmed item: choose the standard, the count and tick Confirmed by the Principal's Representative.</p>
        <dl><dt>Category B Breach (${cat('B')} points each)</dt><dd>Incidents, audit breaches, items missed or not corrected, and monthly measured standards outside target and tolerance.</dd>
        <dt>Category D Timeliness and records (${cat('D')} points each)</dt><dd>Late responses, repairs or quotes, missed test rounds, late or incomplete records.</dd>
        <dt>Category G Report only (${cat('G')} points)</dt><dd>KPI-U Usage Cameras: logged and reported, not scored. U1.7 and U1.9 are still critical, so a confirmed breach still triggers a rectification plan.</dd></dl>
        <p>Deductions for one standard are capped at ${st.capPerStandard} points a month.</p>
        <p>In the KPI results table, <b>Events</b> is the number of events scored, <b>Mean event score</b> is their average (${st.noEventScore} when there is no event), <b>Deductions</b> is the confirmed points taken off, and <b>Result</b> is the mean less deductions.</p>` },
      { id: 'weights', title: 'KPI weightings by month', body: `
        <p>Not every activity happens every month, so each KPI has a weight for each month (Setup, KPI weightings by month). The overall score uses that month's weights. Each month should total 100%.</p>
        <ul><li><b>KPI-V Renovation:</b> counts in ${onMonths('KPI-V') || 'the renovation months'} only.</li>
        <li><b>KPI-GD Gardens:</b> higher weight in ${onMonths('KPI-GD')} (the main garden rounds), a lower weight in other months.</li>
        <li><b>KPI-HS Hard Surfaces:</b> higher weight in ${onMonths('KPI-HS')} (the main hard surface rounds), a lower weight in other months.</li>
        <li>The other turf KPIs share the rest of each month in proportion to their base weights.</li></ul>
        <p>A KPI with 0% weight in a month shows <b>Not scored this month</b> and does not affect the score. Change weights in Setup; <b>Restore model settings</b> returns to the V4 weights.</p>` },
      { id: 'scoring', title: 'How the score and fee are worked out', body: `
        <ol><li><b>Event score</b> for each KPI at each event: 100 less ${st.eventPoints} per failed standard.</li>
        <li><b>KPI result</b> for the month: average event score (${st.noEventScore} with no event) less confirmed deductions, capped at ${st.capPerStandard} points per standard.</li>
        <li><b>Overall score:</b> KPI results multiplied by this month's weights, divided by the weights of the KPIs assessed (relief moves a KPI's weight to the others).</li>
        <li><b>Fee:</b> ${st.passThreshold} or above pays 100%. Below ${st.passThreshold} the fee reduces ${pc(st.abatementPerPoint)} per full point, capped at ${pc(st.abatementCap)}.</li></ol>
        <p><b>Example:</b> an overall score of 87.0 is 3 full points below ${st.passThreshold}, so ${pc(1 - 3 * st.abatementPerPoint)} of the ${money(st.monthlyFee)} fee is paid and ${money(3 * st.abatementPerPoint * st.monthlyFee)} is withheld.</p>` },
      { id: 'status', title: 'What the status labels mean', body: `
        <dl><dt>Pass</dt><dd>The KPI result is at or above that KPI's pass mark.</dd>
        <dt>Below (number)</dt><dd>The result is below the KPI's pass mark shown.</dd>
        <dt>Not scored this month</dt><dd>The KPI has 0% weight this month, so it is not scored.</dd>
        <dt>Not assessed</dt><dd>Part F relief was ticked for this KPI this month.</dd>
        <dt>Not reported</dt><dd>The month is after the last month reported (Setup).</dd>
        <dt>CRITICAL</dt><dd>A critical standard: any confirmed failure needs a rectification plan whatever the score.</dd></dl>` },
      { id: 'escalation', title: 'Rectification, escalation and incentive', body: `
        <ul><li><b>Rectification plan</b> within 5 working days: any event failure, any critical failure, or ${st.rectificationMonths} consecutive months below ${st.passThreshold}.</li>
        <li><b>Formal performance review:</b> three months below ${st.passThreshold} in any six.</li>
        <li><b>Notice of default:</b> six months below ${st.passThreshold} in any twelve, or a failed rectification plan.</li>
        <li><b>Incentive:</b> ${st.incentiveMonths} or more months at ${st.incentiveScore} or above, with condition trends improving (tick this in Setup), releases the incentive pool.</li></ul>
        <p>The full ladder is in the Model tab (Part F).</p>` },
      { id: 'bands', title: 'Annual band reconciliation', body: `
        <p>For each band line, enter the tendered lump sum, minimum and maximum quantities, the rate above the maximum and the credit below the minimum, then the quantity logged for the year and the units above the maximum that TAU caused.</p>
        <ul><li>Units above the maximum are paid only where TAU caused them (the lesser of the two).</li>
        <li>Units below the minimum earn the Principal a credit, reduced to ${pc(st.creditShare)} when <b>All met</b> is ticked.</li></ul>` },
      { id: 'model', title: 'Model and Model overview tabs', body: `
        <p><b>Model</b> lists the KPIs, scoring categories, score to fee table, escalation ladder and all ${M.standards.length} performance standards with their targets and how they are measured. Use the filter and search to find a standard.</p>
        <p><b>Model overview</b> explains the model in pictures: how a month is scored, the weightings and the escalation steps. It is useful for briefing new staff.</p>` },
      { id: 'setup', title: 'Setup', body: `
        <ul><li><b>Contractor:</b> rename the sample contractor or add another.</li>
        <li><b>Reporting:</b> year name, first month, last month reported and the condition trends tick for the incentive.</li>
        <li><b>Fee, score and scoring settings:</b> monthly fee, pass threshold, abatement, incentive, points and caps.</li>
        <li><b>KPI weightings by month</b> and each KPI's pass mark.</li>
        <li><b>Data:</b> export to Excel, export and import backups, clear all data, load sample data.</li></ul>
        <p>Settings changed here apply only in this browser. When the model is updated, saved weightings reset once to the new model and a notice explains this; events, deductions and bands are kept.</p>` },
      { id: 'faq', title: 'Common questions', body: `
        <dl><dt>Why does a KPI show 100 when nothing happened?</dt><dd>With no event in a month the event score starts at ${st.noEventScore}; only confirmed deductions reduce it.</dd>
        <dt>Why is the month blank?</dt><dd>It is after the last month reported. Change it in Setup.</dd>
        <dt>My deduction is not counting.</dt><dd>Tick Confirmed by PR, check the month in the top bar, and remember the ${st.capPerStandard}-point cap per standard.</dd>
        <dt>A colleague cannot see my results.</dt><dd>Results stay in your browser. Send them a backup file (Setup &gt; Export backup).</dd>
        <dt>Does the app match the Excel Calculation Sheet?</dt><dd>Yes, it uses the same rules and weights as Calculation Sheet V4. Export to Excel to compare.</dd>
        <dt>How do I print the manual?</dt><dd>Use the Print manual button at the top of this page.</dd></dl>` }
    ];
  }
  const helpText = h => (h.title + ' ' + h.body.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  function helpMatches(q) {
    const words = q.toLowerCase().split(/[^a-z0-9-]+/).filter(w => w.length > 2 && !['the', 'and', 'what', 'how', 'why', 'does', 'can', 'for', 'this', 'that', 'with', 'are', 'not', 'when', 'where', 'which', 'who', 'you', 'our', 'have', 'from', 'there', 'will', 'should', 'would'].includes(w));
    if (!words.length) return [];
    return helpSections().map(h => { const t = helpText(h).toLowerCase(); const sc = words.reduce((a, w) => a + (t.split(w).length - 1) + (h.title.toLowerCase().includes(w) ? 3 : 0), 0);
      let snip = ''; const w = words.find(w => t.includes(w)); if (w) { const full = helpText(h), i = full.toLowerCase().indexOf(w); snip = (i > 60 ? '… ' : '') + full.slice(Math.max(0, i - 60), i + 120) + ' …'; }
      return { h, sc, snip, words }; }).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 4);
  }
  function renderHits(q) {
    const box = $('#helpHits'); if (!box) return;
    const hits = helpMatches(q);
    const mark = (txt, words) => words.reduce((a, w) => a.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'), esc(txt));
    box.innerHTML = !q.trim() ? '' : hits.length ? `<div class="small muted">These parts of the manual may answer your question:</div>${hits.map(x => `<a href="#help" data-helpgo="${x.h.id}"><b>${esc(x.h.title)}</b><div class="small">${mark(x.snip, x.words)}</div></a>`).join('')}`
      : '<div class="small muted">No matching section in the manual. Send the question below.</div>';
  }
  function vHelp() {
    const secs = helpSections();
    return `
    <div class="head"><div><div class="label">User manual</div><h1>Help</h1></div><div class="row"><button class="btn" data-act="print">Print manual</button></div></div>
    <div class="card help-ask" id="ask"><h2>Ask a question</h2>
      <p class="muted small">Type your question. Matching parts of the manual appear as you type. If they do not answer it, send it to Greenspace Consulting and you will get a reply by email.</p>
      <textarea id="helpQ" placeholder="For example: why is KPI-V not scored in October?" aria-label="Your question"></textarea>
      <div id="helpHits" class="help-hits" aria-live="polite"></div>
      <div class="kv"><label class="field">Your name<input type="text" id="helpName" autocomplete="name"></label><label class="field">Your email (for the reply)<input type="email" id="helpEmail" autocomplete="email"></label></div>
      <div class="row"><button class="btn primary" data-act="sendQ">Send question</button><span class="muted small">Sent with the page you were on and the month selected, to help answer it.</span></div></div>
    <div class="help-grid">
      <nav class="card help-toc" aria-label="Manual contents"><div class="label">Contents</div>${secs.map(h => `<a href="#help" data-helpgo="${h.id}">${esc(h.title)}</a>`).join('')}<a href="#help" data-helpgo="ask">Ask a question</a></nav>
      <div>${secs.map(h => `<section class="card help-sec" id="help-${h.id}"><h2>${esc(h.title)}</h2>${h.body}</section>`).join('')}</div>
    </div>`;
  }
  let lastView = 'dashboard';
  async function sendQuestion(btn) {
    const q = ($('#helpQ').value || '').trim(), name = ($('#helpName').value || '').trim(), email = ($('#helpEmail').value || '').trim();
    if (!q) { toast('Type your question first'); $('#helpQ').focus(); return; }
    const ctx = `Page: ${lastView} · Contractor: ${S.ui.contractor} · Year: ${yearObj().name} · Month: ${S.ui.month} · App: ${M.version}`;
    const body = new URLSearchParams({ 'form-name': 'app-question', 'bot-field': '', name, email, question: q, context: ctx });
    btn.disabled = true;
    try {
      const r = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
      if (!r.ok) throw new Error(r.status);
      $('#helpQ').value = ''; renderHits(''); toast('Question sent. Thank you.');
    } catch (e) {
      location.href = `mailto:${HELP_EMAIL}?subject=${encodeURIComponent('Stadium Performance Model question')}&body=${encodeURIComponent(q + '\n\n' + (name ? 'From: ' + name + (email ? ' <' + email + '>' : '') + '\n' : '') + ctx)}`;
      toast('Opening your email to send the question');
    } finally { btn.disabled = false; }
  }

  /* ---------- routing & events ---------- */
  const views = { dashboard: vDashboard, events: vEvents, deductions: vDeductions, bands: vBands, model: vModel, overview: vOverview, setup: vSetup, help: vHelp };
  function route(keepScroll) {
    const v = (location.hash || '#dashboard').slice(1), name = views[v] ? v : 'dashboard';
    document.querySelectorAll('.tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.view === name ? 'page' : 'false'));
    $('#monthSel').hidden = !(name === 'dashboard' || name === 'deductions');
    const y = window.scrollY; destroyCharts(); renderCtx();
    const note = modelNotice ? `<div class="card small" role="status"><div class="label">Model updated</div><p>${esc(modelNotice)}</p></div>` : '';
    modelNotice = '';
    $('#app').innerHTML = `<section class="view">${note}${views[name]()}</section>`;
    if (name === 'dashboard') charts = drawCharts();
    if (name !== 'help') lastView = name;
    if (keepScroll) window.scrollTo(0, y);
  }
  const toScorecard = () => { const el = document.getElementById('scorecard'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const curEvent = () => (yd().events || []).find(e => e.id === S.ui.event);
  const dirty = () => {};
  document.addEventListener('click', e => {
    const t = e.target.closest('button, a'); if (!t) return;
    if (t.dataset.event) { e.preventDefault(); S.ui.event = t.dataset.event; save(); route(); toScorecard(); return; }
    if ('pf' in t.dataset) { const ev = curEvent(), ref = t.closest('[data-ref]').dataset.ref; ev.results = ev.results || {};
      if (!t.dataset.pf) delete ev.results[ref]; else ev.results[ref] = { ...(ev.results[ref] || {}), r: t.dataset.pf };
      dirty(); save(); route(true); return; }
    if (t.dataset.helpgo) { e.preventDefault(); const el = document.getElementById(t.dataset.helpgo === 'ask' ? 'ask' : 'help-' + t.dataset.helpgo); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('help-flash'); setTimeout(() => el.classList.remove('help-flash'), 1500); } return; }
    const act = t.dataset.act; if (!act) return;
    const d = yd();
    if (act === 'toList') { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (act === 'print') window.print();
    if (act === 'pdf') savePdf(t);
    if (act === 'addEvent') { const ev = { id: uid('e'), date: '', month: '', name: '', tier: 'B', firstAfterRenovation: false, results: {} }; (d.events = d.events || []).push(ev); S.ui.event = ev.id; dirty(); save(); route(); toScorecard(); toast('Event added: enter its date and name'); }
    if (act === 'delEvent' && confirm('Delete this event and its scorecard?')) { d.events = d.events.filter(x => x.id !== S.ui.event); S.ui.event = null; save(); route(); }
    if (act === 'allPass') { const ev = curEvent(); M.standards.filter(s => s.event && (s.kpi !== 'KPI-V' || ev.firstAfterRenovation)).forEach(s => { if (!ev.results[s.ref]) ev.results[s.ref] = { r: 'pass', note: '' }; }); dirty(); save(); route(true); }
    if (act === 'addDed') { (d.deductions = d.deductions || []).push({ id: uid('d'), month: S.ui.month, ref: M.standards.find(s => s.cat).ref, count: 1, confirmed: false, note: '' }); dirty(); save(); route(true); }
    if (act === 'delDed') { const id = t.closest('[data-did]').dataset.did; d.deductions = d.deductions.filter(x => x.id !== id); save(); route(true); }
    if (act === 'sendQ') sendQuestion(t);
    if (act === 'exportXlsx') exportXlsx();
    if (act === 'exportJson') download(`stadium-performance-model-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(S, null, 1));
    if (act === 'importJson') $('#importFile').click();
    if (act === 'reset' && confirm('Clear all results and settings saved in this browser?')) { S = fresh(); S.sampleCleared = true; save(); route(); toast('Cleared'); }
    if (act === 'resetSettings' && confirm('Restore the model weightings and settings?')) { S.settings = { values: {}, weights: {}, mweights: {}, pass: {}, categories: {} }; save(); route(); }
    if (act === 'sample' && (!hasData() || confirm('Replace the results saved in this browser with sample data?'))) loadSample(true);
    if (act === 'addContractor') { S.contractors.push('New contractor'); save(); route(); }
    if (act === 'addYear') { const last = S.years[S.years.length - 1], n = S.years.length + 1;
      const ms = last.months.map(m => { const [mm, yy] = m.split('-'); return mm + '-' + (+yy + 1); });
      S.years.push(newYear('Y' + n, 'Year ' + n, ms)); S.ui.year = 'Y' + n; S.ui.month = ms[0]; save(); route(); toast(`Year ${n} added`); }
  });
  document.addEventListener('input', e => {
    const t = e.target, d = yd();
    if (t.id === 'helpQ') { renderHits(t.value); return; }
    if (t.matches('[data-evnote]')) { const ev = curEvent(), ref = t.closest('[data-ref]').dataset.ref; ev.results[ref].note = t.value; save(); }
    else if (t.matches('[data-ev="name"], [data-ev="signedBy"]')) { curEvent()[t.dataset.ev] = t.value; dirty(); save(); }
    else if (t.matches('[data-d="note"]')) { const x = d.deductions.find(x => x.id === t.closest('[data-did]').dataset.did); x.note = t.value; save(); }
    else if (t.matches('[data-nareason]')) { d.notAssessed[S.ui.month][t.dataset.nareason] = t.value; save(); }
    else if (t.matches('[data-con]')) { const i = +t.dataset.con, old = S.contractors[i]; S.contractors[i] = t.value; if (S.data[old]) { S.data[t.value] = S.data[old]; delete S.data[old]; } if (S.ui.contractor === old) S.ui.contractor = t.value; save(); renderCtx(); }
    else if (t.matches('[data-yname]')) { yearObj().name = t.value; save(); renderCtx(); }
  });
  document.addEventListener('change', e => {
    const t = e.target, d = yd(), num = v => v === '' ? '' : +v;
    if (t.id === 'contractorSel') { S.ui.contractor = t.value; S.ui.event = null; save(); route(); }
    else if (t.id === 'yearSel') { S.ui.year = t.value; S.ui.month = defaultMonth(); S.ui.event = null; save(); route(); }
    else if (t.id === 'monthSel') { S.ui.month = t.value; save(); route(); }
    else if (t.matches('[data-ev="date"]')) { const ev = curEvent(); ev.date = t.value; ev.month = monthOf(t.value); dirty(); save(); route(true); }
    else if (t.matches('[data-ev="tier"]')) { curEvent().tier = t.value; save(); }
    else if (t.matches('[data-ev="firstAfterRenovation"]')) { curEvent().firstAfterRenovation = t.checked; dirty(); save(); route(true); }
    else if (t.matches('[data-d]') && t.dataset.d !== 'note') { const x = d.deductions.find(x => x.id === t.closest('[data-did]').dataset.did);
      if (t.dataset.d === 'confirmed') x.confirmed = t.checked; else if (t.dataset.d === 'count') x.count = num(t.value); else x.ref = t.value; dirty(); save(); route(true); }
    else if (t.matches('[data-na]')) { d.notAssessed = d.notAssessed || {}; const mo = (d.notAssessed[S.ui.month] = d.notAssessed[S.ui.month] || {});
      if (t.checked) mo[t.dataset.na] = ''; else delete mo[t.dataset.na]; dirty(); save(); route(true); }
    else if (t.matches('[data-band]')) { d.bands = d.bands || {}; const b = (d.bands[t.dataset.band] = d.bands[t.dataset.band] || {});
      b[t.dataset.bf] = t.type === 'checkbox' ? t.checked : num(t.value); dirty(); save(); route(true); }
    else if (t.matches('[data-kfilter]')) { S.ui.kfilter = t.value; save(); route(); }
    else if (t.matches('[data-q]')) { S.ui.q = t.value; save(); route(); }
    else if (t.matches('[data-last]')) { d.lastReported = t.value; S.ui.month = defaultMonth(); save(); route(true); }
    else if (t.matches('[data-trends]')) { d.trendsImproving = t.checked; save(); }
    else if (t.matches('[data-ystart]') && t.value) { const [yy, mm] = t.value.split('-').map(Number); const ms = [];
      for (let i = 0; i < 12; i++) { const mi = (mm - 1 + i) % 12, yi = yy + Math.floor((mm - 1 + i) / 12); ms.push(MN[mi] + '-' + yi); }
      if (hasData() && !confirm('Changing the contract year months may hide results recorded against the old months. Continue?')) { route(); return; }
      yearObj().months = ms; S.ui.month = ms[0]; save(); route(true); }
    else if (t.matches('[data-setv]')) { if (t.value === '') return; S.settings.values[t.dataset.setv] = t.dataset.pct ? +t.value / 100 : +t.value; save(); route(true); }
    else if (t.matches('[data-cat]')) { S.settings.categories[t.dataset.cat] = +t.value; save(); route(true); }
    else if (t.matches('[data-w]')) { S.settings.weights[t.dataset.w] = +t.value / 100; save(); route(true); }
    else if (t.matches('[data-mw]')) { const [k, i] = t.dataset.mw.split('|'); S.settings.mweights = S.settings.mweights || {}; (S.settings.mweights[k] = S.settings.mweights[k] || [])[+i] = +t.value / 100; save(); route(true); }
    else if (t.matches('[data-p]')) { S.settings.pass[t.dataset.p] = +t.value; save(); route(true); }
    else if (t.id === 'importFile' && t.files[0]) {
      t.files[0].text().then(txt => { const x = JSON.parse(txt); if (!x.settings || !x.data) throw new Error(); S = x; save(); route(); toast('Backup imported'); }).catch(() => toast('That file is not a valid backup'));
    }
  });
  window.addEventListener('hashchange', () => route());
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => route(true));
  function loadSample(go) {
    const c = SAMPLE.contractor; if (!S.contractors.includes(c)) S.contractors.unshift(c);
    S.data[c] = { [S.years[0].id]: SAMPLE.build(M) }; S.ui.contractor = c; S.ui.year = S.years[0].id; S.ui.month = 'Oct-2026'; S.ui.event = null; S.sample = true; save();
    if (go) { location.hash = '#dashboard'; route(); toast('Sample data loaded'); }
  }
  // First visit: show the sample so the dashboard is not empty.
  if (window.SAMPLE && !hasData() && !S.sampleCleared) loadSample(false);
  route();
})();
