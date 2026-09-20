# r03-store-templates-functionality — что сделано и где смотреть

Исследование функциональности шаблонов магазинов InSales и Tilda: реестр функций с уликами, сверка с upready-store по коду и живой витрине, 11 готовых задач с промптами.

## Где результат

| Что | Файл |
|---|---|
| Отчёт для чтения (итог, таблицы по категориям, структура, задачи, чего не хватило, экономия) | `artifacts/research/2026-09-16-store-templates-functionality/report.md` |
| Реестр функций — 77 строк, у каждой улика и ссылки на шаблоны | `artifacts/research/2026-09-16-store-templates-functionality/features.json` |
| Задачи в форме записей диспетчера (11 шт.) | `artifacts/research/2026-09-16-store-templates-functionality/templates-tasks.json` |
| Промпты исполнителям (11 шт., английский) | `artifacts/research/2026-09-16-store-templates-functionality/prompts/` |
| Индекс шаблонов обоих источников | `artifacts/research/2026-09-16-store-templates-functionality/templates-index.tsv` |
| Текстовые экстракты загруженных страниц (114 файлов) | `artifacts/research/2026-09-16-store-templates-functionality/raw/` |
| Журнал загрузки: каждый URL, код ответа, размер | `artifacts/research/2026-09-16-store-templates-functionality/fetch-log.jsonl` |
| Проверка улик по файлам | `artifacts/research/2026-09-16-store-templates-functionality/extract/validation.json` |

## Как проверить за десять минут

1. `node artifacts/research/2026-09-16-store-templates-functionality/scripts/validate-extract.mjs` — сверяет каждую цитату-улику с файлом, на который она ссылается. Ожидается `улика подтверждена в файле: 418, не подтверждена: 22`.
2. `node artifacts/research/2026-09-16-store-templates-functionality/scripts/merge-features.mjs` — пересобирает `features.json` из возвратов агентов. Ожидается `канонов без единой улики: 0`, `канонов без замера по нам: 0`.
3. `node artifacts/research/2026-09-16-store-templates-functionality/scripts/structure-stats.mjs` — числа §3 отчёта.
4. Выборочно: возьмите любую строку `features.json`, откройте её `evidence[].page_url`, найдите цитату в соответствующем файле `raw/`.
5. Три утверждения о НАШЕМ коде, которые стоит проверить глазами — это измеренные дефекты:
   - `apps/storefront/src/modules/home/variants/index.ts:65-66` — hero `k` и `l` отрисовывают `ProfileHero`;
   - `apps/storefront/src/modules/layout/templates/footer/variants/index.ts` — подвал `f4` («с рассылкой») отрисовывает `FooterF1`;
   - живая витрина https://cherkashino.shipshift.dev/ru/products/mumie-balzam-gornogo-altaya-100-gramm-cherkashino — отзывы с рейтингом работают, хотя инвентарь от 2026-09-15 называет отзывы MISSING.

## Чего в этой задаче нет

- Продуктового кода: задача ставила документы и данные. Ни одного файла под `apps/**` не тронуто.
- Пяти демо смежных шаблонов Tilda (404) и админок обоих сервисов (закрыты регистрацией) — перечислено в §5 отчёта.
- Скриншотов: источники смотрелись только текстом, в headed-браузер их не открывали (памятка про бан IP).
