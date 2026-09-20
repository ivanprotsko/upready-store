## Brief — task g01-store-glossary (pair design m04: execution by gemini-3.8-flash-high via agy)

Full brief: read `{{MISSION_DIR}}/prompts/g01-store-glossary.md` first. It was written for a claude worker with git access — follow its SUBSTANCE and IGNORE everything in it about branches, worktrees, commits, PRs, HANDOFF/handoff.mjs, resume blocks, hooks/escapes and Superset: this run has no git and writes no journals. Where the brief names an output path (a report under `~/upready/research/reports/`, files under `artifacts/…`, `glossary/…`), write the SAME relative layout inside the current working folder instead (`{{CWD}}/reports/…`, `{{CWD}}/artifacts/…`, `{{CWD}}/glossary/…`); downloaded or copied sources go to `{{CWD}}/raw/`. An acceptor (another model) will diff this folder against the brief and move accepted files into the canon — nothing written here is final, so never write into the repository, into `~/upready/research/` or into other projects.

Acceptance the acceptor will check: glossary/index.md и ≥40 записей со всеми полями, «где используется» ведёт на существующий путь; glossary/check.mjs зелёный; в PR таблица 10 расхождений подписей панели

Also write `{{CWD}}/SUMMARY.md`: what was done, the deliverables with relative paths, what could not be done and why, every source used (path or URL).
