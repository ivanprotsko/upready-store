#!/usr/bin/env node
// report-validate.mjs — валидатор отчёта воркера для UI (схема ui/report.schema.json, без зависимостей). Библиотека + CLI:
//   node ui/report-validate.mjs <report.json>  → «OK <n done / m results / k access>» rc=0, либо список ошибок rc=1.
import fs from 'node:fs';
const isStr = (v, min = 1, max = 100000) => typeof v === 'string' && v.length >= min && v.length <= max;
const isLink = v => isStr(v) && (/^(https?|file):\/\//.test(v) || v.startsWith('/') || /^[\w.-]+(\/[\w.@ -]+)+$/.test(v));
export function validateReport(r) {
  const e = [];
  if (!r || typeof r !== 'object' || Array.isArray(r)) return ['report must be a JSON object'];
  const allowed = ['task', 'branch', 'pr', 'done', 'results', 'access', 'notes'];
  for (const k of Object.keys(r)) if (!allowed.includes(k)) e.push(`unknown field "${k}" (allowed: ${allowed.join(', ')})`);
  if (!isStr(r.task)) e.push('task: non-empty string (task id) required');
  if ('branch' in r && !isStr(r.branch)) e.push('branch: string');
  if ('pr' in r) { const p = r.pr; if (!p || typeof p !== 'object' || !Number.isInteger(p.number) || !isStr(p.url) || !/^https:\/\//.test(p.url)) e.push('pr: {number: integer, url: https://…}'); }
  if (!Array.isArray(r.done) || r.done.length < 1 || r.done.length > 20) e.push('done: array of 1..20 items required');
  else r.done.forEach((d, i) => { if (!d || typeof d !== 'object') return e.push(`done[${i}]: object`); if (!isStr(d.item, 3, 240)) e.push(`done[${i}].item: 3..240 chars`); for (const k of Object.keys(d)) if (!['item', 'links'].includes(k)) e.push(`done[${i}]: unknown field "${k}"`); if ('links' in d) { if (!Array.isArray(d.links)) e.push(`done[${i}].links: array`); else d.links.forEach((l, j) => { if (!isLink(l)) e.push(`done[${i}].links[${j}]: URL, file://, absolute or artifacts-relative path, got ${JSON.stringify(l)}`); }); } });
  if (!Array.isArray(r.results) || r.results.length < 1 || r.results.length > 20) e.push('results: array of 1..20 items required (where to look at the result)');
  else r.results.forEach((x, i) => { if (!x || typeof x !== 'object') return e.push(`results[${i}]: object`); if (!isStr(x.label, 2, 120)) e.push(`results[${i}].label: 2..120 chars`); for (const k of Object.keys(x)) if (!['label', 'url', 'path', 'note'].includes(k)) e.push(`results[${i}]: unknown field "${k}"`); if (!('url' in x) && !('path' in x)) e.push(`results[${i}]: url or path required`); if ('url' in x && !(isStr(x.url) && /^https?:\/\//.test(x.url))) e.push(`results[${i}].url: http(s)://…`); if ('path' in x && !isLink(x.path)) e.push(`results[${i}].path: file://, absolute or mission-relative path`); if ('note' in x && !isStr(x.note, 0, 240)) e.push(`results[${i}].note: ≤240 chars`); });
  if ('access' in r) { if (!Array.isArray(r.access) || r.access.length > 10) e.push('access: array of ≤10 items'); else r.access.forEach((a, i) => { if (!a || typeof a !== 'object') return e.push(`access[${i}]: object`); for (const k of Object.keys(a)) if (!['url', 'login', 'password', 'secretRef', 'note'].includes(k)) e.push(`access[${i}]: unknown field "${k}"`); if (!(isStr(a.url) && /^https?:\/\//.test(a.url))) e.push(`access[${i}].url: http(s)://… required`); if (!isStr(a.login)) e.push(`access[${i}].login: required`); if (!isStr(a.password) && !isStr(a.secretRef, 3)) e.push(`access[${i}]: password (test stand) or secretRef (live host: where the secret lives) required`); }); }
  if ('notes' in r && (!Array.isArray(r.notes) || r.notes.length > 10 || r.notes.some(n => !isStr(n, 1, 240)))) e.push('notes: array of ≤10 strings ≤240 chars');
  return e;
}
export function readReport(file) {
  if (!fs.existsSync(file)) return null;
  let data; try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { return { file, data: null, errors: ['invalid JSON: ' + err.message] }; }
  return { file, data, errors: validateReport(data) };
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url))) {
  const f = process.argv[2]; if (!f) { console.error('usage: node ui/report-validate.mjs <report.json>'); process.exit(2); }
  const r = readReport(f); if (!r) { console.error(`no such file: ${f}`); process.exit(1); }
  if (r.errors.length) { console.error(`${f}: ${r.errors.length} error(s)\n - ` + r.errors.join('\n - ')); process.exit(1); }
  console.log(`OK ${f}: ${r.data.done.length} done / ${r.data.results.length} results / ${(r.data.access || []).length} access`);
}
