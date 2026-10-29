#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Read-only structural/editability checks. Python 3 standard library only."""
import argparse
import json
import math
import posixpath
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'c': 'http://schemas.openxmlformats.org/drawingml/2006/chart',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'rel': 'http://schemas.openxmlformats.org/package/2006/relationships'}

def validate(pptx, expected_slides=None, spec=None, require_animation=False):
    errors, warnings, rows = [], [], []
    def check(ok, message):
        if not ok: errors.append(message)
    with zipfile.ZipFile(pptx) as z:
        check(z.testzip() is None, 'ZIP CRC failure')
        names = set(z.namelist())
        check(len(names) == len(z.namelist()), 'Duplicate ZIP entries')
        check('[Content_Types].xml' in names, 'Missing Content Types')
        check(not any('vbaProject' in n or n.endswith('.bin') for n in names), 'Macro/binary part unexpectedly present')
        trees = {}
        for n in sorted(names):
            if n.endswith('.xml') or n.endswith('.rels'):
                try: trees[n] = ET.fromstring(z.read(n))
                except ET.ParseError as e: errors.append(f'{n}: malformed XML: {e}')
        pres = trees.get('ppt/presentation.xml')
        if pres is None: return {'ok': False, 'errors': errors + ['Missing presentation XML']}
        size = pres.find('p:sldSz', NS)
        cx, cy = int(size.get('cx', 0)), int(size.get('cy', 0))
        check(abs(cx / cy - 16 / 9) < .001 if cy else False, 'Slide aspect ratio is not 16:9')
        slides = sorted((n for n in names if re.fullmatch(r'ppt/slides/slide\d+\.xml', n)), key=lambda n: int(re.search(r'slide(\d+)', n).group(1)))
        expected_slides = expected_slides or (len(spec['slides']) if spec else None)
        if expected_slides is not None: check(len(slides) == expected_slides, f'Expected {expected_slides} slides, found {len(slides)}')
        for relpath, root in trees.items():
            if not relpath.endswith('.rels'): continue
            base = posixpath.dirname(posixpath.dirname(relpath))
            for rel in root:
                if rel.get('TargetMode') == 'External':
                    check(rel.get('Type', '').endswith('/hyperlink'), f'{relpath}: external dependency {rel.get("Target")}')
                else:
                    target = rel.get('Target', '')
                    resolved = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join(base, target))
                    check(resolved in names, f'{relpath}: missing relationship target {resolved}')
        chart_count = table_count = animation_count = transition_count = 0
        for i, n in enumerate(slides, 1):
            root = trees[n]
            texts = [v.text or '' for v in root.findall('.//a:t', NS)]
            ids = [x.get('id') for x in root.findall('.//p:cNvPr', NS)]
            check(len(ids) == len(set(ids)), f'Slide {i}: duplicate object IDs')
            check(bool(texts), f'Slide {i}: no native editable text')
            shapes = root.findall('.//p:sp', NS)
            pictures = root.findall('.//p:pic', NS)
            charts = root.findall('.//c:chart', NS)
            tables = root.findall('.//a:tbl', NS)
            chart_count += len(charts); table_count += len(tables)
            for obj in shapes + pictures + root.findall('.//p:graphicFrame', NS):
                xform = obj.find('p:spPr/a:xfrm', NS)
                if xform is None: xform = obj.find('p:xfrm', NS)
                if xform is None: continue
                off = xform.find('a:off', NS); ext = xform.find('a:ext', NS)
                if off is None or ext is None: continue
                x, y = int(off.get('x', 0)), int(off.get('y', 0))
                w, h = int(ext.get('cx', 0)), int(ext.get('cy', 0))
                # Tolerance: 0.01 inch. Crop overflow is separate from image box geometry.
                check(x >= -9144 and y >= -9144 and x + w <= cx + 9144 and y + h <= cy + 9144,
                      f'Slide {i}: object bounds outside canvas ({x},{y},{w},{h})')
            timing = root.find('p:timing', NS)
            effects = root.findall('.//p:animEffect', NS) + root.findall('.//p:set', NS)
            targets = root.findall('.//p:timing//p:spTgt', NS)
            for target in targets: check(target.get('spid') in ids, f'Slide {i}: animation targets nonexistent object {target.get("spid")}')
            if timing is not None:
                tids = [el.get('id') for el in timing.findall('.//p:cTn', NS)]
                check(len(tids) == len(set(tids)), f'Slide {i}: duplicate timing IDs')
                check(bool(targets), f'Slide {i}: timing exists with no shape targets')
                check(timing.find('.//p:cTn[@nodeType="mainSeq"]', NS) is not None, f'Slide {i}: no main animation sequence')
                animation_count += len(effects)
            transition = root.find('p:transition', NS)
            if transition is not None:
                transition_count += 1
                check(transition.find('p:fade', NS) is not None, f'Slide {i}: expected native fade transition')
            if require_animation:
                check(timing is not None and bool(effects), f'Slide {i}: missing native animation')
                check(transition is not None, f'Slide {i}: missing transition')
            if spec and i <= len(spec['slides']):
                s = spec['slides'][i - 1]
                check(s['title'] in texts, f'Slide {i}: title missing or not native text')
                if s['layout'] == 'chart': check(len(charts) == 1, f'Slide {i}: expected one native chart')
                if s['layout'] == 'table': check(len(tables) == 1, f'Slide {i}: expected one native table')
                if s['layout'] in ('image', 'image_grid'): check(len(pictures) >= 1, f'Slide {i}: missing picture object')
                if s['layout'] == 'table':
                    for cell in s['table']['headers'] + [v for r in s['table']['rows'] for v in r]:
                        check(not cell or cell in texts, f'Slide {i}: table cell not preserved: {cell}')
            rows.append({'slide': i, 'text_runs': len(texts), 'shapes': len(shapes), 'pictures': len(pictures), 'charts': len(charts), 'tables': len(tables), 'animation_effects': len(effects), 'transition': transition is not None})
        chartparts = sorted(n for n in names if re.fullmatch(r'ppt/charts/chart\d+\.xml', n))
        for n in chartparts:
            chart = trees[n]
            values = [el.text for el in chart.findall('.//c:numCache/c:pt/c:v', NS)]
            check(bool(values), f'{n}: no editable numeric chart cache')
            check(all(math.isfinite(float(v)) for v in values), f'{n}: nonfinite chart values')
            external = chart.find('c:externalData', NS)
            check(external is not None, f'{n}: no embedded workbook reference')
            relpath = posixpath.join(posixpath.dirname(n), '_rels', posixpath.basename(n) + '.rels')
            related = trees.get(relpath)
            workbook = [] if related is None else [r for r in related if r.get('Type', '').endswith('/package')]
            check(bool(workbook), f'{n}: missing embedded workbook relationship')
            for rel in workbook:
                wbpath = posixpath.normpath(posixpath.join(posixpath.dirname(n), rel.get('Target', '')))
                if wbpath in names:
                    import io
                    with zipfile.ZipFile(io.BytesIO(z.read(wbpath))) as w:
                        check('xl/workbook.xml' in w.namelist() and w.testzip() is None, f'{n}: embedded workbook invalid')
        if spec:
            expected_charts = [s['chart'] for s in spec['slides'] if s['layout'] == 'chart']
            check(len(expected_charts) == len(chartparts), 'Chart count differs from input')
            # PptxGenJS emits chart parts in slide order.
            chartparts.sort(key=lambda p: int(re.search(r'chart(\d+)', p).group(1)))
            for n, c in zip(chartparts, expected_charts):
                series = trees[n].findall('.//c:ser', NS)
                check(len(series) == len(c['series']), f'{n}: series count mismatch')
                for el, supplied in zip(series, c['series']):
                    nums = [float(v.text) for v in el.findall('c:val/c:numRef/c:numCache/c:pt/c:v', NS)]
                    check(nums == supplied['values'], f'{n}: chart data differs from input')
                    labels = [v.text or '' for v in el.findall('c:cat/c:strRef/c:strCache/c:pt/c:v', NS)]
                    if not labels:
                        labels = [v.text or '' for v in el.findall('c:cat/c:multiLvlStrRef/c:multiLvlStrCache/c:lvl/c:pt/c:v', NS)]
                    check(labels == c['categories'], f'{n}: category labels differ from input')
    warnings.append('Structural checks do not prove visual fit or playback. Render every slide; verify animation playback in the target PowerPoint version.')
    return {'ok': not errors, 'file': str(pptx), 'slides': len(slides), 'native_charts': chart_count, 'native_tables': table_count, 'animation_effects': animation_count, 'transitions': transition_count, 'details': rows, 'errors': errors, 'warnings': warnings}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('pptx', type=Path); p.add_argument('--expected-slides', type=int)
    p.add_argument('--input-json', type=Path); p.add_argument('--require-animation', action='store_true')
    p.add_argument('--report', type=Path)
    a = p.parse_args()
    try:
        spec = json.loads(a.input_json.read_text(encoding='utf-8')) if a.input_json else None
        result = validate(a.pptx, a.expected_slides, spec, a.require_animation)
    except (OSError, ValueError, zipfile.BadZipFile, ET.ParseError, KeyError) as e:
        result = {'ok': False, 'errors': [str(e)]}
    serialized = json.dumps(result, ensure_ascii=False, indent=2)
    print(serialized)
    if a.report:
        a.report.parent.mkdir(parents=True, exist_ok=True); a.report.write_text(serialized + '\n', encoding='utf-8')
    return 0 if result['ok'] else 1
if __name__ == '__main__': sys.exit(main())
