// Measure context load from Claude Code transcripts (jsonl).
// usage: node ctx-measure.mjs <transcript.jsonl> [--sections]
import fs from 'node:fs';
import readline from 'node:readline';

const file = process.argv[2];
const wantSections = process.argv.includes('--sections');
const rl = readline.createInterface({ input: fs.createReadStream(file) });

const rows = [];
for await (const line of rl) {
  if (!line.trim()) continue;
  let o; try { o = JSON.parse(line); } catch { continue; }
  rows.push(o);
}

const total = (u) => (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);

// first assistant usage
let firstAsst = null, firstUser = null;
const compactions = [];
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  if (r.type === 'user' && !firstUser) firstUser = { i, r };
  if (r.type === 'assistant' && r.message?.usage && !firstAsst) firstAsst = { i, r };
  if (r.isCompactSummary || (r.type === 'user' && typeof r.message?.content === 'string' && r.message.content.startsWith('This session is being continued'))) {
    // find next assistant with usage
    let j = i + 1; while (j < rows.length && !(rows[j].type === 'assistant' && rows[j].message?.usage)) j++;
    const u = rows[j]?.message?.usage;
    const summaryText = typeof r.message?.content === 'string' ? r.message.content : JSON.stringify(r.message?.content || '');
    compactions.push({ i, ts: r.timestamp, summaryChars: summaryText.length, afterTotal: u ? total(u) : null, afterUsage: u || null });
  }
}
// last assistant usage before end
let lastAsst = null;
for (let i = rows.length - 1; i >= 0; i--) if (rows[i].type === 'assistant' && rows[i].message?.usage) { lastAsst = rows[i]; break; }

console.log('file:', file);
console.log('rows:', rows.length, 'first ts:', rows[0]?.timestamp, 'last ts:', rows[rows.length - 1]?.timestamp);
if (firstAsst) {
  const u = firstAsst.r.message.usage;
  console.log('FIRST assistant usage:', JSON.stringify(u), 'TOTAL_IN=', total(u), 'model=', firstAsst.r.message.model);
}
if (lastAsst) {
  const u = lastAsst.message.usage;
  console.log('LAST assistant usage:', JSON.stringify(u), 'TOTAL_IN=', total(u));
}
console.log('compactions:', compactions.length);
for (const c of compactions) console.log('  ', c.ts, 'summaryChars=', c.summaryChars, 'afterTotal=', c.afterTotal, c.afterUsage ? JSON.stringify(c.afterUsage) : '');

if (wantSections && firstUser) {
  // break down the first user message content by system-reminder sections
  const content = firstUser.r.message.content;
  const parts = Array.isArray(content) ? content.map(p => p.text || '').filter(Boolean) : [String(content)];
  const text = parts.join('\n');
  console.log('FIRST user message chars:', text.length);
  // split by <system-reminder> blocks
  const re = /<system-reminder>([\s\S]*?)<\/system-reminder>/g;
  let m, idx = 0, covered = 0;
  while ((m = re.exec(text))) {
    const body = m[1];
    const head = body.trim().slice(0, 90).replace(/\s+/g, ' ');
    console.log(`  [sr ${idx++}] chars=${body.length} :: ${head}`);
    covered += m[0].length;
    // sub-sections inside: 'Contents of ' files
    const fre = /Contents of ([^\n]+?):\n([\s\S]*?)(?=\nContents of |$)/g;
    let fm; while ((fm = fre.exec(body))) console.log(`      file ${fm[1].trim()} chars=${fm[2].length}`);
  }
  console.log('  outside system-reminders chars=', text.length - covered);
  // hook additional contexts appear in later user rows with same parentUuid? print any 'hook' rows at start
  for (let i = firstUser.i + 1; i < Math.min(rows.length, firstUser.i + 6); i++) {
    const r = rows[i];
    if (r.type === 'user') {
      const c = r.message?.content; const t = Array.isArray(c) ? c.map(p => p.text || '').join('') : String(c || '');
      console.log(`  next user row ${i} chars=${t.length} head=${t.slice(0, 80).replace(/\s+/g, ' ')}`);
    }
  }
}
