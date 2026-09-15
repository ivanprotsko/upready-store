import fs from 'node:fs';
import { OVR } from './overrides.mjs';
const ROOT = '/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/q03-gap-recheck';
const rows = JSON.parse(fs.readFileSync(ROOT + '/raw/matrix-rows.json', 'utf8'));
const missing = Object.keys(OVR).filter(k => !rows.some(r => r.id === k));
if (missing.length) { console.error('НЕТ ТАКИХ СТРОК В МАТРИЦЕ:', missing); process.exit(1); }
const cnt = (arr, f) => { const c = { 'есть': 0, 'частично': 0, 'нет': 0, 'не применимо': 0 }; for (const r of arr) c[f(r)]++; return c; };
const evening = r => (OVR[r.id] ? OVR[r.id][0] : r.morning);
const crit = rows.filter(r => /^критично/.test(r.need));
const stats = {
  all: { n: rows.length, morning: cnt(rows, r => r.morning), evening: cnt(rows, evening) },
  crit: { n: crit.length, morning: cnt(crit, r => r.morning), evening: cnt(crit, evening) },
  changed: rows.filter(r => OVR[r.id] && OVR[r.id][0] !== r.morning).map(r => `${r.id}: ${r.morning} → ${OVR[r.id][0]}`),
  measuredNoChange: rows.filter(r => OVR[r.id] && OVR[r.id][0] === r.morning).map(r => r.id),
};
fs.writeFileSync(ROOT + '/raw/stats.json', JSON.stringify(stats, null, 1));
console.log(JSON.stringify(stats.all)); console.log(JSON.stringify(stats.crit));
console.log('изменилось:', stats.changed.length); console.log(stats.changed.join('\n'));
// таблица
const lines = ['| id | функция | утром | вечером | доказательство | задача |', '|---|---|---|---|---|---|'];
for (const r of rows) {
  const o = OVR[r.id];
  lines.push(`| ${r.id} | ${r.fn} | ${r.morning} | ${o ? o[0] : r.morning} | ${o ? o[1] : ''} | ${r.task} |`);
}
fs.writeFileSync(ROOT + '/raw/table.md', lines.join('\n'));
console.log('table rows', lines.length - 2);
