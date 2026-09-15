import fs from 'node:fs';
const SENT = '@@PIPE@@';
const src = fs.readFileSync('/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/research/gap-matrix.md', 'utf8');
const rows = [];
for (const raw of src.split('\n')) {
  if (!raw.startsWith('|')) continue;
  let inTick = false;
  const line = [...raw].map(ch => { if (ch === '`') inTick = !inTick; return (ch === '|' && inTick) ? SENT : ch; }).join('');
  const c = line.split('|').slice(1, -1).map(s => s.trim().split(SENT).join('|'));
  if (c.length !== 7) { if (c.length > 1) console.error('BADCOLS', c.length, c[0]); continue; }
  if (c[0] === 'id' || /^-+$/.test(c[0])) continue;
  rows.push({ id: c[0], cat: c[1], fn: c[2], morning: c[3], why: c[4], need: c[5], task: c[6] });
}
console.log('rows', rows.length);
const by = {}; for (const r of rows) by[r.morning] = (by[r.morning] || 0) + 1;
console.log('morning', JSON.stringify(by));
const crit = rows.filter(r => /^критично/.test(r.need));
const cby = {}; for (const r of crit) cby[r.morning] = (cby[r.morning] || 0) + 1;
console.log('critical', crit.length, JSON.stringify(cby));
console.log(crit.map(r => r.id + ' [' + r.morning + '] ' + r.task).join('\n'));
fs.writeFileSync('/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/q03-gap-recheck/raw/matrix-rows.json', JSON.stringify(rows, null, 1));
