# Тексты портфолио upready.dev: кейсы проектов (pf01)

Задача {{TASK_ID}}. cwd `{{CWD}}` — сайт upready.dev (Next.js). Нужны тексты раздела портфолио: кейсы того, что студия реально построила. Целевая аудитория — нетехнические основатели 35–45 из США/ЕС (см. `/Users/ivanprotsko/.claude/CLAUDE.md`, первая строка); язык — английский с русской версией каждого текста.

## Источники фактов (только они, цифр из головы не брать)
- `/Users/ivanprotsko/upready/memory/` — файлы проектов (upready-store, cherkashino, agent-creatr, unsubbed.co, envoicer, l2mammon, market-intel и др.; начни с `knowledge-index.md`);
- `HANDOFF.json` и `handoff/` в каталогах `/Users/ivanprotsko/upready/projects/<проект>/` — что сделано и когда;
- живые сайты (только GET, только чтобы описать, что видно): upready.dev, cherkashino.shipshift.dev, panel-store.upready.dev, unsubbed.co.
Если факта нет в источниках — в тексте его нет; никаких «увеличили конверсию на N %» без замера, на который можно сослаться.

## Результат
- `{{CWD}}/artifacts/portfolio-texts/<дата>/cases.md`: 6–8 кейсов, каждый — заголовок, проблема клиента, что построено (2–4 абзаца), результат (только измеренное, с источником), стек, срок, ссылка; EN и RU;
- `{{CWD}}/artifacts/portfolio-texts/<дата>/sources.md`: для каждого кейса — список файлов/URL, откуда взят каждый факт;
- существующую структуру сайта (`app/`, `content/`) НЕ менять — только тексты в artifacts; вёрстку делает отдельная задача после отбора Иваном.
- Ничего не коммитить, никуда не публиковать.

Приёмка: {{ACCEPTANCE}}. Последняя строка — `RESULT: OK <путь cases.md>` или `RESULT: FAIL <причина>`.
