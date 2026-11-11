/* Illustrative sample data for demonstrating the app. Not real assessment results. */
window.SAMPLE = (function () {
  const events = [
    ['2026-07-11', 'NRL round (sample)', 'B', false, { 'M1.5': 'Clumps at two turning zones in run-off; cleared before kick-off, result stands.', 'L1.5': 'Marking finished 40 minutes after the agreed final marking time.', 'R1.7': 'Goalmouth repair 6 mm proud of the surrounding surface.', 'O1.4': 'Half-time divoting crew one person short.' }],
    ['2026-07-25', 'A-League round (sample)', 'B', false, { 'M1.6': 'Edging missed along the southern hard edge.', 'I1.1': 'Root zone moisture below the event band at 4 of 15 grid points.', 'P1.12': 'Two goalmouth test points above the hardness band.' }],
    ['2026-08-08', 'NRL round (sample)', 'B', false, {}],
    ['2026-08-15', 'A-League round (sample)', 'B', false, { 'M1.1': 'Grid mean 25.8 mm, above the 25 mm upper limit.' }],
    ['2026-08-29', 'NRL round (sample)', 'B', false, {}],
    ['2026-09-05', 'NRL final (sample)', 'A', false, {}],
    ['2026-09-19', 'Rugby league international (sample)', 'A', false, {}],
    ['2026-10-17', 'A-League round (sample)', 'B', true, { 'R1.7': 'Repair at the northern penalty spot not level at readiness.' }],
    ['2026-10-31', 'A-League round (sample)', 'B', false, {}],
  ];
  const deductions = [
    ['Jul-2026', 'M1.7', 2, true, 'Wheel rutting at two turning zones after a wet cut.'],
    ['Jul-2026', 'C1.1', 1, true, 'Weekly training field test round missed.'],
    ['Jul-2026', 'P1.3', 1, true, 'Verti-drain pass on a saturated surface left heave in the western run-off.'],
    ['Jul-2026', 'O1.10', 1, true, 'Monthly report submitted three days late.'],
    ['Aug-2026', 'M1.3', 1, true, 'Non-event height above range at unannounced audit.'],
    ['Sep-2026', 'I1.6', 2, true, 'Two irrigation repairs completed outside the response time.'],
    ['Oct-2026', 'T1.10', 1, true, 'Spray records for one application incomplete.'],
    ['Oct-2026', 'N1.8', 1, false, 'Spreader overlap reported; not confirmed at audit.'],
  ];
  const bands = {
    b1: { lump: 320000, min: 45, max: 60, rate: 1800, credit: 1200, logged: '', principal: '', allMet: false },
    b2: { lump: 60000, min: 30, max: 45, rate: 600, credit: 400, logged: '', principal: '', allMet: true },
    b3: { lump: 40000, min: 24, max: 36, rate: 400, credit: 300, logged: '', principal: '', allMet: true },
  };
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function monthOf(d) { const [y, m] = d.split('-'); return MN[+m - 1] + '-' + y; }
  function build(model) {
    const evStds = model.standards.filter(s => s.event);
    const ev = events.map(([date, name, tier, first, fails], i) => {
      const results = {};
      evStds.forEach(s => { if (s.kpi === 'KPI-V' && !first) return; results[s.ref] = fails[s.ref] ? { r: 'fail', note: fails[s.ref] } : { r: 'pass', note: '' }; });
      return { id: 'e' + (i + 1), date, month: monthOf(date), name, tier, firstAfterRenovation: first, results,
               signedBy: "FieldTurf NZ turf manager and Principal's Representative (sample)" };
    });
    const de = deductions.map(([month, ref, count, confirmed, note], i) => ({ id: 'd' + (i + 1), month, ref, count, confirmed, note }));
    return { events: ev, deductions: de, notAssessed: {}, bands: JSON.parse(JSON.stringify(bands)), lastReported: 'Oct-2026', trendsImproving: true };
  }
  return { build, contractor: 'FieldTurf NZ' };
})();
