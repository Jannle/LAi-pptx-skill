#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generate, THEMES } from './generate.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'guizang-pptx-test-'));
fs.mkdirSync(out, {recursive: true});
const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const base = JSON.parse(fs.readFileSync(path.join(root, 'examples/demo.json'), 'utf8'));
// Tiny literal PNG is a parser fixture, not an illustrative slide asset.
fs.writeFileSync(path.join(out, 'image-fixture.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64'));
const extra = [
  {layout: 'section', number: '01', title: '章节测试', subtitle: '原生章节页面'},
  {layout: 'statement', title: '观点页测试', body: '保留内容结构，让信息清晰可读。', attribution: '示例文案'},
  {layout: 'bullets', title: '要点测试', items: ['第一条原生文字', '第二条原生文字', '第三条原生文字']},
  {layout: 'timeline', title: '时间线测试', events: [{date: '2026 Q1', title: '规划', body: '整理资料与需求。'}, {date: '2026 Q2', title: '制作', body: '搭建页面与数据。'}, {date: '2026 Q3', title: '复核', body: '验证结果与交付。'}]},
  {layout: 'image', title: '图片对象测试', body: '仅测试图片嵌入能力。', image: 'image-fixture.png', caption: '单像素 PNG 测试夹具，不是配图', fit: 'contain'},
  {layout: 'image_grid', title: '图片网格对象测试', images: [{path: 'image-fixture.png', caption: '测试图片一'}, {path: 'image-fixture.png', caption: '测试图片二'}]}
];
const results = [];
function validate(file, spec, animation = true) {
  const inputPath = `${file}.json`; fs.writeFileSync(inputPath, JSON.stringify(spec, null, 2));
  const report = `${file}.validation.json`;
  const args = [path.join(root, 'scripts/validate_pptx.py'), file, '--input-json', inputPath, '--report', report];
  if (animation) args.push('--require-animation');
  const r = spawnSync(python, args, {encoding: 'utf8'});
  if (r.error) throw r.error;
  assert.equal(r.status, 0, `Validation failed for ${file}: ${r.stdout}\n${r.stderr}`);
  return JSON.parse(r.stdout);
}
for (const style of Object.keys(THEMES)) {
  const d = structuredClone(base); d.style = style; delete d.theme;
  d.slides = [...base.slides, ...extra];
  const file = path.join(out, `all-layouts-${style}.pptx`);
  await generate(d, file, {inputDir: out, force: true});
  results.push(validate(file, d));
  const demo = structuredClone(base); demo.style = style; delete demo.theme;
  const demoFile = path.join(out, `demo-${style}.pptx`);
  await generate(demo, demoFile, {inputDir: out, force: true});
  results.push(validate(demoFile, demo));
}
for (const [style, themes] of Object.entries(THEMES)) {
  for (const theme of Object.keys(themes)) {
    const d = {title: 'Theme test', style, theme, slides: [{layout: 'cover', title: '主题测试', subtitle: `${style} / ${theme}`}]};
    const file = path.join(out, `theme-${style}-${theme}.pptx`);
    await generate(d, file, {inputDir: out, force: true}); results.push(validate(file, d));
  }
}
for (const type of ['bar', 'column', 'line', 'doughnut']) {
  const slide = structuredClone(base.slides.find(s => s.layout === 'chart')); slide.chart.type = type;
  const d = {title: 'Chart test', style: 'swiss', slides: [slide]};
  const file = path.join(out, `chart-${type}.pptx`);
  await generate(d, file, {inputDir: out, force: true}); results.push(validate(file, d));
}
for (const effect of ['appear', 'none']) {
  const d = {title: 'Animation test', animation: {effect, transition: 'none'}, slides: [extra[2]]};
  const file = path.join(out, `animation-${effect}.pptx`);
  await generate(d, file, {inputDir: out, force: true});
  const r = validate(file, d, false);
  assert.equal(r.transitions, 0, 'transition:none must omit native transitions');
  if (effect === 'none') assert.equal(r.animation_effects, 0, 'effect:none must omit timing');
  else assert.ok(r.animation_effects > 0, 'appear must create native behavior');
  results.push(r);
}
const cases = [
  d => {d.style = 'unknown';},
  d => {d.slides[0].layout = 'unsupported';},
  d => {d.slides[0].title = '过'.repeat(5000);},
  d => {d.slides = [{layout: 'chart', title: 'Invalid', chart: {type: 'line', categories: ['A'], series: [{name: 'x', values: [NaN]}]}}];},
  d => {d.slides = [{layout: 'image', title: 'Invalid', image: '../outside.png'}];},
  d => {d.animation = {effect: 'fly-unknown'};},
  d => {d.slides[0].unknownOption = true;},
  d => {d.fonts = false;},
  d => {d.animation = false;},
  d => {d.slides[0].sources = false;},
  d => {d.slides.find(s => s.layout === 'table').table.widths = false;},
  d => {d.animation = null;},
  d => {d.style = null;}
];
for (let i = 0; i < cases.length; i++) {
  const d = structuredClone(base); cases[i](d);
  const dest = path.join(out, `must-not-exist-${i}.pptx`);
  await assert.rejects(() => generate(d, dest, {inputDir: out}));
  assert.equal(fs.existsSync(dest), false, 'Invalid input wrote an output');
}
await assert.rejects(() => generate(base, path.join(out, 'demo-magazine.pptx'), {inputDir: out}), /already exists/);
const report = {ok: true, decks: results.length, slides: results.reduce((a, b) => a + b.slides, 0), negative_cases: cases.length + 1, tests: results.map(r => ({file: path.basename(r.file), slides: r.slides, native_charts: r.native_charts, native_tables: r.native_tables, animation_effects: r.animation_effects, transitions: r.transitions}))};
fs.writeFileSync(path.join(out, 'TEST-RESULTS.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ok: true, output: out, decks: report.decks, slides: report.slides, negative_cases: report.negative_cases}, null, 2));
