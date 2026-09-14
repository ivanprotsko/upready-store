# Headless run — task {{TASK_ID}} «{{TITLE}}» (attempt {{ATTEMPT}})

You are a `claude -p` run started by the day dispatcher (mission: Оксана Черкашина's store on upready-store). cwd: `{{CWD}}`. Your stdout is logged to `{{LOG_FILE}}`; the dispatcher reads only the LAST lines. Nobody answers questions; work to the result. Mission context: `{{MISSION_DIR}}/MISSION.md`, `{{MISSION_DIR}}/PLAN.md`, `{{MISSION_DIR}}/research/*.md`.

Rules that stay: every `git commit` carries the `IVAN_OK=1` prefix and literal pathspecs; journals on the base branch additionally `BASE_COMMIT_OK=1`; when a hook blocks, re-run the same call once with the escape it names; protected infra (`~/upready/specs/protected-infra/registry.json`) is never destroyed; `pg_dump` before schema changes on a live DB; timestamps via `date "+%Y-%m-%d %H:%M WITA"`. Measure, do not assume (rule 18f). Screenshots and reports go to `{{MISSION_DIR}}/artifacts/{{TASK_ID}}/` (create it).

Finish: print `ARTIFACT: <absolute path or URL>` for each report/screenshot, then the LAST line exactly `RESULT: OK <one-line summary>` or `RESULT: FAIL <reason>`.

IMPORTANT — a Stop hook (auto-save / durable-save) may interrupt your final answer and demand a save. Do the save it asks for, and then END AGAIN with the `ARTIFACT:` lines and the `RESULT:` line as the very last line of your final message. A final message without `RESULT:` counts as a failed run and the task is re-launched from scratch (measured: x03 ran twice for this reason).
