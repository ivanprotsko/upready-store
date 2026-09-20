# Отчёт штаба за ночь 2026-09-18 (заказ Ивана 06:00 WITA, отчёт написан 2026-09-18 08:42 WITA)

Заказ 06:00 WITA (дословно в INTAKE.md, раздел «Сообщение Ивана от 2026-09-18 06:00 WITA»): выяснить всё про gemini, сделать всё обсуждённое на примере реальных задач силами агентов «не ниже opus» и любыми gemini, затем при возможности проверить gpt-oss, работать автономно до результата. Волна закрыта 07:53 WITA: очередь дня в DONE, диспетчер вышел, задач не идёт. Ниже — что сделано, что принято, что не вышло и что решать Ивану.

## 1. Итог одной строкой

Парный дизайн m04 прошёл на четырёх реальных задачах бэклога плюс глоссарий: gemini ни разу не прошёл приёмку сам (5 из 5 REJECT), claude-двойники приняты по трём задачам (o01, pf01, e01), по pf02 результата нет ни у кого, глоссарий g01 смёржен в dev через PR #104 на черновике gemini. gpt-oss недоступен на стороне сервера (503 дважды). Первые пять gemini-прогонов шли с неверной преамбулой по вине штаба (движок), поэтому чистый замер модели один: pf02 на flash, без утечек.

## 2. Смёржено и сделано за ночь

| Задача | Итог | Где смотреть |
|---|---|---|
| pp01 pre-pr + этап 0 приёмки | PR #103 MERGED 06:42 WITA (по GitHub) | file:///Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/pre-pr.sh и accept-stage0.sh |
| g01 глоссарий магазина | PR #104 MERGED 07:35 WITA, 48 файлов в glossary/ | file:///Users/ivanprotsko/upready/projects/upready-store/glossary/index.md |
| ag01 возможности Antigravity/Gemini | done (opus) | file:///Users/ivanprotsko/upready/research/reports/2026-09-18-antigravity-gemini-capabilities.md |
| kb01 реестр дефектов | done (opus) | file:///Users/ivanprotsko/upready/specs/defect-registry/README.md |
| m05 внешние каталоги моделей | done (opus), 55 каталогов / 16 классов | file:///Users/ivanprotsko/upready/research/reports/2026-09-18-m05-external-catalogs.md |
| be01 план стенда бенчмарка | done (sonnet) | file:///Users/ivanprotsko/upready/research/reports/2026-09-18-be01-bench-env-plan.md |

Содержимое pre-pr.sh, accept-stage0.sh и glossary/ штаб сам не читал: приняты приёмщиками (PR #103 и #104), качество не перепроверено.

## 3. Пары m04: gemini против claude-двойника

Схема: `<id>-gem` (agy, одноразовая папка artifacts/agy-runs/<id>-gem/) → приёмка 1 (этап 0 «писал ли вне cwd», факты по ≥3 источникам, findings-opus-1.md) → при REJECT двойник claude → приёмка 2. Цифры блокеры/major/minor из ledger.tsv.

| Пара | gemini | Приёмка 1 | Двойник claude | Приёмка 2 | Итог |
|---|---|---|---|---|---|
| o01 инструкция по ключу Ozon | gemini-3.1-pro-high, 240 с | REJECT 1/3/3 (блокер «вне cwd» — движок, см. п. 4) | opus, 799 с | ACCEPT 0/0/1 | принят двойник |
| pf01 тексты портфолио upready.dev | gemini-3.8-flash-high, 248 с | REJECT 1/4/4 (блокер — движок) | sonnet, 373 с | ACCEPT 0/1/1 | принят двойник |
| e01 auth по email и телефону | flash, 555 с | REJECT 2/5/3 (один блокер — движок) | opus, 1723 с | REJECT 1/0/0 (единственный блокер машинный — конфликт преамбул) | принят штабом с оговоркой |
| pf02 тексты портфолио ivanprotsko.com | flash, attempt 2 с новой преамбулой, 187 с | REJECT 0/2/2 (придуманная гарантия возврата; сроки) | sonnet, 421 с | REJECT 2/1/1 (машинный блокер + деанонимизация клиента) | результата нет |
| g01 глоссарий | flash, 357 с | REJECT 2/4/3 (блокеры — движок) | build-задача g01 (sonnet, workspace) на черновике gemini | PR #104 приёмка раунд 1 → MERGED | глоссарий в dev |

Что это значит по существу (не по цифрам): содержательные дефекты gemini в силе у всех пяти прогонов даже без блокера движка — выдуманные факты (гарантия возврата в pf02 там, где источник говорит «не решено»), неполные ответы на вопросы брифа, слабые ссылки на источники. Полные разборы: findings-opus-N.md в папках file:///Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/agy-runs/ и ledger file:///Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/agy-runs/ledger.tsv.

Принятые результаты:
- o01: file:///Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/o01-ozon-key-instruction/index.html (плюс README.md, report.md, shots/). Публикация в artifacts/docs через PR — по слову Ивана.
- pf01: file:///Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/pf01-upready-dev-portfolio-texts/README.md и portfolio-texts/. Отбор текстов — за Иваном.
- e01: file:///Users/ivanprotsko/upready/research/reports/2026-09-18-e01-email-and-phone-auth-research.md (388 строк, оговорка в шапке) и сырьё 61 файл в file:///Users/ivanprotsko/upready/research/raw/e01-email-and-phone-auth-research/.
- pf02: принятого варианта нет. Приёмщик pf02-acc2 записал в память класс «активный клиент миссии (Оксана, olavka.ru) использован как публичный кейс без согласия» (коммит memory c6ae484). Что делать с двумя отклонёнными вариантами — решает Иван.

## 4. Ошибки штаба и движка (честно)

1. Живой диспетчер не перечитывает lib.mjs (ESM грузится один раз): патч преамбулы для agy лёг в 07:00, а диспетчер pid 6650 стоял с 06:02, поэтому первые пять gemini-прогонов ушли с claude-преамбулой «reports go to artifacts/<task-id>/». Блокер «запись вне cwd» у o01/g01/e01/pf01 раунда 1 — исполнение приказа штаба, не утечка модели. Штаб сначала приписал это модели Pro (память исправлена «ПОПРАВКОЙ»). Перезапуск 07:17, pid 29119. ai-err aie-20260918-071908-4c62.
2. Перезапуск через run.sh в foreground упёрся в `superset start`, таймаут 2 мин убил группу вместе с новым диспетчером. Лечение: отвязанный запуск (`&!`), зафиксировано в правилах.
3. Коммит 25b5c0b1 с pathspec через переменную вместо литералов (aie-20260918-070329-f12c) — впредь литералы одной строкой.
4. Конфликт преамбул для claude-двойников: `_run-preamble.md` строка 18 велит писать report.json в `{{MISSION_DIR}}/artifacts/{{TASK_ID}}/`, обёртка `<id>-opus.md` это запрещает. Итог — машинный блокер у pf02-opus и e01-opus. Дефект дизайна промпта штаба, не модели; не чинился (волна закрыта). Чинить перед любыми новыми двойниками.
5. Колонка acceptor_model в ledger частично неверна (приёмщик писал «opus» из промпта после перевода на sonnet); истина — state.json `tasks[<id>-acc].run.model`. Промпты не запущенных приёмок исправлены на `{{MODEL}}`.
6. Прибор квоты: диспетчер пишет `run.quotaAfter` для agy только на ветке без строки RESULT (dispatcher.mjs:222–227), поэтому у пяти успешных gemini-прогонов конца замера нет и дельта квоты за прогон не считается (заметил и воркер e01-acc2). Фикс — вынести замер перед `if (!last …)`; не сделан, движок в DONE.
7. dispatcher.mjs:242 — `last.slice` при финале по маркеру auto-save (`last === null`): monitor-error у e01-acc2 в 07:50, статус done записался, заметка нет. Одна строка (`last?.slice`), не чинилась.
8. `--sandbox` у agy не изолирует: cwd подменяется на ~/.gemini/antigravity-cli/scratch/, запись по абсолютному пути наружу проходит (замер 07:11). Изоляция — только этап 0 приёмки и одноразовая папка.

## 5. Квота Antigravity (agy -p "/usage")

| Момент WITA | Gemini 5 ч | Gemini неделя | Claude+GPT 5 ч | Claude+GPT неделя |
|---|---|---|---|---|
| 03:34 после сброса | 100 % | 99 % | 91 % | 97 % |
| 07:01 старт e01/o01/g01 | 86–87 % | — | — | — |
| 07:13 старт pf01 | 65 % | — | — | — |
| 07:19 старт pf02 (attempt 2) | 56 % | — | — | — |
| 07:47 проба gpt-oss | — | — | 100 % | — |
| 08:38 после сброса 08:34 | 100 % | 91 % | 100 % | 96 % |

Ночь стоила 8 % недельного пула Gemini и не меньше 44 % пятичасового за 20 минут пяти параллельных прогонов (конец пятичасового замера не записан, п. 4.6). Токены по JSON agy (поле tokens_total, за прогон): o01 212 518; g01 581 711; e01 944 288; pf01 606 994; pf02 732 542. Сбросы пятичасового пула Gemini: 03:34 / 08:34 / 13:34 / 18:34 / 23:34 WITA; Claude+GPT — 12:46 WITA. Недельный сброс 24.09 (Gemini 22:34 WITA, Claude+GPT 01:23 WITA 25.09).

## 6. gpt-oss

Единственный id в `agy models` — gpt-oss-120b-medium. Проба gx01 07:46 и 07:47 WITA: «UNAVAILABLE (code 503): No capacity available for model gpt-oss-120b-medium on the server» за 2,9 с при пуле Claude+GPT 100 %. То же было ~05:55. Вывод: недоступен по ёмкости сервера, не по квоте; проверять нечего, пока сервер не даст модель. Приёмка gx01-acc заблокирована провалом зависимости.

## 7. Чужие изменения в чекауте

apps/storefront/src/lib/profile/profile.generated.json и apps/storefront/src/lib/theme/fonts.generated.ts изменены 17.09 01:43 WITA не штабом и не воркерами дня; не трогались, не коммитились. Стоят в git status как M.

## 8. Режим моделей — нужен ответ

Запись 06:00 говорит «силами агентов не ниже opus», вопрос Ивана 07:18 — «разве мы не договорились что используем только sonnet и любые модели gemini?». Штаб по 06:00 запустил на opus: ag01, pp01, kb01, приёмки раунда 1 (g01/e01/o01/pf01), двойники o01 и e01. После 07:18 все не начатые задачи и cfg.acceptor переведены на sonnet; шедшие opus-прогоны дошли до результата сами (снимать их Иван не велел). Вопрос: была ли в 06:00 опечатка, и режим на дальше — sonnet + gemini (сейчас так и настроено).

## 9. Открытые вопросы Ивану

1. Режим моделей (п. 8).
2. Брать ли тесты, написанные gemini в ag01, в движок как есть.
3. pf02: что делать с двумя отклонёнными вариантами; публиковать ли o01 HTML в artifacts/docs; отбор текстов pf01.
4. Входит ли gpt-oss в план при 503 (п. 6).
5. Держится ли якорь пятичасового цикла agy после недельного сброса 24.09 — проверить 25.09.
6. Бэклог (8 задач) в работу только по слову Ивана: m01–m04 (ландшафт моделей, подписка против API, локальные open-source на M1, план оценки) и четыре исходных определения o01/e01/pf01/pf02, которые парная волна уже закрыла. Заблокированы Иваном или внешним: b16, q04, y01, r03-requisites, p03, s01, r04, k01.
7. Superset host в 07:16 отвечал «not healthy» и был поднят `superset start`; состояние после этого не проверялось.

## 10. Оговорка про /compact

Заказ 06:00 просил регулярно делать /compact. Штаб этого не может: команду вызывает только Иван. Компенсация: каждый шаг с записью на диск (HANDOFF, resume-блоки, коммиты журналов), чтобы любое сжатие ничего не теряло; за ночь Иван вызвал /compact один раз (08:28).

## Где что лежит

- Журнал приказов: file:///Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/INTAKE.md
- Пометки движка по парам: file:///Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/agy-runs/ENGINE-NOTE-preamble.md
- Память об agy: file:///Users/ivanprotsko/upready/memory/antigravity-cli-agy-2026-09-17.md и file:///Users/ivanprotsko/upready/memory/agy-writes-outside-cwd.md
- Замер квоты 08:38: file:///private/tmp/claude-502/-Users-ivanprotsko-upready-projects-upready-store/7b183b97-230b-4135-9e71-8e70a24a1a36/scratchpad/agy-print-usage-0838.txt
- UI очереди: http://localhost:5390
