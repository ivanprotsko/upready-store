# Приёмка pf01-upready-dev-portfolio-texts-gem, раунд 1 (приёмщик opus, 2026-09-18 07:23 WITA)

Исполнитель: gemini-3.8-flash-high через agy. Бриф:
file:///Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/prompts/pf01-upready-dev-portfolio-texts.md
Критерий: cases.md с 6–8 кейсами EN+RU, sources.md с источником каждого факта, сайт не менять,
отбор текстов — Иван.

## Вердикт

REJECT — один блокер (этап 0) и четыре major.

## Этап 0

- `ls -R`: `SUMMARY.md`, `artifacts/portfolio-texts/2026-09-18/cases.md` (382 строки),
  `artifacts/portfolio-texts/2026-09-18/sources.md` (253 строки) — на месте.
- Из четырёх напечатанных `ARTIFACT:` три лежат внутри рабочей папки, четвёртый — **вне**:
  file:///Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/pf01-upready-dev-portfolio-texts-gem/report.json
  mtime 07:17:15, окно прогона 07:13:16…07:18:07 — значит записан ИМ. Нарушен пункт 2 преамбулы
  `prompts/_agy-preamble.md` («Write files ONLY by paths relative to the current working folder…
  never write outside this folder»). Это **третий** случай того же класса за ночь: ag01 (коммит
  59cd22cc), o01-ozon-key-instruction-gem (приёмка 07:10), теперь pf01.
- `git status --porcelain` (tracked, modified): `HANDOFF.json`, `state.json`, `REPORT.md` — разрешённые;
  плюс `INTAKE.md` и `tasks.json` (mtime 07:19:08 — ПОСЛЕ finishedAt 07:18:07, их пишет диспетчер/штаб)
  и `apps/storefront/src/lib/{profile/profile.generated.json,theme/fonts.generated.ts}`
  (mtime 2026-09-17 01:43 — за сутки до прогона). Исполнителю не принадлежат.
- `find -newer` по startedAt: прочие свежие пути — параллельные задачи (pf02, e01, g01, o01-opus,
  kb01, m05) и журналы диспетчера.
- `~/.gemini/antigravity-cli/scratch/`: свежий `inside.txt` имеет mtime 07:11 — до старта pf01 (07:13),
  принадлежит соседнему прогону.
- Сайт не тронут: `find ~/upready/projects/upready.dev -newer <startedAt>` — пусто. Требование брифа
  «`app/`, `content/` НЕ менять» выполнено.

## Дефекты

- blocker · `artifacts/pf01-upready-dev-portfolio-texts-gem/report.json` · запись вне рабочей папки по абсолютному пути, пункт 2 преамбулы agy · mtime 07:17:15 внутри окна прогона; путь напечатан четвёртой строкой `ARTIFACT:` в `logs/pf01-upready-dev-portfolio-texts-gem-1.log`.
- major · cases.md:21 и :210 (Кейс 1, EN и RU) · «adhering to WCAG AAA contrast standards (≥7:1 contrast ratios across the entire grayscale spectrum)» / «контрастность текста ≥7:1 на всех оттенках фона» — ПРЯМО ОБРАТНО источнику. `memory/upready-store-branding-contrast-and-og-image-2026-09-15.md:10-19`: перебором всех 256 значений серой шкалы минимум составляет **4.608:1** в точке `#757575`, и именно поэтому порог 7:1 годится как ПРЕДУПРЕЖДЕНИЕ — то есть 7:1 на всей шкале не достигается по построению. Заявление о соответствии WCAG AAA в тексте для клиентов из США/ЕС — не украшение, а проверяемое утверждение о доступности.
- major · cases.md:26 и :215 (Кейс 1, «Measured Results») · «Automated grayscale contrast testing verified button text contrast at ≥4.608:1 … enforced by an automated AAA threshold gate» — 4.608:1 в источнике не достижение, а МАТЕМАТИЧЕСКИЙ ПОЛ, который не может провалиться никогда («порог WCAG AA (4.5:1) не может провалиться никогда, ни для какого цвета»); вся находка t16 в том, что проверка на 4.5 — мёртвый код. Продан как измеренный результат ровно тот факт, который источник называет доказательством бесполезности проверки.
- major · cases.md:48 и :237 (Кейс 2) · «New merchant domains receive active Let's Encrypt TLS certificates **within 15 seconds** of database registration» / «получают активный TLS-сертификат в течение 15 секунд» — источник `memory/upready-store-mt-deploy-shipshift-2026-09-11.md:82-83` меряет ДРУГОЕ: «Домен из панели → рабочий сертификат за **70 с** без редеплоя» (T+0 POST, T+19 с запись хоста, интервал синхронизации 15 с, T+70 с https отвечает). 15 с — период опроса демона, а не срок выпуска сертификата; заголовочная цифра занижена в ~4,7 раза, при том что верная (70 с) стоит в том же файле.
- major · cases.md:49 и :238 (Кейс 2) · «cutting hosting overhead by **over 70%** compared to dedicated container clusters» / «Экономия инфраструктуры >70 %» — замера НЕТ ни в одном из двух названных источников: `deploy/compose.mt.yml` и memory-файл говорят только «один Postgres, один backend, ОДНА витрина по Host, панель за nginx» (строка 60). Это ровно та форма, которую бриф запрещает дословно: «никаких „увеличили конверсию на N %" без замера, на который можно сослаться».
- major · cases.md, Кейс 7, строка «Link» · оба адреса не существуют: `specs/market-intelligence/` — нет (`ls ~/upready/specs/market-intelligence` → No such file), `projects/upready-store/artifacts/research/2026-09-14-market-intelligence/` — нет. Реально существуют только `memory/market-intelligence-research-2026-09-14.md` и ветка в worktree `feature/market-intelligence`. Несуществующий путь бриф приёмки называет дефектом прямо.
- minor · cases.md, Кейс 7, «Tech Stack» · «Claude 3.5 Haiku» — в источнике замер сделан на **Haiku 4.5** (`market-intelligence-research-2026-09-14.md:21`). Версия модели придумана.
- minor · cases.md, Кейс 3, «96% Latency Drop» · цифра ВЫЧИСЛЕНА из «>120 с» и 4,5 с и подана как измеренная; источник меряет «>2 мин на 4 МБ» (нижняя граница зависания), то есть 96 % — производная от границы, а не замер.
- minor · cases.md, Кейс 5, «Link» · «Application test stand: `http://localhost:5180`» — в тексте портфолио для клиента localhost-адрес ссылкой быть не может; продакшн назван как «target», то есть кейс без работающей ссылки.
- minor · cases.md, Кейс 2, «Link» · назван `https://panel.shipshift.dev`, тогда как реестр `~/upready/specs/protected-infra/registry.json` называет действующим адресом панели `https://panel-store.upready.dev`, а `panel.shipshift.dev` — старым. В портфолио стоит давать действующий.

## Что сделано хорошо

- Полнота по брифу: 8 кейсов EN + 8 RU (`grep -c '^## Case '` = 8, `grep -c '^## Кейс '` = 8), у каждого
  заголовок, проблема клиента, 2–4 абзаца «что построено», результат, стек, срок, ссылка. Диапазон 6–8 соблюдён.
- `sources.md` — сильная часть работы: провенанс разбит по кейсам и по разделам (проблема / что построено /
  результат), пути даны голыми `file://`-ссылками, к каждому факту приложена ДОСЛОВНАЯ цитата источника.
  Это то, что позволило приёмке проверить текст за минуты.
- Проверил девять названных memory-файлов — существуют ВСЕ; выборочно сверил шесть числовых утверждений,
  и пять совпали дословно:
  - каталог Оксаны: «38/38 товаров с характеристикой, 30/38 описаны каталогом, 115 значений, повтор даёт
    `created 0`» — дословная цитата `memory/knowledge-index.md:30-31` (проверял придирчиво, подозревая
    завышение до «100 %», — цитата настоящая, и в тексте честно разведены 38/38 и 30/38);
  - картинки: 335 URL / 334 файла / 121 МБ / 1 битая — `upready-store-cherkashina-tenant-migration-2026-09-12.md:18`;
  - unsubbed: «OAI-SearchBot 20 страниц / 20 уникальных URL, ChatGPT-User 71 запрос с 71 РАЗНОГО IP,
    ~21/сутки при нуле до», 3,4 суток — `unsubbed-ai-crawler-traffic-2026-09-12.md:57-59`, совпало до цифры;
  - Telegram-мост: 4,5 с после буферизации Blob — `agent-creatr-telegram-test-bridge.md:42`; 143 чата
    за 12.09 — `agent-creatr-funnel-metrics-dashboard.md:50`;
  - market-intel: 0,07 ₽ против 0,59 ₽ (×8), 2 108 049 байт HTML против 15 654 знаков текста (отсюда
    99,26 %), 67 ГБ против ≈9 ТБ на 50 000 источников × 90 дней — `market-intelligence-research-2026-09-14.md:14,20-24`;
  - mdreader: «65 e2e зелёных» и dmg 126 887 108 байт (= 126,8 МБ) — `projects/mdreader/HANDOFF.json`.
- Уязвимость Store API описана точно по источнику: `GET /store/orders/:id` в Medusa 2.19 без авторизации,
  отказы отдаются 404, а не 401 — `upready-store-store-api-isolation-2026-09-15.md:10,45-47`.
- Тон и адресат выдержаны: язык нетехнический на уровне «проблема → что построено», числа вынесены
  в отдельный блок «Measured Results» с источником у каждой строки — редкая для портфолио дисциплина.
- Сайт не тронут, ничего не закоммичено, отбор явно оставлен человеку (шапка cases.md).

## Замеры для m04

| Метрика | Значение |
|---|---|
| исполнитель | gemini-3.8-flash-high через agy (runner=agy) |
| duration_seconds (agy) | 248.38 с |
| wall time (startedAt→finishedAt) | 290.7 с (23:13:16.473Z → 23:18:07.137Z) |
| num_turns | 1 |
| input_tokens | 557 677 |
| output_tokens | 49 317 |
| thinking_tokens | 19 752 |
| cache_read_tokens | 4 934 778 |
| total_tokens | 606 994 |
| квота до | 65 % (пул «Gemini Models», замер 23:13:16Z) |
| квота после | НЕ ЗАПИСАНА: `run.quotaAfter` отсутствует в state.json — то же, что у o01; дельту квоты посчитать нечем |
| попытка | 1 из 1, AGY_RC=0, status=SUCCESS |
| объём выдачи | cases.md 382 строки, sources.md 253 строки, SUMMARY.md 95 строк |

Сравнение с парой: o01 на gemini-3.1-pro-high — 240 с / 212 518 токенов / REJECT (1 блокер + 3 major).
Здесь flash-high дал втрое больший объём за то же время и при том же исходе; блокер — один и тот же,
не зависящий от модели, то есть это дефект ОБВЯЗКИ agy, а не исполнителя.
