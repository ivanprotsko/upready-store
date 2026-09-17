# Глоссарий upready-store: один словарь для панели, инструкций и воркеров (g01)

Задача {{TASK_ID}}, ветка `{{BRANCH}}` от `{{BASE}}`, PR по правилам преамбулы.

## Зачем
В панели владельца, инструкциях Оксане и промптах воркеров одни и те же сущности называются по-разному (тенант/арендатор/магазин, handle/адрес, sales channel/канал продаж, зеркало WB, dry-run, характеристика/атрибут). Нужен один словарь, из которого берутся подписи экранов (правило 18e: сырой enum на экран не попадает), слова инструкций и термины промптов.

## Стандарт
Читай `/Users/ivanprotsko/upready/memory/glossary-standard-sensediff-terminus.md` (решение Ивана 2026-09-05): `glossary/index.md` + файл на термин с id в имени; одно слово в разных контекстах — разные записи; статус записи `кандидат` / `устоялось`. Каталог: `{{WORKTREE}}/glossary/`.

## Откуда брать термины (только из нашего кода и документов, не выдумывать)
- модели и сервисы `apps/backend/src/modules/**` (tenant, marketplace-write, wb, tenant-secrets, tenant-legal, product attributes, shipping);
- экраны панели `apps/panel` (подписи, меню, статусы) и витрины `apps/storefront` (чекаут, доставка, отзывы);
- документы дня `{{MISSION_DIR}}/INTAKE.md`, `{{MISSION_DIR}}/prompts/*.md`, `artifacts/docs/**` (инструкции для Оксаны, спецификация маркетплейсов w10);
- термины Wildberries/Ozon — из сохранённых копий документации в `artifacts/docs/w10-marketplace-spec/docs/` (на сайты документации не ходить).

## Запись термина (файл `glossary/<id>-<slug>.md`)
id · термин (ru) · идентификатор в коде/UI (en) · короткое определение до 160 знаков · полное определение · где используется (пути файлов или экраны, минимум одно место) · связанные термины · статус · источник.

## Приёмка
- `glossary/index.md` и не меньше 40 записей; у каждой записи все поля, «где используется» ведёт на существующий путь (проверь `test -e`);
- скрипт `glossary/check.mjs` (node, без зависимостей): проверяет схему записей и существование путей, зелёный на твоём наборе; запусти и приложи вывод в PR;
- в PR — таблица «термин → как называется сейчас на экране панели → предложенная подпись» для 10 самых частых расхождений (подписи экранов в этой задаче НЕ менять — это отдельные задачи).
Последняя строка — `RESULT: OK <PR url>` или `RESULT: FAIL <причина>`.

## Парный дизайн m04 (штаб, 2026-09-18 06:00 WITA)

Before writing anything, read `{{MISSION_DIR}}/artifacts/agy-runs/g01-store-glossary-gem/findings-opus-1.md` (acceptance of the Gemini draft) and, when its verdict is ACCEPT, take the draft in that folder (`glossary/…`) as your base: fix every listed defect, verify each entry against the code yourself, then ship through the normal branch/PR route. When the verdict is REJECT, write the glossary yourself using the findings as a list of traps. Either way the PR description names the executor of the draft and what you changed.
