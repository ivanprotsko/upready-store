# Приёмка двойника pf01-upready-dev-portfolio-texts-opus (парный дизайн m04, раунд 2)

Исполнитель: `claude -p`, задача помечена «-opus», но фактически запущена на **model=sonnet**
(лог: `model=sonnet effort=medium`) — старт 23:26:34 UTC (07:26 WITA), уже после решения штаба
07:19 WITA переводить незапущенные задачи на sonnet. Независимый двойник после REJECT прогона
gemini (раунд 1, папка `pf01-upready-dev-portfolio-texts-gem` намеренно не открывалась — бриф
`pf01-upready-dev-portfolio-texts-opus.md` это прямо требует).
Акцептор: sonnet-5.

Бриф: `prompts/pf01-upready-dev-portfolio-texts.md` + `prompts/pf01-upready-dev-portfolio-texts-opus.md`.

## Вердикт

**ACCEPT** — блокеров нет, 1 major (сорванная цепочка источника у одного факта, сам факт при
проверке оказался верным) и 1 minor.

## Этап 0

- `ls -R` рабочей папки: `SUMMARY.md`, `artifacts/portfolio-texts/2026-09-18/{cases.md,sources.md}`.
  Все 4 строки `ARTIFACT:` из `logs/pf01-upready-dev-portfolio-texts-opus-1.log` проверены:
  3 внутри рабочей папки существуют, 4-я (`artifacts/pf01-upready-dev-portfolio-texts-opus/report.json`)
  — по адресу, который для claude-раннера требует `_run-preamble.md` (аналог принятого прогона
  `o01-ozon-key-instruction-opus`, раунд 2) — это не нарушение.
- Транскрипт сессии (`~/.claude/projects/.../01ac7022-….jsonl`) проверен по инструментам:
  Write встречается ровно 3 раза — `SUMMARY.md`, `artifacts/portfolio-texts/2026-09-18/cases.md`
  (и его `sources.md` внутри той же папки), `artifacts/pf01-upready-dev-portfolio-texts-opus/report.json`;
  все Bash-вызовы — чтение (`cat`, `grep`, `git log`, `find`, `python3 -c` с чтением json), запись
  никуда за пределы разрешённого не найдена.
- `git -C … status --porcelain`: изменены `HANDOFF.json`, `state.json`, `REPORT.md` (разрешено) плюс
  `artifacts/agy-runs/ENGINE-NOTE-preamble.md`, `artifacts/agy-runs/ledger.tsv`, восемь файлов
  `prompts/*-acc*.md` — но по транскрипту этой задачи ни один из этих путей ни разу не открыт на
  запись; это правки штаба/моих предыдущих приёмок этой же сессии (модельный переход 07:19,
  дозапись ledger.tsv другими задачами дня). Не вменяю pf01-opus.
- `find -newer` (окно 23:26:34–23:32:47 UTC) вне рабочей папки: файлы принадлежат параллельным
  задачам дня (g01/o01/e01/pf02/kb01) и диспетчеру, не этому прогону.
- Сеть: WebFetch/curl на живые сайты (upready.dev, cherkashino.shipshift.dev и т.д.) бриф разрешал
  явно («живые сайты (только GET)») — по транскрипту исполнитель их НЕ дергал вообще, работал
  только с `~/upready/memory/`, HANDOFF.json проектов и локальным git; это недоиспользование
  разрешённого источника, не нарушение (см. minor ниже).

Этап 0 — пройден.

## Дефекты

1. **major · `sources.md`, Case 5 (envoicer.app), результат «ZUGFeRD export passed the full
   Mustang/ZUV… validator run»· цитируемый источник противоречит утверждению, настоящий источник
   не найден и не процитирован** — `sources.md` ссылается на `HANDOFF.json` проекта envoicer-app,
   задачу «Run ZUGFeRD XML through Mustang/ZUV full BR-validator» и помечает её «(done)». Я открыл
   саму задачу (`t-2026-06-01-06`) — поле `details` дословно говорит ОБРАТНОЕ: «Full BR-validation
   with Mustang or ZUV has **NOT** been run locally. Must run before shipping e-invoice feature.»
   Как процитировано, факт не подтверждён, а прямо опровергнут собственным источником.
   Проверка глубже (`git log --all --oneline | grep -i mustang`) нашла настоящее доказательство —
   файл `tasks/audits/zugferd-validation.md` (тот же task id `t-2026-06-01-06`, коммит `655c8cd`):
   «ZUGFeRD BASIC EN16931 — validation PASS», Mustang-CLI 2.23.1, `exit code 0`, «ZERO FailedAsserts»
   на схематроне BASIC EN16931 — то есть заявленный факт ФАКТИЧЕСКИ ВЕРЕН, но исполнитель его не
   нашёл и процитировал вместо него противоречащий фрагмент того же HANDOFF.json. Это разрыв
   в проверке источника ровно там, где бриф требует «open at least three cited sources… confirm
   the claims» — резюме результата кейса не подкреплено тем источником, который на него ссылается.
2. **minor · разрешённый источник «живые сайты» не использован** — бриф явно допускал GET-запросы
   к `upready.dev`, `cherkashino.shipshift.dev`, `panel-store.upready.dev`, `unsubbed.co» для
   описания того, что видно на живом сайте; исполнитель ни разу не сходил ни на один (по
   транскрипту — только `~/upready/memory/`, HANDOFF.json и git). Не критично: кейсы и так опираются
   на измеренные факты из записей, но живой скриншот/статус страницы усилил бы «Link» в каждом кейсе.

## Что сделано хорошо

- **Дисциплина «нет измерения → так и написано» выдержана по всем 6 кейсам.** Для Cases 3
  (agent-creatr), 5 (envoicer.app) и 6 (l2mammon.com) прямо написано «метрики
  трафика/конверсии/выручки не зафиксировано» вместо придуманного процента — именно то, что
  провалил раунд 1 с gemini по другой задаче этого дня.
- **Выборочная проверка фактов (≥3 источника, дословно) подтвердила точность:**
  - Case 1: PR #61, ветка `fix/day16-store-api-isolation`, HMAC-токен, «20 из 38» SKU по nmID,
    «30 из 38» описанных товаров (21 через `full_characteristics` + 9 по названию варианта) —
    все числа сошлись с `upready-store-store-api-isolation-2026-09-15.md`,
    `cherkashino-sku-is-wb-nmid-2026-09-16.md`, `cherkashino-catalog-characteristics-2026-09-15.md`;
  - Case 2: метод замера (Cloudflare GraphQL `httpRequestsAdaptiveGroups` + сверка IP),
    `ai_bots_protection: block` → 403 PerplexityBot/Claude-User, снятие 12.09 — дословно совпало
    с `unsubbed-ai-crawler-traffic-2026-09-12.md`;
  - Case 3: «0 строк `lesson_*` в проде / 179 в тесте по 2 чатам», Contabo `84.46.251.149`,
    `proxied=False` из-за лимита Cloudflare 100 МБ — дословно совпало с
    `agent-creatr-video-stats-by-person-and-invite-cover-2026-09-14.md` и `agent-creatr-prod-deploy-contabo.md`;
  - Case 4: «91 passed + 6 PWA (нужен preview) = 97/97», контраст 1.6:1 → 5.7:1 — дословно совпало
    с `mdreader-e2e-baseline-97-is-91-plus-6.md`;
  - Case 6: 310 коммитов, дата последнего 2026-09-05, `vercel.json` cron `* * * * *` на
    `/api/cron/streams`, сообщения коммитов про Kick mute button и уникальный constraint —
    все подтверждены прямым `git log`/`cat vercel.json` в `~/upready/projects/l2mammon/`.
- **Честный раздел «не найдено / не использовано»**: market-intel (только research, реализации
  нет — процитирован файл с прямой цитатой), ivanprotsko.com (не клиентский проект), superset
  (сторонний продукт) — рассмотрены и обоснованно исключены, а не тихо пропущены.
- **6 из 6–8 кейсов, без добора числом**: явно написано, что не стал добирать до 8 выдумкой,
  когда реальных измеренных фактов на 7–8-й кейс не нашлось.
- Сайт (`app/`, `content/`) не тронут, ничего не закоммичено, ссылка на итоговый выбор — за Иваном.
- RU/EN версии присутствуют по каждому кейсу, термины и числа между версиями не разъезжаются
  (сверено выборочно на Case 1 и Case 6).

## Замеры для m04

| Показатель | Значение |
|---|---|
| Исполнитель | claude -p, **model=sonnet** (не opus — задача стартовала после перехода 07:19 WITA) |
| Попытка | 1 из 1 |
| startedAt / finishedAt | 2026-09-17T23:26:34.859Z → 2026-09-17T23:32:47.823Z (07:26 → 07:32 WITA) |
| duration_seconds | 373.0 (6 мин 13 с) |
| Различных запросов (requestId) в транскрипте | 29 (64 записи assistant — thinking/text/tool_use на каждый запрос, зерно — «на запрос», не на строку) |
| usage: output_tokens (сумма по различным requestId) | 31 023 |
| usage: cache_read_input_tokens (последнее значение) | 155 962 |
| Квота | неприменимо (claude-раннер на подписке) |
| Приёмка (sonnet) | раунд 2, вердикт ACCEPT |

Сравнение с раундом 1 (gemini, `pf01-upready-dev-portfolio-texts-gem`): REJECT (1 блокер, 4 major,
4 minor, длительность 248.38 с) против ACCEPT здесь (0 блокеров, 1 major, 1 minor, 373.0 с) —
двойник продолжительнее, но с кратно меньшим числом дефектов и без единого выдуманного числа.
