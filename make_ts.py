"""Parse the Stadiums Maintenance Technical Specification (.docx) into ts.json for build_model.py."""
import json, re, sys
import docx
from docx.oxml.ns import qn
W = lambda el: ''.join(t.text or '' for t in el.iter(qn('w:t')))
def style(el):
    s = el.find('.//' + qn('w:pStyle')); return s.get(qn('w:val')) if s is not None else 'Normal'
d = docx.Document(sys.argv[1]); out = {'cover': [p.text for p in d.paragraphs[:12] if p.text.strip()], 'sections': []}
sec = sub = None
SUB = re.compile(r'^(\d+\.\d+(\.\d+)?)\s*(\D.*)$')
for el in d.element.body.iterchildren():
    if el.tag == qn('w:p'):
        t = W(el).strip()
        if style(el) == 'Heading2':
            m = re.match(r'^(\d+)\.\s+(.*)$', t) or re.match(r'^Appendix ([A-D])\.\s+(.*)$', t)
            sec = {'num': m.group(1) if m and t[0].isdigit() else '', 'title': m.group(2) if m else t, 'subs': []}
            out['sections'].append(sec); sub = None; continue
        if not sec or not t: continue
        ms = SUB.match(t)
        if ms and el.find('.//' + qn('w:b')) is not None and len(t) < 140 and style(el) == 'Normal':
            sub = {'num': ms.group(1), 'title': ms.group(3).strip(), 'blocks': []}; sec['subs'].append(sub); continue
        if sub is not None:
            sub['blocks'].append({'type': 'p', 't': t, 'li': style(el).startswith('List')})
    elif el.tag == qn('w:tbl') and sub is not None:
        rows = [[[{'t': W(p), 'li': False} for p in tc.findall(qn('w:p')) if W(p).strip()] for tc in tr.findall(qn('w:tc'))] for tr in el.findall(qn('w:tr'))]
        sub['blocks'].append({'type': 'table', 'rows': rows})
json.dump(out, open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
print([(s['num'], s['title'], len(s['subs'])) for s in out['sections']])
