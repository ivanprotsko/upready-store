// gen-pair.mjs — парные задачи по дизайну m04 (уточнение Ивана 05:36) для реальных задач бэклога силами gemini (заказ 06:00).
// gemini (agy) → приёмка opus раунд 1 → при REJECT двойник claude/opus → приёмка opus раунд 2. g01: после приёмки всегда запускается build-задача g01-store-glossary (opus, PR).
import fs from 'node:fs'; import path from 'node:path';
const D = '/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store';
const L = await import(path.join(D, 'lib.mjs'));
const cfg = L.loadTasks();
const SPEC = {
  'e01-email-and-phone-auth-research': { model: 'gemini-3.8-flash-high', canon: 'research', twin: true },
  'o01-ozon-key-instruction': { model: 'gemini-3.1-pro-high', canon: 'artifacts', twin: true },
  'pf01-upready-dev-portfolio-texts': { model: 'gemini-3.8-flash-high', canon: 'artifacts', twin: true },
  'pf02-ivanprotsko-com-portfolio-texts': { model: 'gemini-3.1-pro-high', canon: 'artifacts', twin: true },
  'g01-store-glossary': { model: 'gemini-3.8-flash-high', canon: 'g01', twin: false },
};
const RUNS = `${D}/artifacts/agy-runs`;
const brief = (o, who, extraTop) => `## Brief — task ${o.id} (pair design m04: execution by ${who})

${extraTop}Full brief: read \`{{MISSION_DIR}}/prompts/${o.prompt}\` first. It was written for a claude worker with git access — follow its SUBSTANCE and IGNORE everything in it about branches, worktrees, commits, PRs, HANDOFF/handoff.mjs, resume blocks, hooks/escapes and Superset: this run has no git and writes no journals. Where the brief names an output path (a report under \`~/upready/research/reports/\`, files under \`artifacts/…\`, \`glossary/…\`), write the SAME relative layout inside the current working folder instead (\`{{CWD}}/reports/…\`, \`{{CWD}}/artifacts/…\`, \`{{CWD}}/glossary/…\`); downloaded or copied sources go to \`{{CWD}}/raw/\`. An acceptor (another model) will diff this folder against the brief and move accepted files into the canon — nothing written here is final, so never write into the repository, into \`~/upready/research/\` or into other projects.

Acceptance the acceptor will check: ${o.acceptance}

Also write \`{{CWD}}/SUMMARY.md\`: what was done, the deliverables with relative paths, what could not be done and why, every source used (path or URL).
`;
const integrate = (o, execId, round) => ({
  research: `copy the report to \`~/upready/research/reports/$(date +%F)-${o.id}.md\` with a first line «Автор: <executor model> (задача ${execId}), приёмка opus раунд ${round}, $(date '+%Y-%m-%d %H:%M WITA')», and the sources to \`~/upready/research/raw/${o.id}/\``,
  artifacts: `copy the deliverables (keeping their relative layout) to \`{{MISSION_DIR}}/artifacts/${o.id}/\` and write \`README.md\` there naming the executor model, task ${execId} and acceptance round ${round}; Ivan decides on publication (o01: to artifacts/docs via a PR; pf01/pf02: into their sites — never write into \`~/upready/projects/upready.dev\` or \`~/upready/projects/ivanprotsko.com\`)`,
  g01: `leave the draft in place, then run \`node {{MISSION_DIR}}/dispatcher.mjs cmd launch g01-store-glossary\` — the opus build worker takes the accepted draft as its base and ships it through the normal branch/PR route`,
})[SPEC[o.id].canon];
const onReject = (o, round) => round === 1
  ? (SPEC[o.id].twin ? `run \`node {{MISSION_DIR}}/dispatcher.mjs cmd launch ${o.id}-opus\` — the same brief executed by claude/opus (the pair comparison of executors); its acceptance \`${o.id}-acc2\` is already queued behind it` : `run \`node {{MISSION_DIR}}/dispatcher.mjs cmd launch g01-store-glossary\` — the opus build worker starts from your findings and writes its own glossary`)
  : `nothing further — the штаб decides in the morning`;
const acc = (o, execId, execDesc, round) => `## Acceptance of a pair-design run — task ${o.id}, executor ${execDesc}, acceptor opus, round ${round}

You are the acceptor (design m04, Ivan's order 2026-09-18 05:36 WITA; models not below opus per his order 06:00 WITA, so the «same-level» executor of m04 is opus). Executor task: \`${execId}\`; its working folder with deliverables and \`SUMMARY.md\`: \`${RUNS}/${execId}/\`; its log: the highest-numbered \`{{MISSION_DIR}}/logs/${execId}-<N>.log\`; its state: \`{{MISSION_DIR}}/state.json\` → \`tasks["${execId}"]\` (\`run.startedAt\`, and for a Gemini run \`run.agy\`, \`run.quotaBefore\`, \`run.quotaAfter\`). The original brief: \`{{MISSION_DIR}}/prompts/${o.prompt}\`. Acceptance criteria: ${o.acceptance}

Do, in this order:

0. Machine stage. \`ls -R ${RUNS}/${execId}\`; every \`ARTIFACT:\` path printed in the log must exist and lie inside that folder; \`SUMMARY.md\` must exist. Then check the executor wrote nowhere else: \`git -C {{MAIN_CHECKOUT}} status --porcelain\` may show as MODIFIED only \`HANDOFF.json\`, \`handoff/day-2026-09-16-oksana-store/state.json\` and \`handoff/day-2026-09-16-oksana-store/REPORT.md\`; any other tracked file modified, or any file outside \`${RUNS}/${execId}/\` with mtime after \`run.startedAt\` (check \`find {{MAIN_CHECKOUT}} -newer <a file touched at startedAt> -not -path '*/node_modules/*' -not -path '*/.git/*'\` and \`~/.gemini/antigravity-cli/scratch/\`), is the defect «wrote outside cwd» — record every path, do NOT revert or delete anything (the штаб does), verdict REJECT.
1. Substance. Read every deliverable against the brief and the criteria. Verify facts: open at least three cited sources (files or URLs — never dev.wildberries.ru / docs.ozon.ru) and confirm the claims; an unsourced or invented fact (a price, a path, an id that does not exist) is a defect. Rate each defect blocker / major / minor. Check completeness against every numbered item of the brief.
2. Write \`${RUNS}/${execId}/findings-opus-${round}.md\` with sections: \`## Вердикт\` (ACCEPT or REJECT — REJECT when any blocker, or two or more majors, or the machine stage failed), \`## Этап 0\`, \`## Дефекты\` (one per line: severity · where · what · evidence), \`## Что сделано хорошо\`, \`## Замеры для m04\` (from log/state: duration_seconds, num_turns, usage tokens, quota before/after; for a claude run: attempt count and wall time from \`startedAt\`/\`finishedAt\`).
3. Ledger: append ONE tab-separated row to \`${RUNS}/ledger.tsv\` (create it with the header row if missing): \`task	executor	executor_model	acceptor_model	round	verdict	blockers	majors	minors	duration_s	tokens_total	quota_before_pct	quota_after_pct	ts_wita\`.
4. On ACCEPT: ${integrate(o, execId, round)}. Do NOT commit anything (the штаб commits journals in the morning).
   On REJECT: ${onReject(o, round)}.
5. Finish: \`ARTIFACT:\` lines (the findings file and every canon path you wrote), then the last line \`RESULT: OK ACCEPT <summary>\` or \`RESULT: OK REJECT <summary>\` — a REJECT is a successful acceptance run; \`RESULT: FAIL\` only when you could not judge at all.
`;
const tasks = []; const P = path.join(D, 'prompts');
for (const [id, sp] of Object.entries(SPEC)) {
  const o = cfg.tasks.find(t => t.id === id); if (!o) throw new Error('no task ' + id);
  const kind = o.kind === 'build' ? 'research' : (o.kind || 'research');
  fs.mkdirSync(`${RUNS}/${id}-gem`, { recursive: true });
  fs.writeFileSync(path.join(P, `${id}-gem.md`), brief(o, `${sp.model} via agy`, ''));
  fs.writeFileSync(path.join(P, `${id}-acc.md`), acc(o, `${id}-gem`, `${sp.model} via agy`, 1));
  const common = { deps: [], softDeps: [], priority: o.priority, acceptance: o.acceptance, why: 'заказ Ивана 2026-09-18 06:00 WITA (реальные задачи бэклога силами gemini) по парному дизайну m04 (05:36)', source: 'INTAKE.md 06:00', applyTo: o.applyTo || '' };
  tasks.push({ id: `${id}-gem`, title: `[gemini ${sp.model}] ${o.title}`, kind, lane: 'pair', runner: 'agy', model: sp.model, waitOk: true, fallbackModel: 'opus', cwd: `${RUNS}/${id}-gem`, ...common, prompt: `${id}-gem.md`, status: 'queued', maxMin: 60 });
  tasks.push({ id: `${id}-acc`, title: `[приёмка opus, раунд 1] ${o.title}`, kind: 'accept', lane: 'pair', model: 'opus', effort: 'medium', cwd: 'mission', ...common, deps: [`${id}-gem`], prompt: `${id}-acc.md`, status: 'queued', maxMin: 60 });
  if (sp.twin) {
    fs.mkdirSync(`${RUNS}/${id}-opus`, { recursive: true });
    fs.writeFileSync(path.join(P, `${id}-opus.md`), brief(o, 'claude/opus (pair comparison after a REJECT of the Gemini run)', `You are the pair comparison: the same brief was executed by ${sp.model} and rejected by the acceptor. Do NOT open its folder or findings (\`${RUNS}/${id}-gem/\`) — the comparison must be independent. Your working folder \`{{CWD}}\` IS the artifacts folder for this task: write deliverables there (not into \`{{MISSION_DIR}}/artifacts/{{TASK_ID}}/\`) and do not commit anything.\n\n`));
    fs.writeFileSync(path.join(P, `${id}-acc2.md`), acc(o, `${id}-opus`, 'claude/opus (pair comparison)', 2));
    tasks.push({ id: `${id}-opus`, title: `[opus, двойник после REJECT] ${o.title}`, kind, lane: 'pair', model: 'opus', effort: 'medium', cwd: `${RUNS}/${id}-opus`, ...common, prompt: `${id}-opus.md`, status: 'backlog', maxMin: 90 });
    tasks.push({ id: `${id}-acc2`, title: `[приёмка opus, раунд 2] ${o.title}`, kind: 'accept', lane: 'pair', model: 'opus', effort: 'medium', cwd: 'mission', ...common, deps: [`${id}-opus`], prompt: `${id}-acc2.md`, status: 'queued', maxMin: 60 });
  }
}
cfg.lanes.pair = 3; cfg.maxSlots = 6; L.saveTasks(cfg);
fs.writeFileSync(process.argv[2], JSON.stringify(tasks, null, 1));
console.log('prompts + dirs written; tasks', tasks.length, 'lanes', JSON.stringify(cfg.lanes), 'maxSlots', cfg.maxSlots);
