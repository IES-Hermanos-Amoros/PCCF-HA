"""Extrae la programación de un módulo del Word de PD de DAW y la convierte en JSON estructurado.

Uso: python -I tools/word_a_json.py "<PD_DAW.docx>" "<PCCF DAW.docx>" "<nombre del módulo>" data/pd.json
"""
import sys, os, zipfile, json, re
from xml.etree import ElementTree as ET
sys.stdout.reconfigure(encoding='utf-8')
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
w = lambda t: '{%s}%s' % (W, t)
NSW = {'w': W}

def ptext(p):
    out = []
    for node in p.iter():
        if node.tag == w('t'): out.append(node.text or '')
        elif node.tag == w('tab'): out.append('\t')
        elif node.tag == w('br'): out.append('\n')
    return ''.join(out)

def pinfo(p):
    s = p.find('w:pPr/w:pStyle', NSW)
    style = s.get(w('val')) if s is not None else ''
    num = p.find('w:pPr/w:numPr', NSW)
    lvl = None
    if num is not None:
        il = num.find('w:ilvl', NSW)
        lvl = int(il.get(w('val'))) if il is not None else 0
    bold = any(r.find('w:rPr/w:b', NSW) is not None and ptext(r).strip() for r in p.findall('w:r', NSW))
    return style, lvl, bold

def load_seq(path):
    z = zipfile.ZipFile(path)
    body = ET.fromstring(z.read('word/document.xml')).find(w('body'))
    seq = []
    for el in body:
        if el.tag == w('p'):
            style, lvl, bold = pinfo(el)
            seq.append({'type': 'p', 'style': style, 'text': ptext(el).strip(), 'lvl': lvl, 'bold': bold})
        elif el.tag == w('tbl'):
            rows = []
            for tr in el.findall(w('tr')):
                cells = []
                for tc in tr.findall(w('tc')):
                    paras = tc.findall(w('p'))
                    texts = [ptext(p).strip() for p in paras]
                    bold = any(pinfo(p)[2] for p in paras)
                    span = tc.find('w:tcPr/w:gridSpan', NSW)
                    cells.append({'t': '\n'.join(x for x in texts if x), 'span': int(span.get(w('val'))) if span is not None else 1, 'bold': bold})
                rows.append(cells)
            seq.append({'type': 'table', 'rows': rows})
    return seq

def module_section(seq, modname):
    start = next(i for i, it in enumerate(seq) if it['type'] == 'p' and it['style'] == 'Ttulo2' and it['text'].endswith(modname))
    end = next((j for j in range(start + 1, len(seq)) if seq[j]['type'] == 'p' and seq[j]['style'] in ('Ttulo1', 'Ttulo2')), len(seq))
    return [it for it in seq[start:end] if it['type'] == 'table' or it['text']]

def blocks(items):
    """Convierte una secuencia de párrafos en bloques: {type:'p'} o {type:'list', items:[{text,level}]}"""
    out = []
    for it in items:
        if it['type'] != 'p': continue
        is_list = it['lvl'] is not None or it['style'] == 'Prrafodelista'
        if is_list:
            lvl = it['lvl'] if it['lvl'] is not None else 0
            if out and out[-1]['type'] == 'list': out[-1]['items'].append({'text': it['text'], 'level': lvl})
            else: out.append({'type': 'list', 'items': [{'text': it['text'], 'level': lvl}]})
        else:
            out.append({'type': 'p', 'text': it['text']})
    return out

def split_lines(t):
    return [x.strip() for x in t.split('\n') if x.strip()]

def between(sec, start_pat, end_level):
    """Items entre el encabezado que coincide con start_pat y el siguiente encabezado de nivel <= end_level."""
    i = next(k for k, it in enumerate(sec) if it['type'] == 'p' and re.search(start_pat, it['text']))
    out = []
    for it in sec[i + 1:]:
        if it['type'] == 'p' and it['style'].startswith('Ttulo') and int(it['style'][-1]) <= end_level: break
        out.append(it)
    return out

def main(pd_path, pccf_path, modname, out_path):
    seq = load_seq(pd_path)
    sec = module_section(seq, modname)
    tables = [it for it in sec if it['type'] == 'table']
    # --- identificación
    ident = {}
    for r in tables[0]['rows'][1:]:
        cells = [c['t'] for c in r]
        if len(cells) >= 3 and cells[0] not in ('Asociado a Unidad de competencia', 'Síntesis del módulo'):
            ident[cells[1]] = cells[2]
            if len(cells) >= 5 and cells[3]: ident[cells[3]] = cells[4]
        elif len(cells) >= 2:
            ident[cells[0]] = cells[1]
    modulo = {
        'codigo': ident.get('Código', ''), 'nombre': ident.get('Módulo profesional', modname), 'curso': ident.get('Curso', ''),
        'profesorado': ident.get('Titular', ''), 'horas': ident.get('Horas', ''), 'horas_semanales': ident.get('Horas semanales', ''),
        'ects': ident.get('ETCS', ''), 'unidad_competencia': ident.get('Asociado a Unidad de competencia', ''), 'sintesis': ident.get('Síntesis del módulo', ''),
    }
    # --- propuestas de mejora
    propuestas = blocks(between(sec, r'^9\.\d+\.1\. Propuestas', 3))
    # --- competencias / objetivos
    comp = tables[1]['rows'][1]
    competencias = split_lines(comp[0]['t']); objetivos = split_lines(comp[1]['t'])
    # --- RA / CE
    ra = []
    for r in tables[2]['rows'][1:]:
        m = re.match(r'^(\d+)\.\s*(.*)', r[0]['t'], re.S)
        ces = []
        # Un criterio puede empezar en la misma línea que el anterior ("... repetición. c) Se han ..."): se separa también por "x) "
        for line in [x for l in split_lines(r[1]['t']) for x in re.split(r'\s+(?=[a-zñ]\)\s)', l)]:
            mm = re.match(r'^([a-zñ])\)\s*(.*)', line)
            if mm: ces.append({'letra': mm.group(1), 'texto': mm.group(2).strip()})
            elif ces: ces[-1]['texto'] += ' ' + line
        ra.append({'num': int(m.group(1)), 'texto': m.group(2).strip(), 'ce': ces})
    # --- contenidos
    contenidos = []
    for line in split_lines(tables[3]['rows'][1][0]['t']):
        if line[0] in '−-–':
            if contenidos: contenidos[-1]['items'].append(line.lstrip('−-– ').strip())
        else:
            contenidos.append({'bloque': line.rstrip(':'), 'items': []})
    # --- metodología
    estrategias = [{'nombre': r[0]['t'], 'descripcion': r[1]['t']} for r in tables[4]['rows'][1:]]
    plurilingue = ' '.join(it['text'] for it in between(sec, r'Programa plurilingüe', 4) if it['type'] == 'p')
    recursos = blocks(between(sec, r'Recursos específicos', 3))
    # --- situaciones de aprendizaje
    situaciones = []
    sa_tables = [t for t in tables if t['rows'][0][0]['t'].startswith('Situación de aprendizaje')]
    for t in sa_tables:
        rows = t['rows']
        g = lambda i, j=0: rows[i][j]['t'] if i < len(rows) and j < len(rows[i]) else ''
        num = int(re.search(r'(\d+)', g(0)).group(1))
        ra_nums = [int(m) for m in re.findall(r'(?m)^(\d+)\.', g(2, 1))]
        situaciones.append({
            'num': num, 'titulo': g(0, 1), 'sesiones': int(re.sub(r'\D', '', g(0, 3)) or 0), 'evaluacion': g(1, 3),
            'ra': ra_nums, 'criterios': split_lines(g(4)), 'competencias': split_lines(g(6)), 'objetivos': split_lines(g(8)),
            'actividades': {'introduccion': g(11, 0), 'no_evaluables': g(11, 1), 'evaluables': g(11, 2)},
            'refuerzo': g(13, 0), 'ampliacion': g(13, 1), 'recuperacion': g(15), 'recursos': g(17),
        })
    # --- relación con otros módulos
    relacion = blocks(between(sec, r'Relación con otros módulos', 3))
    # --- evaluación
    evaluacion = {
        'instrumentos': blocks(between(sec, r'Instrumentos de evaluación', 4)),
        'criterios': blocks(between(sec, r'^9\.\d+\.7\.2\. Criterios de evaluación', 4)),
        'calificacion': blocks(between(sec, r'Criterios de calificación', 4)),
        'recuperacion': blocks(between(sec, r'Recuperación de los resultados', 4)),
        'pendientes': blocks(between(sec, r'pendiente de cursos anteriores', 3)),
    }
    # --- ponderaciones
    pond_tables = [t for t in tables if t['rows'][0][0]['t'].startswith('Resultado de aprendizaje (')]
    for t in pond_tables:
        num = int(re.search(r'\.(\d+)\)', t['rows'][0][0]['t']).group(1))
        item = next(x for x in ra if x['num'] == num)
        item['ponderacion'] = float(t['rows'][1][1]['t'].replace('%', '').replace(',', '.').strip() or 0)
        for r in t['rows'][3:]:
            mm = re.match(r'^([a-zñ])\)', r[0]['t'])
            if not mm: continue
            ce = next((c for c in item['ce'] if c['letra'] == mm.group(1)), None)
            if ce:
                ce['ponderacion'] = float(r[1]['t'].replace('%', '').replace(',', '.').strip() or 0)
                ce['fundamental'] = bool(r[0]['bold'])
    # --- dual (desde el PCCF)
    dual = []
    pseq = load_seq(pccf_path)
    dtab = next((t for t in pseq if t['type'] == 'table' and t['rows'][0][0]['t'] == 'Curso' and 'Empresa' in ' '.join(c['t'] for c in t['rows'][0])), None)
    claves = set()
    if dtab:
        current = None
        for r in dtab['rows'][1:]:
            if r[1]['t']: current = r[1]['t']; claves.add(current)
            if current and current.upper().startswith('PROG'):
                m = re.match(r'^(RA\s*\d+)\.?\s*(.*)', r[2]['t'], re.S)
                dual.append({'ra': m.group(1).replace(' ', '') if m else r[2]['t'][:5], 'texto': (m.group(2) if m else r[2]['t']).strip(), 'ce_empresa': r[3]['t'], 'ce_instituto': r[4]['t']})
    data = {
        'centro': {'nombre': 'IES Hermanos Amorós', 'localidad': 'Villena (Alicante)', 'departamento': 'Informática'},
        'ciclo': {'codigo': 'DAW', 'nombre': 'Desarrollo de Aplicaciones Web', 'nivel': 'Grado Superior', 'curso_academico': '2026-27'},
        'modulo': modulo, 'estado': 'borrador',
        'propuestas_mejora': propuestas, 'competencias': competencias, 'objetivos': objetivos, 'ra': ra, 'contenidos': contenidos,
        'metodologia': {'estrategias': estrategias, 'plurilingue': plurilingue, 'recursos': recursos},
        'situaciones': situaciones, 'relacion_otros_modulos': relacion, 'evaluacion': evaluacion, 'dual': dual,
    }
    os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)
    json.dump(data, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('módulo:', modulo)
    print('RA:', len(ra), '| CE:', sum(len(x['ce']) for x in ra), '| suma ponderación RA:', sum(x.get('ponderacion', 0) for x in ra))
    for x in ra: print(f"  RA{x['num']}: {x.get('ponderacion')}% · CE {len(x['ce'])} · suma CE {sum(c.get('ponderacion',0) for c in x['ce']):.2f} · fundamentales {sum(1 for c in x['ce'] if c.get('fundamental'))}")
    print('contenidos bloques:', len(contenidos), '| estrategias:', len(estrategias), '| situaciones:', len(situaciones), 'sesiones', sum(s['sesiones'] for s in situaciones))
    print('situaciones:', [(s['num'], s['evaluacion'], s['ra'], s['sesiones']) for s in situaciones])
    print('evaluación bloques:', {k: len(v) for k, v in evaluacion.items()}, '| relación:', len(relacion), '| recursos:', len(recursos), '| propuestas:', len(propuestas))
    print('claves dual en PCCF:', sorted(claves))
    print('dual filas:', len(dual), dual[:2])

main(*sys.argv[1:5])
