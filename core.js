/* Scoring rules for the Stadium Performance Model (Schedule 1, Parts B to F). No DOM here.
   Mirrors the Calculation Sheet Draft V2 formulas so results match the workbook. */
(function (global) {
  'use strict';
  const M = global.MODEL;
  const STD = Object.fromEntries(M.standards.map(s => [s.ref, s]));

  /* cfg = { settings, weights:{kpi:fraction}, pass:{kpi:points}, categories:{cat:points} } */
  function points(cfg, ref) {
    const s = STD[ref]; if (!s || !s.cat) return 0;
    return cfg.categories[s.cat] != null ? cfg.categories[s.cat] : (M.categories[s.cat] || {}).points || 0;
  }
  const eventKpi = k => M.standards.some(s => s.kpi === k && s.event);

  /* Event score for one KPI at one event: 100 less points per failed event-scored standard (floor 0).
     Null when the KPI has no event-scored standards, or for KPI-V unless it is the first event after renovation. */
  function eventScore(cfg, ev, k) {
    if (!eventKpi(k)) return null;
    if (k === 'KPI-V' && !ev.firstAfterRenovation) return null;
    let fails = 0;
    Object.entries(ev.results || {}).forEach(([ref, r]) => { const s = STD[ref]; if (s && s.kpi === k && s.event && r && r.r === 'fail') fails++; });
    return Math.max(0, 100 - cfg.settings.eventPoints * fails);
  }

  /* Confirmed monthly deductions for a KPI, capped per standard. */
  function deductions(cfg, yd, k, month) {
    const byStd = {};
    (yd.deductions || []).forEach(d => {
      const s = STD[d.ref];
      if (!s || s.kpi !== k || d.month !== month || !d.confirmed) return;
      byStd[d.ref] = (byStd[d.ref] || 0) + (Number(d.count) || 0) * points(cfg, d.ref);
    });
    return Object.values(byStd).reduce((a, v) => a + Math.min(cfg.settings.capPerStandard, v), 0);
  }

  function reported(months, month, last) {
    const i = months.indexOf(month), j = months.indexOf(last);
    return j < 0 ? true : i <= j;
  }

  /* One month: every KPI result, overall score, fee and flags. */
  function month(cfg, yd, months, mo) {
    const isRep = reported(months, mo, yd.lastReported);
    const evs = (yd.events || []).filter(e => e.month === mo);
    const kpi = {};
    M.kpis.forEach(k => {
      const scores = evs.map(e => eventScore(cfg, e, k.id)).filter(v => v != null);
      const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : cfg.settings.noEventScore;
      const ded = deductions(cfg, yd, k.id, mo);
      const na = (yd.notAssessed || {})[mo] && (yd.notAssessed[mo] || {})[k.id] != null;
      const result = !isRep || na ? null : Math.max(0, mean - ded);
      kpi[k.id] = { events: scores.length, mean, ded, notAssessed: !!na, result, below: result != null && result < (cfg.pass[k.id] ?? 90) };
    });
    let wSum = 0, sum = 0;
    M.kpis.forEach(k => { const r = kpi[k.id].result; const w = cfg.weights[k.id] || 0; if (r != null) { wSum += w; sum += w * r; } });
    const overall = isRep && wSum > 0 ? sum / wSum : null;
    const st = cfg.settings;
    const feePct = overall == null ? null : overall >= st.passThreshold ? 1 : Math.max(1 - st.abatementCap, 1 - Math.floor(st.passThreshold - overall + 1e-9) * st.abatementPerPoint);
    const fee = overall == null ? null : st.monthlyFee;
    const failures = [];
    evs.forEach(e => Object.entries(e.results || {}).forEach(([ref, r]) => { const s = STD[ref]; if (s && s.event && r && r.r === 'fail') failures.push({ event: e, ref, s, note: r.note }); }));
    const critical = failures.filter(f => f.s.critical).map(f => ({ ref: f.ref, where: f.event.name }))
      .concat((yd.deductions || []).filter(d => d.month === mo && d.confirmed && STD[d.ref] && STD[d.ref].critical).map(d => ({ ref: d.ref, where: 'Deduction log' })));
    return { month: mo, reported: isRep, events: evs, kpi, weightAssessed: wSum, overall, feePct, fee,
             feePaid: fee == null ? null : Math.round(fee * feePct * 100) / 100, abatement: fee == null ? null : Math.round(fee * (1 - feePct) * 100) / 100,
             below: overall != null && overall < st.passThreshold, atIncentive: overall != null && overall >= st.incentiveScore,
             eventFailure: isRep && failures.length > 0, failures, critical: isRep ? critical : [] };
  }

  /* The contract year: months plus Part F escalation and incentive tests. */
  function year(cfg, yd, months) {
    const ms = months.map(mo => month(cfg, yd, months, mo));
    let consec = 0;
    ms.forEach((m, i) => {
      consec = m.below ? consec + 1 : 0; m.consecutive = consec;
      m.rolling6 = ms.slice(Math.max(0, i - 5), i + 1).filter(x => x.below).length;
      m.rolling12 = ms.slice(0, i + 1).filter(x => x.below).length;
      m.rectification = m.reported && (consec >= cfg.settings.rectificationMonths || m.eventFailure || m.critical.length > 0);
    });
    const rep = ms.filter(m => m.overall != null);
    const avg = rep.length ? rep.reduce((a, m) => a + m.overall, 0) / rep.length : null;
    const sumOf = f => ms.reduce((a, m) => a + (m[f] || 0), 0);
    const atInc = ms.filter(m => m.atIncentive).length;
    const kpiAvg = {};
    M.kpis.forEach(k => { const v = ms.map(m => m.kpi[k.id].result).filter(x => x != null);
      kpiAvg[k.id] = { avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, below: ms.filter(m => m.kpi[k.id].below).length,
        fails: ms.reduce((a, m) => a + m.failures.filter(f => f.s.kpi === k.id).length, 0),
        ded: ms.reduce((a, m) => a + m.kpi[k.id].ded, 0) }; });
    return { months: ms, reported: rep.length, average: avg, feeTotal: sumOf('fee'), feePaid: sumOf('feePaid'), abatement: sumOf('abatement'),
             monthsBelow: ms.filter(m => m.below).length, rectMonths: ms.filter(m => m.rectification).length,
             criticalMonths: ms.filter(m => m.critical.length).length, eventFailureMonths: ms.filter(m => m.eventFailure).length,
             threeInSix: ms.some(m => m.rolling6 >= 3), sixInTwelve: ms.some(m => m.rolling12 >= 6),
             atIncentive: atInc, incentive: atInc >= cfg.settings.incentiveMonths && !!yd.trendsImproving, kpiAvg };
  }

  /* Part E: one band line. */
  function band(cfg, b) {
    const n = x => (x === '' || x == null || isNaN(+x)) ? null : +x;
    const lump = n(b.lump), min = n(b.min), max = n(b.max), rate = n(b.rate) || 0, credit = n(b.credit) || 0, logged = n(b.logged), pc = n(b.principal) || 0;
    const above = logged != null && max != null ? Math.max(0, logged - max) : 0;
    const payable = Math.min(above, pc);
    const extra = payable * rate;
    const belowMin = logged != null && min != null ? Math.max(0, min - logged) : 0;
    const share = b.allMet ? cfg.settings.creditShare : 1;
    const cred = belowMin * credit * share;
    const status = logged == null ? 'Not entered' : above ? 'Above maximum' : belowMin ? 'Below minimum' : 'Within band';
    return { lump, above, payable, extra, belowMin, share, credit: cred, net: extra - cred, status };
  }

  function cfgFrom(settings) {
    return { settings: { ...M.settings, ...(settings.values || {}) },
             weights: { ...Object.fromEntries(M.kpis.map(k => [k.id, k.weight])), ...(settings.weights || {}) },
             pass: { ...Object.fromEntries(M.kpis.map(k => [k.id, k.pass])), ...(settings.pass || {}) },
             categories: { ...Object.fromEntries(Object.entries(M.categories).map(([c, v]) => [c, v.points])), ...(settings.categories || {}), A: (settings.values || {}).eventPoints ?? M.settings.eventPoints } };
  }

  global.CORE = { STD, eventScore, deductions, month, year, band, points, cfgFrom, eventKpi };
})(window);
