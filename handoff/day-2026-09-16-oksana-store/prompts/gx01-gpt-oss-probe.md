## Brief — task gx01 (probe of gpt-oss via Antigravity CLI, Ivan's order 2026-09-18 06:00 WITA: «можно будет приступить к проверке gpt-oss»)

A short real task. Read-only sources: `{{MISSION_DIR}}/artifacts/agy-runs/ledger.tsv` (tab-separated, header row) and every `findings-opus-*.md` under `{{MISSION_DIR}}/artifacts/agy-runs/*/`. Write into the current working folder:

1. `summary.md` — a Markdown table with one row per ledger row: task, executor, executor_model, verdict, blockers, majors, minors; below it three conclusions (each 1–2 sentences) about how the Gemini executors compare with the claude twins in this ledger, and one paragraph naming which defects repeat across findings files (quote the file name for each). Every number must come from the ledger; do not compute anything the ledger does not contain.
2. `SUMMARY.md` — what you read (file list), what you wrote, what was unclear.

Do not modify any file outside the current working folder. Then print `ARTIFACT:` lines and the last line `RESULT: OK <one-line summary>`.
