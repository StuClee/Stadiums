"""Generate js/model.js for the Stadium Performance Model app (Calculation Sheet V3, 15 KPIs).

Sources (kept with the source documents, not deployed):
  - Performance Model Calculation Sheet - Draft V2 (Inputs, Standards Register, Band Reconciliation)
  - Technical Specification (performance standards tables), parsed to ts.json
Usage: python build_model.py <calc sheet .xlsx> <ts.json> js/model.js
"""
import json, re, sys
import openpyxl

XLSX, TSJSON, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
wb = openpyxl.load_workbook(XLSX, data_only=False)
ip = wb['Inputs']
v = lambda ref: ip[ref].value

settings = {
    'monthlyFee': v('B10'), 'passThreshold': v('B11'), 'abatementPerPoint': v('B12'), 'abatementCap': v('B13'),
    'incentiveScore': v('B14'), 'incentiveMonths': v('B15'), 'rectificationMonths': v('B16'),
    'eventPoints': v('B20'), 'capPerStandard': v('B21'), 'noEventScore': v('B22'),
}
# rows found by label so inserted KPI rows do not break the build
rowof = lambda pred: next(r for r in range(1, ip.max_row + 1) if pred(str(ip[f'A{r}'].value or '')))
settings['creditShare'] = ip[f"B{rowof(lambda a: a.startswith('Credit retained'))}"].value
categories = {}
for r in range(25, 30):
    categories[ip[f'A{r}'].value] = {'points': ip[f'B{r}'].value, 'name': ip[f'C{r}'].value, 'wording': ip[f'D{r}'].value}
categories['A'] = {'points': settings['eventPoints'], 'name': 'Event-scored standard', 'wording': 'KPI-x event score'}

ts = json.load(open(TSJSON))
txt = lambda c: ' '.join(x['t'] for x in c).strip()
detail, kpi_names, sections = {}, {}, {}
for s in ts['sections']:
    if not s['num'].isdigit(): continue
    st = next(x for x in s['subs'] if x['title'].lower().startswith('performance standards'))
    for r in st['blocks'][0]['rows'][1:]:
        ref = txt(r[0])
        detail[ref] = {'target': txt(r[2]), 'applies': txt(r[3]), 'measure': txt(r[4]), 'by': txt(r[5])}
    kp = next(x for x in s['subs'] if 'kpi' in x['title'].lower())
    kt = ' '.join(b['t'] for b in kp['blocks'] if b['type'] == 'p')
    m = re.search(r'feed (KPI-\w+), ([^.]+)\.', kt)
    kpi_names[m.group(1)] = m.group(2)
    sections[m.group(1)] = {'num': s['num'], 'title': s['title']}

kpis = []
kpi_rows = [r for r in range(1, ip.max_row + 1) if str(ip[f'A{r}'].value or '').startswith('KPI-')]
for r in kpi_rows:
    k = ip[f'A{r}'].value
    kpis.append({'id': k, 'name': kpi_names[k], 'ts': sections[k]['num'], 'service': sections[k]['title'],
                 'weight': ip[f'B{r}'].value, 'pass': ip[f'C{r}'].value, 'pilot': k == 'KPI-U'})

sr = wb['Standards Register']
standards = []
for r in range(5, sr.max_row + 1):
    ref = sr[f'A{r}'].value
    if not ref: continue
    d = detail.get(ref, {})
    standards.append({'ref': ref, 'name': sr[f'B{r}'].value, 'kpi': sr[f'C{r}'].value, 'ts': sr[f'D{r}'].value,
                      'link': sr[f'E{r}'].value, 'event': sr[f'F{r}'].value == 'Yes', 'cat': sr[f'G{r}'].value or '',
                      'critical': sr[f'I{r}'].value == 'Yes', **d})

br = wb['Band Reconciliation']
bands = []
for r in range(5, br.max_row + 1):
    a = br[f'A{r}'].value
    if not a or a == 'Total' or str(a).startswith('Rules'): continue
    bands.append({'id': f'b{len(bands) + 1}', 'ts': a, 'band': br[f'B{r}'].value, 'item': br[f'C{r}'].value, 'unit': br[f'D{r}'].value})

m1 = rowof(lambda a: a == 'Month 1')
months = [ip[f'B{r}'].value for r in range(m1, m1 + 12)]

model = {
    'title': 'Stadium Performance Model',
    'subtitle': 'Tātaki Auckland Unlimited · Stadiums Maintenance',
    'version': 'Schedule 1 Performance Model (18 November 2026) · Calculation Sheet Draft V3 · Stadiums Maintenance Technical Specification (18 November 2026)',
    'coreShare': {'kpis': [k['id'] for k in kpis if k['id'] not in ('KPI-GD', 'KPI-HS')], 'target': 0.85},
    'settings': settings, 'categories': categories, 'kpis': kpis, 'standards': standards, 'bands': bands,
    'contractYear': {'id': 'Y1', 'name': 'Year 1', 'months': months},
    'scoreToFee': [
        ['90.0 and above', '100% of the monthly fee', 'Scores of 95 and above in 9 or more months release the incentive pool.'],
        ['80.0 to 89.9', '100% less 1% per full point below 90', 'Rectification plan after two consecutive months in this band.'],
        ['75.0 to 79.9', '85% (abatement capped at 15%)', 'Rectification plan within 5 working days.'],
        ['Below 75.0', '85% (cap holds)', 'Formal review; counts as a month below threshold.'],
        ['Any event or critical failure', 'As above', 'Rectification plan within 5 working days regardless of the score.']],
    'escalation': [
        ['Any event failure, any critical standard failure, or two consecutive months below 90', 'Rectification plan within 5 working days; progress reviewed at the next monthly meeting.', "Contractor prepares; Principal's Representative approves"],
        ['Three months below 90 in any six', 'Formal performance review; revised Maintenance & Operations Plan; weekly reporting until two consecutive months at 90 or above.', 'Contract managers of both parties'],
        ['Six months below 90 in any twelve, or a failed rectification plan', 'Notice of default; the Principal may step in and recover the cost of substitute services.', "Principal's contract manager"],
        ['Default not remedied within the notice period', 'Termination for cause.', 'Principal'],
        ['Nine or more months at 95 or above, with improving condition trends', 'Incentive pool released and an extension year earned.', "Principal's Representative certifies"]],
}
with open(OUT, 'w', encoding='utf-8') as f:
    f.write('/* Generated by build_model.py from the Calculation Sheet V3 and the Technical Specification. Do not edit by hand. */\n')
    f.write('window.MODEL = ' + json.dumps(model, ensure_ascii=False, indent=1) + ';\n')
print('kpis', len(kpis), 'standards', len(standards), 'bands', len(bands), 'with detail', sum(1 for s in standards if s.get('target')))
