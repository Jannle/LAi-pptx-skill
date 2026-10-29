#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// PPTX implementation newly written 2026-10-29; visual system adapted from guizang-ppt-skill.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import PptxGenJS from 'pptxgenjs';
import { animatePptx } from './animate-pptx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const THEMES = JSON.parse(fs.readFileSync(path.join(ROOT, 'references/themes.json'), 'utf8'));
export const LAYOUTS = ['cover', 'agenda', 'section', 'statement', 'bullets', 'compare', 'kpi', 'chart', 'table', 'process', 'timeline', 'image', 'image_grid', 'closing'];
const W = 13.333333, H = 7.5, M = 0.7, CW = W - 2 * M;
const forbidden = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u;
const fail = message => { throw new Error(message); };
const text = (v, name, required = true) => {
  if (v === undefined && !required) return '';
  if (typeof v !== 'string' || (required && !v.trim()) || forbidden.test(v)) fail(`${name}: expected ${required ? 'non-empty ' : ''}text without XML control characters`);
  if (v.length > 12000) fail(`${name}: text too long; split content into more slides`);
  return v;
};
const list = (v, name, min, max) => {
  if (!Array.isArray(v) || v.length < min || v.length > max) fail(`${name}: expected ${min}–${max} items`);
  return v;
};
function known(obj, keys, name) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) fail(`${name}: expected an object`);
  for (const k of Object.keys(obj)) if (!keys.includes(k)) fail(`${name}: unknown field "${k}"`);
}
function imageFile(v, dir, name) {
  text(v, name);
  if (path.isAbsolute(v) || /^[a-z]+:/i.test(v)) fail(`${name}: use a local relative PNG/JPEG path inside the input JSON folder`);
  const base = fs.realpathSync(dir);
  const target = fs.realpathSync(path.resolve(base, v));
  const rel = path.relative(base, target);
  if (rel.startsWith(`..${path.sep}`) || rel === '..' || path.isAbsolute(rel)) fail(`${name}: path escapes the input JSON folder`);
  if (!/\.(png|jpe?g)$/i.test(target) || !fs.statSync(target).isFile()) fail(`${name}: only local PNG/JPEG files are accepted`);
  if (fs.statSync(target).size > 25 * 1024 * 1024) fail(`${name}: image exceeds 25 MiB`);
  return target;
}
export function validateInput(d, inputDir = process.cwd()) {
  known(d, ['title', 'author', 'subject', 'style', 'theme', 'language', 'brand', 'footer', 'fonts', 'animation', 'slides'], 'deck');
  text(d.title, 'title');
  const style = d.style === undefined ? 'magazine' : d.style;
  if (!Object.hasOwn(THEMES, style)) fail(`style: choose magazine, swiss or huawei`);
  const theme = d.theme === undefined ? Object.keys(THEMES[style])[0] : d.theme;
  if (!Object.hasOwn(THEMES[style], theme)) fail(`theme: choose ${Object.keys(THEMES[style]).join(', ')} for ${style}`);
  for (const k of ['author', 'subject', 'brand', 'footer', 'language']) if (d[k] !== undefined) text(d[k], k, false);
  if (d.fonts !== undefined) {
    known(d.fonts, ['heading', 'body', 'mono'], 'fonts');
    for (const k of Object.keys(d.fonts)) text(d.fonts[k], `fonts.${k}`);
  }
  if (d.animation !== undefined) {
    known(d.animation, ['effect', 'transition', 'durationMs'], 'animation');
    if (d.animation.effect !== undefined && !['fade', 'appear', 'none'].includes(d.animation.effect)) fail('animation.effect: fade, appear or none');
    if (d.animation.transition !== undefined && !['fade', 'none'].includes(d.animation.transition)) fail('animation.transition: fade or none');
    if (d.animation.durationMs !== undefined && (!Number.isInteger(d.animation.durationMs) || d.animation.durationMs < 100 || d.animation.durationMs > 3000)) fail('animation.durationMs: integer from 100 to 3000');
  }
  const baseKeys = ['layout', 'title', 'subtitle', 'eyebrow', 'notes', 'sources'];
  const extra = {
    cover: [], agenda: ['items'], section: ['number'], statement: ['body', 'attribution'],
    bullets: ['items'], compare: ['left', 'right'], kpi: ['metrics'], chart: ['chart'], table: ['table'],
    process: ['steps'], timeline: ['events'], image: ['image', 'body', 'caption', 'fit'],
    image_grid: ['images'], closing: ['body', 'contact']
  };
  list(d.slides, 'slides', 1, 100).forEach((s, i) => {
    const at = `slides[${i}]`;
    if (!s || !LAYOUTS.includes(s.layout)) fail(`${at}.layout: choose ${LAYOUTS.join(', ')}`);
    known(s, [...baseKeys, ...extra[s.layout]], at);
    text(s.title, `${at}.title`);
    for (const k of ['subtitle', 'eyebrow', 'notes', 'body', 'attribution', 'number', 'caption', 'contact']) if (s[k] !== undefined) text(s[k], `${at}.${k}`, false);
    if (s.sources !== undefined) list(s.sources, `${at}.sources`, 0, 30).forEach((v, j) => text(v, `${at}.sources[${j}]`));
    if (['agenda', 'bullets'].includes(s.layout)) list(s.items, `${at}.items`, 1, 5).forEach((v, j) => text(v, `${at}.items[${j}]`));
    if (s.layout === 'compare') ['left', 'right'].forEach(k => {
      known(s[k], ['title', 'items'], `${at}.${k}`); text(s[k].title, `${at}.${k}.title`);
      list(s[k].items, `${at}.${k}.items`, 1, 4).forEach((v, j) => text(v, `${at}.${k}.items[${j}]`));
    });
    if (s.layout === 'kpi') list(s.metrics, `${at}.metrics`, 1, 3).forEach((v, j) => {
      known(v, ['value', 'label', 'detail'], `${at}.metrics[${j}]`);
      text(v.value, `${at}.metrics[${j}].value`); text(v.label, `${at}.metrics[${j}].label`);
      if (v.detail !== undefined) text(v.detail, `${at}.metrics[${j}].detail`, false);
    });
    if (s.layout === 'chart') {
      const c = s.chart; known(c, ['type', 'categories', 'series', 'unit', 'showValues'], `${at}.chart`);
      if (!['bar', 'column', 'line', 'doughnut'].includes(c.type)) fail(`${at}.chart.type: bar, column, line or doughnut`);
      list(c.categories, `${at}.chart.categories`, 1, 8).forEach(v => text(v, `${at}.chart.category`));
      list(c.series, `${at}.chart.series`, 1, c.type === 'doughnut' ? 1 : 3).forEach(v => {
        known(v, ['name', 'values'], `${at}.chart.series`); text(v.name, `${at}.chart.series.name`);
        list(v.values, `${at}.chart.values`, c.categories.length, c.categories.length).forEach(n => {
          if (typeof n !== 'number' || !Number.isFinite(n)) fail(`${at}.chart.values: expected finite numbers`);
          if (c.type === 'doughnut' && n < 0) fail(`${at}.chart.values: doughnut values cannot be negative`);
        });
        if (c.type === 'doughnut' && v.values.every(n => n === 0)) fail(`${at}.chart.values: doughnut requires a positive total`);
      });
      if (c.unit !== undefined) text(c.unit, `${at}.chart.unit`, false);
      if (c.showValues !== undefined && typeof c.showValues !== 'boolean') fail(`${at}.chart.showValues: expected boolean`);
    }
    if (s.layout === 'table') {
      known(s.table, ['headers', 'rows', 'widths'], `${at}.table`);
      list(s.table.headers, `${at}.table.headers`, 1, 6).forEach(v => text(v, `${at}.table.header`));
      list(s.table.rows, `${at}.table.rows`, 1, 7).forEach(row => list(row, `${at}.table.row`, s.table.headers.length, s.table.headers.length).forEach(v => text(v, `${at}.table.cell`, false)));
      if (s.table.widths !== undefined) {
        list(s.table.widths, `${at}.table.widths`, s.table.headers.length, s.table.headers.length).forEach(v => {
          if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) fail(`${at}.table.widths: expected positive weights`);
        });
      }
    }
    if (['process', 'timeline'].includes(s.layout)) {
      const k = s.layout === 'process' ? 'steps' : 'events';
      list(s[k], `${at}.${k}`, 2, 4).forEach((v, j) => {
        known(v, s.layout === 'process' ? ['title', 'body'] : ['date', 'title', 'body'], `${at}.${k}[${j}]`);
        text(v.title, `${at}.${k}[${j}].title`); text(v.body, `${at}.${k}[${j}].body`);
        if (s.layout === 'timeline') text(v.date, `${at}.${k}[${j}].date`);
      });
    }
    if (s.layout === 'image') {
      imageFile(s.image, inputDir, `${at}.image`);
      if (s.fit !== undefined && !['contain', 'cover'].includes(s.fit)) fail(`${at}.fit: contain or cover`);
    }
    if (s.layout === 'image_grid') list(s.images, `${at}.images`, 2, 3).forEach((v, j) => {
      known(v, ['path', 'caption', 'fit'], `${at}.images[${j}]`);
      imageFile(v.path, inputDir, `${at}.images[${j}].path`);
      if (v.caption !== undefined) text(v.caption, `${at}.images[${j}].caption`, false);
      if (v.fit !== undefined && !['contain', 'cover'].includes(v.fit)) fail(`${at}.images[${j}].fit: contain or cover`);
    });
  });
  return { ...d, style, theme };
}

// Conservative text capacity estimate: CJK/fullwidth ≈ 1 em, Latin ≈ .55 em.
// This is a guard, not a substitute for reviewing rendered slides with installed fonts.
function units(s) { return Array.from(s).reduce((n, c) => n + (/[^\u0000-\u00ff]/u.test(c) ? 1 : /[MW@#]/.test(c) ? .85 : /[il., :;'!]/.test(c) ? .3 : .55), 0); }
function fitFont(s, w, h, size, minimum) {
  for (let f = size; f >= minimum; f -= 1) {
    const capacity = w * 72 / f;
    const lines = s.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(units(line) / capacity)), 0);
    if (lines * f * 1.22 <= h * 72) return f;
  }
  fail(`Text cannot fit safely (minimum ${minimum} pt): "${s.slice(0, 70)}". Shorten it or split the slide.`);
}
export async function generate(input, output, options = {}) {
  const inputDir = options.inputDir ?? process.cwd();
  const d = validateInput(input, inputDir);
  const t = THEMES[d.style][d.theme];
  const accentText = d.style === 'swiss' && ['lemon', 'lime', 'orange'].includes(d.theme) ? t.ink : t.accent;
  const fonts = { heading: d.style === 'magazine' ? 'Noto Serif CJK SC' : 'Noto Sans CJK SC', body: 'Noto Sans CJK SC', mono: 'Noto Sans Mono CJK SC', ...d.fonts };
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'GUIZANG_WIDE', width: W, height: H }); pptx.layout = 'GUIZANG_WIDE';
  pptx.author = d.author ?? ''; pptx.subject = d.subject ?? ''; pptx.title = d.title;
  pptx.company = d.brand ?? ''; pptx.lang = d.language ?? 'zh-CN';
  pptx.theme = { headFontFace: fonts.heading, bodyFontFace: fonts.body, lang: d.language ?? 'zh-CN' };
  let shapeID = 0, names = [], activeGroups = [];
  const groupsBySlide = {};
  const named = prefix => { const n = `${prefix}-${++shapeID}`; names.push(n); return n; };
  const finishGroup = start => { const group = names.slice(start); if (group.length) activeGroups.push(group); };
  const box = (sl, value, x, y, w, h, size = 22, cfg = {}) => {
    if (!value) return;
    const { minimum = Math.min(size, 18), fontFace = fonts.body, ...rest } = cfg;
    const fs = fitFont(String(value), w, h, size, minimum);
    sl.addText(String(value), { x, y, w, h, margin: 0, fontFace, fontSize: fs, color: t.ink,
      breakLine: false, valign: 'top', paraSpaceAfterPt: 0, fit: 'none',
      objectName: named('editable-text'), ...rest });
  };
  const rect = (sl, x, y, w, h, color, line) => sl.addShape(pptx.ShapeType.rect, {x, y, w, h, line: {color: line ?? color, width: line ? .6 : 0}, fill: {color}, objectName: named('editable-shape')});
  const rule = (sl, x, y, w, color = t.line) => sl.addShape(pptx.ShapeType.line, {x, y, w, h: 0, line: {color, width: .7}, objectName: named('editable-rule')});
  const picture = (sl, file, x, y, w, h, fit = 'contain', alt = '') => {
    const p = imageFile(file, inputDir, 'image');
    sl.addImage({path: p, x, y, w, h, sizing: {type: fit, w, h}, altText: alt, objectName: named('picture')});
  };
  const pointRows = (sl, items, x, y, w, h, numbered = false) => {
    const rowH = h / items.length;
    items.forEach((v, i) => {
      const start = names.length;
      if (numbered) box(sl, String(i + 1).padStart(2, '0'), x, y + rowH * i, .6, .5, 19, {fontFace: fonts.mono, color: accentText, bold: true});
      else rect(sl, x, y + rowH * i + .14, .075, .075, t.accent);
      box(sl, v, x + (numbered ? .8 : .28), y + rowH * i, w - (numbered ? .8 : .28), rowH - .16, 25, {minimum: 19});
      if (numbered && i < items.length - 1) rule(sl, x + .8, y + rowH * (i + 1) - .18, w - .8);
      finishGroup(start);
    });
  };
  d.slides.forEach((s, index) => {
    const sl = pptx.addSlide();
    sl.background = {color: t.paper};
    const section = ['cover', 'section', 'closing'].includes(s.layout);
    const dark = section && (d.style !== 'magazine' || s.layout !== 'section');
    if (dark) sl.background = {color: t.accent};
    const fg = dark ? t.onAccent : t.ink;
    if (d.style === 'huawei' && d.brand) box(sl, d.brand, 10.3, .27, 2.3, .32, 11, {color: dark ? fg : t.muted, align: 'right', minimum: 10});
    if (!section) {
      if (d.style === 'huawei') rect(sl, M, .7, .14, .42, t.accent);
      box(sl, s.title, M + (d.style === 'huawei' ? .32 : 0), .56, CW - (d.style === 'huawei' ? .32 : 0), .84, 34, {fontFace: fonts.heading, bold: d.style !== 'magazine', minimum: 27});
      if (s.subtitle) box(sl, s.subtitle, M, 1.43, CW, .49, 16, {color: t.muted, minimum: 14});
      if (d.style !== 'huawei') rule(sl, M, 1.99, CW, t.line);
    }
    names = []; activeGroups = [];
    const y = 2.22, bh = 4.28;
    switch (s.layout) {
      case 'cover':
        if (s.eyebrow) box(sl, s.eyebrow, M, 1.02, CW, .44, 16, {fontFace: fonts.mono, color: dark ? fg : t.muted});
        box(sl, s.title, M, 2.05, CW - .4, 2.1, d.style === 'swiss' ? 62 : 53, {fontFace: fonts.heading, bold: d.style !== 'magazine', color: fg, minimum: 36});
        if (s.subtitle) box(sl, s.subtitle, M, 4.7, CW - 1, 1.03, 23, {color: fg});
        rule(sl, M, 6.55, CW, dark ? fg : t.line);
        break;
      case 'section':
        if (s.number) box(sl, s.number, M, 1.05, CW, 1.3, 74, {fontFace: fonts.mono, color: fg, minimum: 50});
        box(sl, s.title, M, 3.02, CW, 1.6, 51, {fontFace: fonts.heading, bold: d.style !== 'magazine', color: fg, minimum: 34});
        if (s.subtitle) box(sl, s.subtitle, M, 5.25, CW, .8, 23, {color: fg});
        break;
      case 'agenda':
        if (d.style === 'huawei') {
          rect(sl, M, y, 2.1, bh, t.accent);
          box(sl, 'CONTENTS', M + .25, y + .3, 1.6, .45, 15, {color: t.onAccent, fontFace: fonts.mono});
          pointRows(sl, s.items, 3.2, y, 9.3, bh, true);
        } else pointRows(sl, s.items, M, y, CW, bh, true);
        break;
      case 'statement':
        box(sl, s.body ?? s.title, M, y + .25, CW - .3, 2.9, 42, {fontFace: fonts.heading, bold: d.style === 'swiss', minimum: 28});
        if (s.attribution) box(sl, s.attribution, M, 5.8, CW, .55, 17, {color: t.muted});
        break;
      case 'bullets': pointRows(sl, s.items, M, y, CW, bh); break;
      case 'compare': {
        const gap = .7, w = (CW - gap) / 2;
        [s.left, s.right].forEach((v, i) => {
          const x = M + i * (w + gap);
          box(sl, v.title, x, y, w, .62, 28, {color: accentText, bold: true, minimum: 22});
          rule(sl, x, y + .78, w);
          pointRows(sl, v.items, x, y + 1.08, w, bh - 1.08);
        }); break;
      }
      case 'kpi': {
        const gap = .55, w = (CW - gap * (s.metrics.length - 1)) / s.metrics.length;
        s.metrics.forEach((v, i) => {
          const start = names.length;
          const x = M + i * (w + gap);
          box(sl, v.value, x, y + .28, w, 1.2, 64, {fontFace: fonts.heading, color: accentText, bold: d.style !== 'magazine', minimum: 36});
          box(sl, v.label, x, y + 1.75, w, .7, 26, {minimum: 21});
          if (v.detail) box(sl, v.detail, x, y + 2.73, w, 1.3, 19, {color: t.muted});
          finishGroup(start);
        }); break;
      }
      case 'chart': {
        const c = s.chart;
        const type = c.type === 'column' ? pptx.ChartType.bar : pptx.ChartType[c.type];
        if (c.unit) box(sl, c.unit, M, y, CW, .32, 13, {color: t.muted, minimum: 12});
        const data = c.series.map(v => ({name: v.name, labels: c.categories, values: v.values}));
        sl.addChart(type, data, {x: M, y: y + .48, w: CW, h: bh - .48, showTitle: false,
          showLegend: c.series.length > 1 || c.type === 'doughnut', legendPos: 'b', legendFontFace: fonts.body, legendFontSize: 13,
          catAxisLabelFontFace: fonts.body, catAxisLabelFontSize: 13, catAxisLabelColor: t.ink,
          valAxisLabelFontFace: fonts.body, valAxisLabelFontSize: 12, valAxisLabelColor: t.muted,
          chartColors: c.type === 'doughnut' || c.series.length > 1 ? [t.accent, t.secondary, t.muted, t.line] : [t.accent],
          showValue: c.showValues ?? true, dataLabelPosition: c.type === 'doughnut' ? 'bestFit' : c.type === 'line' ? 't' : 'outEnd',
          dataLabelColor: t.ink, dataLabelFormatCode: '0.##', dataLabelFontFace: fonts.body, dataLabelFontSize: 12,
          showPercent: false, showCatName: false, showSerName: false,
          catAxisLineColor: t.line, valAxisLineColor: t.line,
          valGridLine: {color: t.line, width: .5}, catAxisTitleFontFace: fonts.body, valAxisTitleFontFace: fonts.body,
          lineDataSymbol: c.type === 'line' ? 'circle' : 'none', lineDataSymbolSize: 5,
          lineSize: 2, barDir: c.type === 'bar' ? 'bar' : 'col',
          holeSize: 62,
          objectName: named('editable-chart')});
        break;
      }
      case 'table': {
        const tab = s.table, weights = tab.widths ?? tab.headers.map(() => 1), sum = weights.reduce((a, b) => a + b, 0);
        const widths = weights.map(v => CW * v / sum), rowH = Math.min(.66, bh / (tab.rows.length + 1));
        [tab.headers, ...tab.rows].forEach((row, ri) => row.forEach((cell, ci) => fitFont(cell, widths[ci] - .24, rowH - .13, ri ? 17 : 18, ri ? 16 : 17)));
        const rows = [tab.headers.map(v => ({text: v, options: {fill: t.accent, color: t.onAccent, bold: true}})), ...tab.rows];
        sl.addTable(rows, {x: M, y, w: CW, h: rowH * rows.length, colW: widths, rowH,
          fontFace: fonts.body, fontSize: 17, color: t.ink, margin: [.05, .12, .05, .12],
          border: {type: 'solid', pt: .55, color: t.line}, fill: t.paper,
          valign: 'mid', autoPage: false, objectName: named('editable-table')});
        break;
      }
      case 'process': {
        const gap = .48, w = (CW - gap * (s.steps.length - 1)) / s.steps.length;
        s.steps.forEach((v, i) => {
          const start = names.length;
          const x = M + i * (w + gap);
          box(sl, `${i + 1}`.padStart(2, '0'), x, y, w, .65, 30, {fontFace: fonts.mono, color: accentText});
          rule(sl, x, y + .9, w, t.accent);
          box(sl, v.title, x, y + 1.15, w, .95, 26, {bold: true, minimum: 22});
          box(sl, v.body, x, y + 2.3, w, 1.65, 20, {minimum: 18});
          if (i < s.steps.length - 1) sl.addShape(pptx.ShapeType.chevron, {x: x + w + .13, y: y + 1.25, w: .22, h: .3, fill: {color: t.accent}, line: {color: t.accent}, objectName: named('editable-process-arrow')});
          finishGroup(start);
        }); break;
      }
      case 'timeline': {
        const gap = .4, w = (CW - gap * (s.events.length - 1)) / s.events.length;
        rule(sl, M, y + 1.2, CW, t.accent);
        s.events.forEach((v, i) => {
          const start = names.length;
          const x = M + i * (w + gap);
          box(sl, v.date, x, y + .15, w, .62, 26, {color: accentText, fontFace: fonts.mono, minimum: 20});
          rect(sl, x, y + 1.13, .14, .14, t.accent);
          box(sl, v.title, x, y + 1.62, w, .9, 25, {bold: true, minimum: 21});
          box(sl, v.body, x, y + 2.72, w, 1.3, 19, {minimum: 18});
          finishGroup(start);
        }); break;
      }
      case 'image':
        if (s.body) {
          box(sl, s.body, M, y + .35, 4.3, 3.3, 26, {minimum: 20});
          picture(sl, s.image, 5.55, y, 7.08, 3.95, s.fit, s.caption ?? s.title);
          if (s.caption) box(sl, s.caption, 5.55, 6.28, 7.08, .4, 12, {color: t.muted, minimum: 11});
        } else {
          picture(sl, s.image, M, y, CW, 3.97, s.fit, s.caption ?? s.title);
          if (s.caption) box(sl, s.caption, M, 6.29, CW, .4, 12, {color: t.muted, minimum: 11});
        } break;
      case 'image_grid': {
        const gap = .35, w = (CW - gap * (s.images.length - 1)) / s.images.length;
        s.images.forEach((v, i) => {
          const start = names.length;
          const x = M + i * (w + gap);
          picture(sl, v.path, x, y, w, 3.55, v.fit, v.caption ?? s.title);
          if (v.caption) box(sl, v.caption, x, 5.98, w, .66, 15, {color: t.muted, minimum: 13});
          finishGroup(start);
        }); break;
      }
      case 'closing':
        box(sl, s.title, M, 1.72, CW, 2, 53, {fontFace: fonts.heading, color: fg, bold: d.style !== 'magazine', minimum: 35});
        if (s.body) box(sl, s.body, M, 4.23, CW - .5, 1.2, 24, {color: fg});
        if (s.contact) box(sl, s.contact, M, 6.16, CW, .44, 16, {color: fg});
        break;
    }
    groupsBySlide[index + 1] = activeGroups.length ? activeGroups : [names.slice()];
    const footColor = dark ? fg : t.muted;
    if (d.footer) box(sl, d.footer, M + (d.style === 'huawei' ? 1.05 : 0), 7.02, CW - 1.05, .22, 9, {color: footColor, minimum: 8});
    box(sl, `${index + 1} / ${d.slides.length}`, d.style === 'huawei' ? M : W - M - .8, 7.02, .8, .23, 9, {color: footColor, align: d.style === 'huawei' ? 'left' : 'right', minimum: 9});
    const notes = [s.notes, ...(s.sources ?? []).map(v => `Source: ${v}`)].filter(Boolean).join('\n');
    if (notes) sl.addNotes(notes);
  });
  const out = path.resolve(output);
  if (path.extname(out).toLowerCase() !== '.pptx') fail('Output filename must end with .pptx');
  if (!options.force && fs.existsSync(out)) fail(`Output already exists: ${out}; choose another filename or use --force`);
  fs.mkdirSync(path.dirname(out), {recursive: true});
  const temp = `${out}.${randomUUID()}.tmp.pptx`;
  try {
    await pptx.writeFile({fileName: temp, compression: true});
    const animated = `${temp}.animated`;
    try {
      await animatePptx(temp, animated, {groupsBySlide, effect: d.animation?.effect ?? 'fade', transition: d.animation?.transition ?? 'fade', durationMs: d.animation?.durationMs ?? 400});
      fs.copyFileSync(animated, out, options.force ? 0 : fs.constants.COPYFILE_EXCL);
    } finally { if (fs.existsSync(animated)) fs.unlinkSync(animated); }
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return {path: out, slides: d.slides.length, style: d.style, theme: d.theme, fonts};
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.length === 0) {
    console.log('Usage: node scripts/generate.mjs input.json output.pptx [--force]\nLocal JSON + local PNG/JPEG assets only. Existing outputs are protected by default.'); return;
  }
  if (args.length < 2 || args.slice(2).some(v => v !== '--force')) fail('Expected input.json output.pptx [--force]');
  const p = path.resolve(args[0]);
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  console.log(JSON.stringify(await generate(d, args[1], {inputDir: path.dirname(p), force: args.includes('--force')}), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(e => { console.error(`Error: ${e.message}`); process.exitCode = 1; });
