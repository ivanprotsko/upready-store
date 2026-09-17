# Реестр дефектов приёмки с атрибуцией (kb01)

Задача {{TASK_ID}} — идея Ивана 2026-09-18 05:14 WITA, п. 3 (реестр найденных проблем: пример, описание, паттерн, правила для будущего приёмщика; приоритет по частоте; фильтр по контексту — фреймворк, стек, технология, тип файла, feature), п. 3.1.1 (собрать и изучить наши логи скриптами) и заказ 05:36 п. 2.1, дословно: «если после merge будут находится ошибки, кто бы их не нашел - неважно, но нужно проверять кто, когда и в какой ветке писал этот код, чтобы зафиксировать допущенную ошибку постфактум приёмки, иначе не найденные ошибки, но существующие будут зачисляться как отсутствующие в рейтинге той или иной модели».

## Источники (только они, ничего из памяти)
- Находки приёмки дня: `{{MISSION_DIR}}/logs/accept-*.findings.md` (34 раунда, 22 отклонения); вердикты и модели — `{{MISSION_DIR}}/state.json` (`tasks.<id>.acceptance[]`, `pr`, `model`/`effort` исполнителя в `{{MISSION_DIR}}/tasks.json`, приёмщик — `cfg.acceptor` на момент раунда: до 2026-09-18 05:5x opus/medium, после — sonnet/medium); журнал событий `{{MISSION_DIR}}/logs/dispatcher.jsonl`.
- Дефекты после мержа: отчёты q01–q03 в `{{MISSION_DIR}}/artifacts/q01*/`, `q02*/`, `q03*/` (проверь имена папок через ls) и находки в `{{MISSION_DIR}}/REPORT.md`.
- Фаза 2 (старые проекты, точность ниже — помечать `confidence: low`): стенограммы `~/.claude/projects/*/*.jsonl` (реплики Ивана с претензией после результата: «не работает», «сломал», «опять», «почему», «я же просил»), fix-коммиты в git-истории репозиториев `~/upready/projects/*` (`git log --grep='fix' --format=...` после feature-коммитов), журнал `node ~/upready/.ai/scripts/ai-err.mjs list` (посмотри `--help`), `~/upready/memory/aiBugs.md`, Q&A индекс (`node ~/upready/.ai/scripts/qa.mjs search <слово>`). Ограничь фазу 2 объёмом: не более 60 минут, выборка, а не полный проход; итог — отдельный раздел отчёта с числами и примерами.

## Где живёт результат
Сначала прочитай `~/upready/specs/storage-registry/PROJECT-SESSION-ORDER.md` и реестр хранилищ там же; реестр дефектов — общий актив всех проектов, значит место выбирается по этому реестру (ожидаемо `~/upready/specs/defect-registry/` или то, что реестр предписывает для «registries = JSON»). Правило 18b: реестр — JSON, не markdown. Внутри: `registry.json`, `schema.json`, `scripts/extract.mjs`, `scripts/attribute.mjs`, `scripts/for-diff.mjs`, `README.md`.

## Схема записи (одна запись = класс дефекта, не экземпляр)
`id`, `title`, `description`, `pattern` (как распознать: словами + регэксп/команда, если ловится скриптом), `detection: "script" | "model"`, `detector` (команда или регэксп для script; чек-лист-вопрос для model), `severity`, `frequency` (число раундов/экземпляров), `examples[]` (`findingFile`, `pr`, `task`, `commit`, `quote` ≤ 200 знаков), `tags` (`stack[]`: medusa/nextjs/postgres/playwright/bash…, `area[]`: checkout/shipping/seo/auth/marketplace/i18n/deploy/process…, `fileTypes[]`: ts/tsx/sql/sh/md/json, `feature[]`), `ruleForAcceptor` (одна фраза-проверка), `attribution[]` (см. ниже), `sourceConfidence: high|low`.

## Атрибуция (п. 2.1 Ивана — обязательна)
`scripts/attribute.mjs <file>:<line>` (или `--commit <sha>`): `git blame` в `{{MAIN_CHECKOUT}}` → коммит → ветка (`git branch -r --contains`, имя `feat/day*`) → PR (`gh pr list --state merged --head <ветка> --json number,mergedAt`) → task id (по `branch` в `{{MISSION_DIR}}/tasks.json`) → модель/усилие исполнителя (tasks.json) и модель приёмщика (state.json `acceptance[]` раунда, чей вердикт принял PR; если запись без модели — по cfg.acceptor на дату). Вывод JSON `{file,line,commit,author,date,branch,pr,task,executor:{model,effort},acceptor:{model,effort},rounds}`. Правило зачисления: дефект после мержа → минус автору (исполнителю) И минус приёмщику, принявшему PR; дефект, найденный приёмкой до мержа → минус исполнителю, плюс приёмщику. Прогони атрибуцию на всех дефектах после мержа из q01–q03 и положи результат в `examples[].attribution`.

## Выборка для приёмщика
`scripts/for-diff.mjs --pr <N>` (или `--files a,b,c`): по файлам diff PR (`gh pr diff --name-only`) подобрать записи реестра по `fileTypes`/`stack`/`area` (area — по путям: `apps/backend/src/modules/checkout` → checkout и т.п., таблица соответствий в скрипте), вывести markdown-чек-лист «что проверить» с отсылками к записям, отсортированный по `frequency`. Это то, что войдёт в промпт приёмщика (сам промпт не менять — только скрипт и пример вывода в README).

## Отчёт
`/Users/ivanprotsko/upready/research/reports/$(date +%Y-%m-%d)-kb01-defect-registry.md`: числа (раундов прочитано, классов, экземпляров, script/model), топ-10 классов по частоте, таблица атрибуции дефектов после мержа (задача, исполнитель, приёмщик), фаза 2 с оговорками, что осталось вручную. В README — как пополнять (одна запись на класс; новый экземпляр — в `examples[]` и `frequency++`).

## Правила
Ничего не коммитить; git только на чтение; `gh` только чтение; секреты не читать; таймауты на все внешние вызовы; скрипты на node без зависимостей; каждую цифру отчёта — из прогона скрипта, не из головы.

Приёмка: {{ACCEPTANCE}}. Последняя строка — `RESULT: OK <путь реестра> <путь отчёта>` или `RESULT: FAIL <причина>`.
