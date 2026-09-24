# Чем заменить допущения на замеры

Модель считает на открытых данных там, где есть источник, и на явных допущениях там, где источника
нет. Этот файл — список того, что нужно измерить, чтобы допущение исчезло. Порядок — по влиянию на
результат (см. таблицу чувствительности в калькуляторе).

## §1. CPU на запрос и число запросов на страницу

Кто заменяет: `capacity.cpuMsPerDynamicRequest`, `capacity.cpuMsPerApiRequest`,
`traffic.dynamicRequestsPerPage`, `traffic.apiRequestsPerPage`.

Что нужно: стенд с витриной и бэкендом на известном числе ядер, нагрузочный прогон и счётчик CPU.

```bash
# 1. Число запросов на визит — из лога доступа за прогон сценария «зашёл, посмотрел 3 товара»
#    (или из вкладки Network браузера: запросы к нашему домену, без статики CDN).
# 2. CPU-время: до и после прогона снять суммарное CPU процесса
cat /sys/fs/cgroup/cpu.stat | grep usage_usec     # в контейнере
# 3. Нагрузочный прогон фиксированной длительности
npx autocannon -c 20 -d 60 https://<стенд>/ru/products/<handle>
# CPU-мс на запрос = (Δusage_usec / 1000) / число запросов
```

Требование к замеру: греть кэш перед прогоном, отдельно мерить холодный и горячий путь, записывать
версию сборки. Одно число без указания, какой это путь, в модель не едет.

## §2. Медиа на визит

Кто заменяет: `traffic.mediaMbPerVisit`.

```bash
# Суммарный вес ответов на один сценарный визит
npx playwright open --browser chromium https://<стенд>/ru    # DevTools → Network → Transferred
# либо из лога nginx/S3: байты ответов, делённые на число сессий за период
```

## §3. Суточная и недельная неравномерность

Кто заменяет: `traffic.peakHourFactor`, `traffic.peakDayFactor`, `traffic.peakHoursPerMonth`.

Сейчас `peakHourFactor` взят замером по чужой аудитории — часовые просмотры ru.wikipedia,
открытый API Wikimedia. Воспроизведение:

```bash
curl -s -A "upready-research (<почта>)" \
 "https://wikimedia.org/api/rest_v1/metrics/pageviews/aggregate/ru.wikipedia/all-access/user/hourly/2026090100/2026090800" \
 | python3 -c 'import json,sys;from collections import defaultdict
d=json.load(sys.stdin)["items"];v=[i["views"] for i in d];avg=sum(v)/len(v)
p=defaultdict(list)
for i in d: p[int(i["timestamp"][8:10])].append(i["views"])
m=max(sum(x)/len(x) for x in p.values());print("пик/среднее",round(m/avg,3),"доля пикового часа",round(m/(avg*24)*100,2),"%")'
```

Заменяется на то же самое по НАШИМ магазинам, как только у них появится посещаемость: часовой
профиль по всему парку и по каждому сегменту отдельно. Аудитория одного магазина уже́, чем аудитория
энциклопедии, поэтому текущее значение — нижняя граница, а не верхняя.

## §4. Объём каталога в базе и в хранилище

Кто заменяет: `storage.dbOverheadFactor`, `storage.mediaMbPerProduct`
(и уточняет `storage.dbKbPerProduct`, сейчас замеренный по исходному JSON сид-каталога).

```sql
-- Postgres стенда: сколько занимает каталог со всеми индексами
SELECT sum(pg_total_relation_size(c.oid))
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname LIKE 'product%' AND n.nspname = 'public';
SELECT count(*) FROM product;
```

```bash
# Медиа: суммарный объём бакета и число товаров
aws --endpoint-url https://s3.timeweb.cloud s3 ls --recursive --summarize s3://<бакет> | tail -2
```

## §5. Визиты на товар по сегментам — главный вход

Кто заменяет: `segments[].baseVisitsPerMonth`, `segments[].visitsPerProductPerMonth`,
`segments[].storeShare`, весь блок `fleet`.

Открытых данных по величине «визитов в месяц на один товар каталога» не публикует ни один источник
(проверено 2026-09-14, см. `SOURCES["segments.*"]` в `defaults.js`). Поэтому коэффициенты
откалиброваны сверху вниз по опубликованной посещаемости магазинов и заменяются нашей аналитикой:

1. Считать по каждому магазину: число товаров, визиты за месяц, визиты на карточки товаров отдельно
   от остальных страниц.
2. Построить регрессию «визиты = база + k × товары» внутри каждой полосы размера каталога — `k` и
   есть коэффициент сегмента, `база` — трафик, который каталог не объясняет.
3. Границы сегментов пересобрать по НАШЕМУ распределению размеров каталога, а не по чужому.

Пока замеров нет, любое обсуждение цены опирается на калибровку, и это должно быть сказано вслух в
каждом документе, где цена называется.
