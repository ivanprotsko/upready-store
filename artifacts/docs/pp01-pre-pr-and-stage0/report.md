# pp01 — pre-pr.sh и машинный этап 0 приёмки

Заказ Ивана 2026-09-18 05:36 WITA п. 2 («ничего не понял, но если это может как-то или теоретически улучшить нашу работу, то запускай в работу») и п. 1.1 от 04:53 (каскад приёмки, машинный этап 0). Факт, ради которого задача: за 2026-09-17 из 34 отклонённых раундов приёмки 22 были процессными — ветка отстала от `dev`, конфликт в `HANDOFF.json`, PR `CONFLICTING`, незакоммиченные файлы, — хотя инструкция про merge и лечение конфликта стояла в `_worker-preamble.md` у каждого воркера. Инструкция агенту — не гейт; гейт — код (правило 41).

## Что изменилось (файлы)

- `handoff/day-2026-09-16-oksana-store/pre-pr.sh` (225 строк, bash) — воркер запускает из своего worktree перед `gh pr create` и после каждого push. Шаги: `env` → `fetch` → `dirty` → `merge` → `push` → `ahead` → `pr`, каждый печатает `PRE-PR <шаг>: ok|fail|skip <детали>`, последняя строка `PRE-PR: OK` или `PRE-PR: FAIL <код> <причина>`. Коды: 2 — конфликт вне `HANDOFF.json` (merge прерван, файлы названы), 3 — PR `CONFLICTING`, 4 — незакоммиченные отслеживаемые файлы, 5 — push не долетел или база ушла вперёд после push, 6 — окружение (detached HEAD, запуск на базовой ветке, нет remote, fetch не прошёл).
- `handoff/day-2026-09-16-oksana-store/accept-stage0.sh` (290 строк, bash) — `accept-stage0.sh <task-id> <pr-number> <out-dir>`. Проверки `pr` (не CONFLICTING, не позади базы), `diff`, `forbidden-files` (`HANDOFF.json`, `handoff/*/state.json`, `handoff/*/tasks.json`), `secrets`, `disabled-tests`, `checks:*` (lint/tsc/тесты затронутых пакетов). Пишет `<out-dir>/stage0.json` (`{check, status, details, files[]}` на проверку) и `<out-dir>/stage0.md` (таблица), последняя строка `STAGE0: PASS` либо `STAGE0: FAIL <проваленные>`, rc=1 при любом fail.
- `handoff/day-2026-09-16-oksana-store/stage0-scan.mjs` — разбор unified diff: список файлов, секреты и выключенные тесты по ДОБАВЛЕННЫМ строкам. Вынесен из `.sh` отдельным модулем, чтобы регулярки проверялись поштучно, а не только сквозь end-to-end прогон.
- `handoff/day-2026-09-16-oksana-store/ui/git-fixture.mjs` — временные git-миры для тестов: bare origin с базой `dev`, клон `work` (ветка задачи) и клон `other`, которым тест двигает базу вперёд; плюс шим `gh`, отвечающий заготовленным JSON на `pr view` (можно цепочкой ответов — так моделируется `mergeable=UNKNOWN`) и диффом на `pr diff`.
- `handoff/day-2026-09-16-oksana-store/ui/pre-pr.test.mjs` — 9 сценариев pre-pr.sh на настоящих git-репозиториях.
- `handoff/day-2026-09-16-oksana-store/ui/stage0.test.mjs` — 15 сценариев: 6 поштучных на сканер + 9 end-to-end на скрипт.
- `handoff/day-2026-09-16-oksana-store/prompts/_worker-preamble.md` — текстовая инструкция «слей origin/dev, вылечи CONFLICTING» заменена приказом запускать `pre-pr.sh` перед `gh pr create` и после каждого push; при `PRE-PR: FAIL` PR не создаётся и раунд правок не отдаётся. Секции «HANDOFF.json» и «Push is verified by OID» переписаны на скрипт.
- `handoff/day-2026-09-16-oksana-store/prompts/_acceptor.md` — добавлен шаг 0: первым действием `accept-stage0.sh`, при `STAGE0: FAIL` вердикт `REJECTED` с находками из `stage0.md` БЕЗ чтения кода; отдельной строкой оговорено, что `skip` — это не `pass`.

## Как замерено

Прогон всей сюиты в worktree (это и есть приёмочная команда):

```
$ node --test ui/
ℹ tests 44
ℹ suites 0
ℹ pass 44
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 39439.592583
```

44 = 5 op + 7 report + 8 quota (существующие, не тронуты) + 9 pre-pr + 15 stage0. До правки было 12 (quota и fixtures приехали из `dev` вместе с merge).

Прогон `pre-pr.sh` на СВОЕЙ ветке перед созданием PR (п. «Правила» задачи):

```
$ bash handoff/day-2026-09-16-oksana-store/pre-pr.sh dev
PRE-PR env: ok ветка feat/day18-pre-pr-stage0, база origin/dev, worktree /Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day18-pre-pr-stage0
PRE-PR fetch: ok origin/dev = 7ed86b8d
PRE-PR dirty: ok дерево чистое
PRE-PR merge: ok влито 2 коммит(ов) из origin/dev
PRE-PR push: ok origin/feat/day18-pre-pr-stage0 = b6fea8d0a9674990f3ff955b4d0797a20aec54e9
PRE-PR ahead: ok HEAD..origin/dev = 0
PRE-PR pr: ok PR ещё нет — создавай (no pull requests found for branch "feat/day18-pre-pr-stage0")
PRE-PR: OK
rc=0
```

Скрипт сам влил две чужих задачи из `dev` (включая `ui/quota.test.mjs`), после чего сюита прогнана заново — 44/44.

Что именно проверяют тесты (каждый сценарий — реальный отказ раунда приёмки, а не выдумка):

| сценарий | ожидание | проверено |
|---|---|---|
| ветка актуальна, PR ещё нет | rc=0, `PRE-PR: OK` | OID в bare origin равен `git rev-parse HEAD` в клоне |
| ветка отстала, merge чистый | rc=0, `merge: ok влито 1` | файл из базы физически появился в ветке, `HEAD..origin/dev = 0` |
| конфликт ТОЛЬКО в `HANDOFF.json` | rc=0, вылечен | в файле версия базы, своей строки нет, `MERGE_HEAD` отсутствует, дерево чистое |
| конфликт в чужом файле | rc=2 | `merge --abort` выполнен, имя файла в строке шага |
| незакоммиченные правки | rc=4 | оба файла названы, неотслеживаемый мусор блокером не считается |
| грязный только `HANDOFF.json` | rc=0 | восстановлен из индекса, путь резервной копии напечатан |
| PR `CONFLICTING` | rc=3 | номер PR в строке |
| `UNKNOWN` → `UNKNOWN` → `MERGEABLE` | rc=0 | счётчик шима = 3 вызова `gh pr view`, а не 1 |
| запуск на базовой ветке | rc=6 | ничего не пушится |
| stage0: чистый diff | `STAGE0: PASS`, rc=0 | `stage0.json` и `stage0.md` на диске, все записи pass/skip |
| stage0: подсаженный ключ | `FAIL secrets` | файл и номер строки в `files[]` |
| stage0: `.only(` без обоснования / с обоснованием | FAIL / PASS | строка `STAGE0-ALLOW-DISABLED-TESTS:` в теле PR снимает находку |
| stage0: diff трогает `HANDOFF.json` | `FAIL forbidden-files` | имя файла в `files[]` |
| stage0: PR `CONFLICTING`, ветка позади базы | `FAIL pr` | число коммитов отставания в детали |
| stage0: worktree не задан / стоит не на голове PR | `checks: skip` с причиной | skip не выдаётся за pass |
| stage0: `gh` отвечает ошибкой | `FAIL pr`, rc=1 | нечитаемый PR — это провал, а не тихий проход |

Поштучные проверки сканера (`stage0-scan.mjs`): ключ найден; `YANDEX_ID_PASSWORD=` без значения, `${ROBOKASSA_SECRET}`, `supersecret` (намеренный дефолт стартера по AGENTS.md) и файл `.env.example` находкой не считаются; маркер `stage0:allow <причина>` в строке снимает находку; `.only(` в тестовом файле — находка, тот же вызов в обычном коде (`rows.only("id")`) — нет; `testPathIgnorePatterns` в `jest.config.js` — находка; удалённые строки уликой не являются.

Рендер обоих промптов настоящим движком (`lib.mjs`, `buildWorkerPrompt` / `buildTemplatePrompt`): 0 нерасподставленных `{{…}}` в обоих, пути `pre-pr.sh` и `accept-stage0.sh` разворачиваются в абсолютные.

## Чего НЕТ и почему

- **Сборочные гейты в этапе 0 выключены по умолчанию.** `medusa build` и `next build` переписывают `.medusa`/`.next` того же worktree, где может стоять живой dev-сервер (правило 5d, инцидент aie-20260915-080025-d004: продуктовая страница отдала 500 и приёмка едва не записала это дефектом PR). Включаются `STAGE0_BUILD=1`; `pnpm check:backend-build` остаётся за моделью-приёмщиком и деплоем.
- **Интеграционные суиты бэкенда (`test:integration:http`, `test:integration:modules`) в этапе 0 — `skip` с причиной.** По AGENTS.md им нужен живой Postgres; этап 0 должен быть детерминированным и быстрым. Unit-суита (`test:unit`, `*.unit.spec.ts`) запускается.
- **`accept-stage0.sh` не прогонялся против живого GitHub-PR до создания этого PR** — прогон на своём же PR приложен ниже отдельным комментарием после `gh pr create`.
- **Движок не тронут** (`dispatcher.mjs`, `lib.mjs`, `state.json`, `tasks.json`) — по правилам задачи; предложение ниже описанием, без кода.

## Как приёмщику проверить за 10 минут

```
cd /Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day18-pre-pr-stage0/handoff/day-2026-09-16-oksana-store
node --test ui/                      # 44/44, ~40 с
bash pre-pr.sh dev                   # PRE-PR: OK на этой же ветке
STAGE0_WORKTREE=/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day18-pre-pr-stage0 \
  bash accept-stage0.sh pp01-pre-pr-and-stage0 <номер этого PR> /tmp/stage0-pp01
cat /tmp/stage0-pp01/stage0.md
```

## Предложение к движку — реестр классов задач и задача-спутник каталогов

Заказ Ивана 05:36 п. 3: «нужно искать внешние каталоги по всем классам задач, которые мы решаем и проводить поиск новых сразу параллельно старту выполнения задачи из класса, из которого ранее мы не выполняли задачи». Ниже — описание изменений, кода в этом PR нет.

1. **Поле `class` у задачи** (`tasks.json`): короткий слуг класса работы, а не темы — `auth`, `payments`, `shipping`, `marketplace-api`, `seo`, `email`, `analytics`, `import-export`, `legal`, `storefront-ui`, `panel-ui`, `infra-deploy`, `research`, `process-tooling`. Обязателен при заведении задачи; у существующих проставляется один раз миграционным проходом по `prompts/*.md`.
2. **Реестр классов** — отдельный JSON рядом с движком, `handoff/<день>/classes.json` (правило 18b: реестр — JSON, не MD): `{ "<class>": { "firstSeen": "<ISO>", "firstTask": "<task-id>", "catalogTask": "<task-id|null>", "catalogReport": "<путь|null>" } }`. Ключ — класс, значение — когда класс впервые встретился, какой задачей, и какая задача-спутник искала по нему внешние каталоги. Реестр живёт дольше одного дня: место — по `storage-registry`, `~/upready/specs/task-classes/registry.json`, а дневной файл — его проекция.
3. **Триггер в `dispatcher.mjs`**: в момент перевода задачи в `running` (там же, где строится промпт воркера) — если `classes[task.class]` отсутствует, движок (а) заводит запись класса, (б) создаёт задачу-спутник `cat-<class>` со статусом `queued`, моделью `sonnet`/`medium`, `cwd: mission`, промптом из нового шаблона `prompts/_catalog-scout.md`, (в) пишет `catalogTask` в реестр. Спутник идёт ПАРАЛЛЕЛЬНО, задачу-родителя не блокирует — это требование Ивана («сразу параллельно старту»).
4. **Шаблон `_catalog-scout.md`**: найти внешние каталоги/реестры/справочники, которые закрывают класс `{{CLASS}}` целиком или частично (готовые API-каталоги, справочники провайдеров, открытые датасеты, библиотеки интеграций), проверить их живость и лицензию, сравнить с тем, что мы пишем сами, и закончить строкой «брать / не брать / брать частично» с ценой. Отчёт — `~/upready/research/reports/<дата>-catalogs-<class>.md` (правило 43), путь возвращается в `catalogReport`.
5. **Дедупликация**: спутник заводится ОДИН раз на класс за всё время (по `~/upready/specs/task-classes/registry.json`), а не раз в день; если отчёт старше 90 дней, движок заводит `cat-<class>-refresh`.
6. **Что это даёт**: m05 (каталоги) перестаёт быть разовой задачей и становится функцией движка; класс, по которому мы ещё не работали, не стартует «вслепую» — к моменту первой приёмки у штаба уже лежит ответ, есть ли готовый каталог. Цена — один sonnet-research на новый класс, порядка 14 классов на весь день.

## Экономия

- **Скрипт вместо раунда модели.** Прямой смысл задачи: 22 из 34 отклонённых раундов 2026-09-17 были процессными. `pre-pr.sh` ловит их у воркера ДО `gh pr create` (ноль токенов), `accept-stage0.sh` — у приёмщика ДО чтения кода. Раунд приёмки модели на упавшем `STAGE0` теперь не тратится вовсе: вердикт собирается из `stage0.md`.
- **Тест вместо раунда критика.** 24 новых теста на настоящих git-репозиториях и шиме `gh` — вместо ручной проверки «а что будет, если конфликт только в HANDOFF.json». Два дефекта поймал именно прогон, а не чтение: (1) `gh` стоял в PATH машины и сценарий «gh недоступен» мерил не то, что заявлял — тест переписан на детерминированный отказ `gh`; (2) `invokedDirectly` в `stage0-scan.mjs` был написан через `endsWith` по имени файла и сломался бы при импорте из тест-раннера — заменён на сравнение `import.meta.url` с `pathToFileURL(process.argv[1])`.
- **Ноль субагентов.** Задача сделана соло: fan-out тут нечего распараллеливать, а каждый агент стоил бы контекста на объяснение мира с temp-git-репозиториями. Вместо агента-проверяльщика — `node --test`.
- **Что автоматизировал бы дальше:** (1) `pre-pr.sh` в git-хук `pre-push` воркерского worktree — тогда его нельзя забыть; (2) вынести `with_timeout` (perl-фолбэк, на Darwin нет `timeout`) в общий `handoff/<день>/lib.sh`, он уже продублирован в двух скриптах; (3) собирать `stage0.json` всех раундов в один ряд и считать, какие проверки реально ловят — чтобы выключать бесполезные, а не копить их.

Отчёт написан 2026-09-18 06:23 WITA.
