// Break down the first prompt turn of a transcript: attachments + user message, chars per piece.
// usage: node ctx-sections.mjs <transcript.jsonl> [--dump <dir>]  (dumps each piece to <dir>/piece-NN.txt)
import fs from 'node:fs';
import readline from 'node:readline';
const file = process.argv[2];
const dumpIdx = process.argv.indexOf('--dump');
const dumpDir = dumpIdx > 0 ? process.argv[dumpIdx + 1] : null;
if (dumpDir) fs.mkdirSync(dumpDir, { recursive: true });
const rows = [];
const rl = readline.createInterface({ input: fs.createReadStream(file) });
for await (const line of rl) { if (!line.trim()) continue; try { rows.push(JSON.parse(line)); } catch {} }
const tot = u => (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
const textOf = c => Array.isArray(c) ? c.map(p => p.text || '').join('\n') : String(c || '');
// find first real user prompt: a user row whose text is not a local-command / caveat, and the first assistant after it
let start = -1;
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  if (r.type !== 'user') continue;
  const t = textOf(r.message?.content);
  if (/^<local-command-caveat>|^<command-name>/.test(t.trim())) continue;
  if (r.isMeta) continue;
  start = i; break;
}
if (start < 0) { console.log('no user prompt'); process.exit(0); }
let end = start + 1; while (end < rows.length && !(rows[end].type === 'assistant' && rows[end].message?.usage)) end++;
console.log('file:', file.split('/').pop(), 'prompt row', start, 'ts', rows[start].timestamp, '-> first assistant row', end);
if (rows[end]) { const u = rows[end].message.usage; console.log('FIRST-TURN usage: TOTAL_IN=', tot(u), JSON.stringify(u).slice(0, 200)); }
let n = 0, sum = 0;
const pieces = [];
// also include attachments BEFORE the prompt row that belong to the same turn (same timestamp second)
const ts0 = (rows[start].timestamp || '').slice(0, 16);
for (let i = 0; i < end; i++) {
  const r = rows[i];
  if (i < start && !(r.type === 'attachment' && (r.timestamp || '').slice(0, 16) === ts0)) continue;
  let label = r.type, txt = '';
  if (r.type === 'attachment') {
    const a = r.attachment || {};
    label = `attachment/${a.type || '?'}`;
    txt = a.content ?? a.text ?? a.stdout ?? a.additionalContext ?? '';
    if (typeof txt !== 'string') txt = JSON.stringify(txt);
    if (a.filename) label += ` ${a.filename}`;
    if (a.hookName) label += ` hook=${a.hookName}`;
    if (a.hookEvent) label += ` ev=${a.hookEvent}`;
  } else if (r.type === 'user') {
    txt = textOf(r.message?.content);
    label = 'user' + (r.isMeta ? '(meta)' : '');
  } else { txt = ''; }
  if (!txt) { console.log(`  row ${i} ${label} (no text; keys=${Object.keys(r.attachment || r).slice(0, 8).join(',')})`); continue; }
  pieces.push({ i, label, txt });
  sum += txt.length; n++;
  console.log(`  row ${i} ${label} chars=${txt.length} :: ${txt.trim().slice(0, 100).replace(/\s+/g, ' ')}`);
  if (dumpDir) fs.writeFileSync(`${dumpDir}/piece-${String(i).padStart(3, '0')}.txt`, txt);
}
console.log('pieces', n, 'total chars', sum);
