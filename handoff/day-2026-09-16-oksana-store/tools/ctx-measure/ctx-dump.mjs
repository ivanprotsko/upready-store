// Dump every payload of the first prompt turn (system prompt snapshot, CLAUDE.md files, tool/agent listings,
// session context, hooks, user prompt) into <dir>/NN-<label>.txt and print chars per piece.
// usage: node ctx-dump.mjs <transcript.jsonl> <dir>
import fs from 'node:fs';
import readline from 'node:readline';
const [file, dir] = process.argv.slice(2);
fs.mkdirSync(dir, { recursive: true });
const rows = [];
const rl = readline.createInterface({ input: fs.createReadStream(file) });
for await (const line of rl) { if (!line.trim()) continue; try { rows.push(JSON.parse(line)); } catch {} }
const tot = u => (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
const textOf = c => Array.isArray(c) ? c.map(p => p.text || '').join('\n') : String(c || '');
let start = -1;
for (let i = 0; i < rows.length; i++) {
  const r = rows[i]; if (r.type !== 'user' || r.isMeta) continue;
  const t = textOf(r.message?.content).trim();
  if (/^<local-command-caveat>|^<command-name>/.test(t)) continue;
  start = i; break;
}
let end = start + 1; while (end < rows.length && !(rows[end].type === 'assistant' && rows[end].message?.usage)) end++;
const u = rows[end]?.message?.usage;
console.log('prompt row', start, rows[start]?.timestamp, 'first assistant row', end, 'TOTAL_IN=', u ? tot(u) : null, u ? `cr=${u.cache_creation_input_tokens} rd=${u.cache_read_input_tokens} in=${u.input_tokens}` : '');
const out = [];
const put = (label, txt) => { if (!txt) return; if (typeof txt !== 'string') txt = JSON.stringify(txt, null, 0); out.push({ label, txt }); };
const ts0 = (rows[start].timestamp || '').slice(0, 16);
for (let i = 0; i < end; i++) {
  const r = rows[i];
  if (i < start && !((r.type === 'attachment') && (r.timestamp || '').slice(0, 16) === ts0)) continue;
  if (r.type === 'user') { put(`user-prompt`, textOf(r.message?.content)); continue; }
  if (r.type !== 'attachment') continue;
  const a = r.attachment || {};
  switch (a.type) {
    case 'prompt_snapshot': put('system-prompt', a.systemPrompt); break;
    case 'instructions': (a.files || []).forEach(f => put(`claude-md ${f.path || f.filename || '?'}`, f.content)); if (!a.files?.length) put('instructions-raw', a); break;
    case 'session_context': put('session-context(SessionStart hooks)', a.context); break;
    case 'deferred_tools_delta': put('deferred-tools-listing', (a.addedLines || []).join('\n')); break;
    case 'agent_listing_delta': put('agent-listing', (a.addedLines || []).join('\n')); break;
    case 'environment': put('environment', a.snapshot); break;
    case 'skill_listing': put('skill-listing', a.content ?? a.text ?? JSON.stringify(a)); break;
    case 'hook_additional_context': put(`hook-ctx ${a.hookEvent || ''}`, Array.isArray(a.content) ? a.content.join('\n') : (a.content ?? a.additionalContext ?? JSON.stringify(a))); break;
    case 'hook_system_message': put(`hook-msg ${a.hookEvent || ''}`, a.content ?? JSON.stringify(a)); break;
    case 'model': put('model-attachment', a.content ?? JSON.stringify(a)); break;
    case 'total_tokens_reminder': put('total-tokens-reminder', a.content ?? JSON.stringify(a)); break;
    case 'date': put('date', a.date); break;
    case 'remote_session_change': put('remote-session-change', a); break;
    case 'workflow_keyword_request': put('workflow-keyword-request', a); break;
    case 'auto_mode': put('auto-mode', a); break;
    case 'language': put('language', a.language); break;
    default: put(`other:${a.type}`, a);
  }
}
let n = 0, sum = 0;
for (const p of out) {
  const fn = `${dir}/${String(n).padStart(2, '0')}-${p.label.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60)}.txt`;
  fs.writeFileSync(fn, p.txt); sum += p.txt.length; n++;
  console.log(`  ${String(p.txt.length).padStart(7)} chars  ${p.label}`);
}
console.log('pieces', n, 'total chars', sum);
