# b08-seo-storefront — отчёт

Написан 2026-09-16 00:53 WITA. Ветка `fix/day16-seo-storefront`, база `dev` (после мержа `b02` и `b06`).
Источники задачи: `handoff/day-2026-09-16-oksana-store/artifacts/q03-gap-recheck/gap-recheck.md` §7 и
`.../accept-t11-seo-redirects-3/REPORT.md` «Нитки», пункты 5 и 6.

Живой хост не менялся: ни деплоя, ни записи в живую БД. Всё измерено на стенде `upready_store_b08` —
клон базы магазина Оксаны (`createdb -T upready_store_cherkashina`) на `127.0.0.1:5433`, бэкенд `:9208`,
витрина `:8208` (для финальных замеров — `next build` + `next start`, не dev-сервер).

**Живой магазин в момент работы недоступен:** `https://cherkashino.shipshift.dev/sitemap.xml`,
`https://shipshift.dev/health` и `https://zolotaya-nit-1057.shipshift.dev/` отвечают **502** (замер
2026-09-16 00:10 WITA). Это вся платформа, а не одна витрина — вероятно дефект `f17-backend-image-sharp`.
Поэтому «до» живого магазина в цифрах взято из `gap-recheck.md` §7, а все собственные замеры — со стенда.

---

## 1. Sitemap перечислял 36 языков вместо языков магазина

### Что было

`apps/storefront/src/app/sitemap.ts` перебирал `locales` из `@i18n/config` — все 36 языков сборки.
Настройки магазина (`tenant_locale_settings.enabled_locales`, задача `t06`) sitemap не читал вовсе,
хотя витрине они уже приезжают заголовком `x-tenant-locales` и переключатель языка их читает
(`getEnabledLocales()` в `lib/data/cookies.ts`).

Тот же дефект этажом ниже, в `<head>`: `buildAlternatesFor` выдавал **37 ссылок `hreflang`** на каждой
странице — 36 языков плюс `x-default`.

### Что сделано

- `apps/storefront/src/lib/util/shop-locales.ts` — одна чистая функция `shopLocales(shipped, enabled, fallback)`:
  список магазина, сужённый до языков, которые сборка действительно несёт; пустой список или его отсутствие
  = прежнее поведение (все 36); язык, которого в сборке нет, отбрасывается; если не осталось ничего —
  один язык, который отрисовывается всегда.
- `sitemap.ts` и `lib/util/alternates.ts` читают её. Чистая половина `buildAlternatesFor` вынесена
  в `alternates-core.ts`, потому что `alternates.ts` тянет `server-only` через `lib/data/cookies`
  и юнит-тест его не импортирует (правило 19g).

### Замер (стенд, тенанты `cherkashino` и `acme`)

```
                          ДО (код dev)            ПОСЛЕ
cherkashino sitemap.xml   1481 <loc>, 36 языков   88 <loc>, 2 языка (en, ru)
acme sitemap.xml          1405 <loc>, 36 языков   79 <loc>, 2 языка (en, ru)
hreflang в карточке       37 ссылок               3 (x-default, en, ru)
```

Языки ДО: `ar bg bn cs da de el en es fi fr he hi hu id it ja ka ko lt mn ms nb nl pl pt ro ru sk sv th tl tr uk vi zh`.
Сырьё: `raw/sitemap-before-*.xml`, `raw/sitemap-after-*.xml`.

`gap-recheck.md` мерил живой магазин и получил 2021 адрес — на стенде каталог другого размера, поэтому
абсолютные числа не совпадают; совпадает то, что измеряется: было 36 языков, стало 2.

### Чего это НЕ чинит само по себе

На живом магазине у тенанта `cherkashino` **нет строки `tenant_locale_settings`** (замер `b02` от
2026-09-15: `GET /tenants/locale-settings` → `{"locale_settings": null}`; в клоне базы таблицы тогда
не было вовсе). По условию задачи «нет настроек → прежнее поведение», поэтому на живом sitemap
останется 36 языков, пока настройки не появятся. Их даёт уже существующий скрипт `t06`, в
`docker-entrypoint.sh` он НЕ подключён:

```
docker exec mt-backend node_modules/.bin/medusa exec ./src/scripts/backfill-tenant-locale-settings.js
```

Он идемпотентен и не трогает тенанта, который уже что-то сохранил. На стенде он поставил ru/en всем
12 тенантам — именно после него сняты цифры «ПОСЛЕ». Решение «подключать ли его к каждому старту
контейнера» я не принимал: это меняет переключатель языков у ВСЕХ магазинов платформы (с 36 языков
до двух), и такое решение принадлежит задаче деплоя или Ивану, а не этой пачке.

---

## 2. Коллекции в sitemap не скоупились по тенанту

### Что было

`/store/collections`, в отличие от `/store/products`, не скоупится publishable-ключом: у коллекции в
Medusa нет ни привязки к каналу продаж, ни владельца. Sitemap читал именно её, поэтому у двух разных
магазинов совпадали пути коллекций. В коде это было описано комментарием и вынесено из области `t11`.

**Уточнение к формулировке задачи.** «108 общих путей» — это ВСЁ пересечение путей двух витрин, а не
только коллекции. На стенде до фикса:

```
общих путей всего: 108
  в разделе collections: 36   ← утечка (1 коллекция × 36 языков)
  в разделе store:       36   ← у каждого магазина свой /<locale>/store, пути совпадают по форме
  корень /<locale>:      36   ← то же самое
  products / categories / pages: 0
```

То есть настоящая утечка — 36 путей; остальные 72 это одинаковые по форме адреса на разных хостах.

### Что сделано

Привязки «коллекция ↔ тенант» нет и выдумывать её нечего: коллекция по замыслу — общий справочник.
Но есть записанное владение: `tenant_product` говорит, чей товар, а `product.collection_id` — в какой
он коллекции. Новый маршрут `GET /store/tenant/collections`
(`apps/backend/src/api/store/tenant/collections/route.ts`) отдаёт коллекции, в которых стоят
СОБСТВЕННЫЕ товары тенанта, в той же форме и с теми же параметрами, что `/store/collections`.
Sitemap читает его, когда тенант опознан, и прежний маршрут — когда магазин одномагазинный.

### Замер

Чтобы проверка шла в обе стороны (а не «в разделе просто пусто»), фикстура
`scripts/fixtures/b08-collections-stand.ts` дала каждому тенанту по своей коллекции с его товаром.

```
# /store/collections — нескоупленный маршрут, его читал sitemap ДО
cherkashino: acme-picks,cherkashino-picks,new
acme:        acme-picks,cherkashino-picks,new

# /store/tenant/collections — новый маршрут
cherkashino: cherkashino-picks
acme:        acme-picks
```

В sitemap после фикса:

```
общих путей всего: 4  →  /ru  /en  /ru/store  /en/store
общих путей коллекций: 0
cherkashino: /ru/collections/cherkashino-picks, /en/collections/cherkashino-picks
acme:        /ru/collections/acme-picks,        /en/collections/acme-picks
```

Сырьё: `raw/collections-api.txt`, `raw/paths-after-*.txt`.

Seam-тест `apps/backend/integration-tests/http/tenants-collections.spec.ts` — 4/4 зелёных, в том числе
случай «оба магазина положили товар в одну коллекцию → она видна обоим» и контрольный «нескоупленный
маршрут по-прежнему отдаёт обе» (это и есть дефект, который чинит новый).

---

## 3. 55 строк `page` / `legacy_page` без 301

### Что это за строки на самом деле (замер, а не пересказ)

Реестр живого импорта `handoff/day-2026-09-16-oksana-store/artifacts/x01-tenant-live-import/02-mapping-registry-live.json`:

| Вид | Строк | Что в них |
|---|---|---|
| `page` | 16 | 15 с `source_url` вида `https://olavka.ru/ru/<locale>/<slug>`; 16-я (`legal:none`) адреса не имеет вовсе |
| `legacy_page` | 39 | **ни у одной нет `source_url`**; поле `url` в исходнике — `https://asd2-3.com/<slug>` у всех 39 |

39 «старых страниц» — это выгрузка структуры ЧУЖОГО сайта `asd2-3.com` (референс дизайна, см. дайджест
`research/chrxnasdmds-digest.md`), лежавшая в старом репозитории как `apps/backend/src/data/pages.json`
(«39 статей: slug, title, h1, outline» — черновики SEO). Проверено двумя независимыми замерами:

```
# 1) хосты всех 39 записей pages.json
node -e '…' → {"asd2-3.com":39}

# 2) был ли у этих слагов маршрут на витрине старого магазина
find …/app/[countryCode]/[locale]/(main)/pages → только pages/bundle-assortment,
     а bundle-assortment среди 39 слагов нет
```

301 с домена, которым мы не владеем, не перенаправляет ничего. Поэтому **редиректов для 39
`legacy_page` не заведено** — это не пропуск, а результат замера. Критерий приёмки «по три адреса
`legacy_page`: 404 → 301» выполнить нельзя, не выдумав адреса; вместо этого замер закреплён в тесте
`migrated-pages-parity.unit.spec.ts`, который упадёт, если кто-то попробует их туда добавить.

Из 11 слагов `page` маршрут на старой витрине был у 10; у `return-memo` маршрута не было
(`(main)/return-memo` в старом репозитории отсутствует) — его «старый адрес» существовал только как
юридический документ внутри другой страницы.

### Что сделано

`tenant_page` не хранит происхождения: колонки `metadata` у модели нет, а импортёр создаёт страницы
через `PUT /tenants/pages/<key>`, который несёт только заголовок, тело и локаль. Поэтому приём `b02`
(«вывести 301 из метаданных, которые уже лежат в БД») к страницам неприменим.

- `apps/backend/src/tenant-redirects/migrated-pages.ts` — таблица из 15 старых адресов, ключом
  `migrated_from` того магазина, откуда импортировали. Ключ страницы — тот, в который миграция
  реально положила страницу, а где не положила — сам слаг источника (`t05` сделал ключ свободным
  слагом, и `gap-recheck.md` §7 называет именно `/ru/pages/delivery`, `/ru/pages/faq`, `/ru/pages/returns`).
- `deriveMigratedPageRedirects` пишет строку, **только если у магазина такая страница действительно
  есть и опубликована**. 301 в 404 хуже, чем сам 404. Адрес, чья страница появится завтра, подхватится
  сам на первом же деплое после этого — без правки кода.
- `src/scripts/backfill-tenant-redirects.ts` (тот самый, который `docker-entrypoint.sh` уже гоняет на
  каждом старте) теперь пишет обе половины. У страниц **свой** маркер `page_redirects_seeded_from`:
  каталожный `redirects_seeded_from` живой тенант получил ещё от `b02`, и чтение его здесь означало бы
  «уже предлагали» для строк, которых никогда не было.
- Тест `migrated-pages-parity.unit.spec.ts` сверяет таблицу с реестром живого импорта строка в строку.

**47 правил задачи `b02` не тронуты**: они выводятся из метаданных товаров и категорий тем же
скриптом, их код (`migrated-redirects.ts`) не менялся, и на стенде они по-прежнему отдают 301.

### Замер (стенд)

```
# первый прогон после фикса
backfill-tenant-redirects: cherkashino — 5 written (0 catalogue, 5 pages), 0 already present, 10 unmapped
# в базе
select count(*) from tenant_redirect → 52   (47 каталог b02 + 5 страниц)

# повторный прогон — идемпотентность
backfill-tenant-redirects: done — 0 written across 0 tenant(s)

# завели одну недостающую страницу (фикстура b08-seed-delivery-page.ts) и прогнали снова
backfill-tenant-redirects: cherkashino — 1 written (0 catalogue, 1 pages)
```

Ответы витрины (прод-сборка), `raw/redirects-after.txt`:

```
                          ДО      ПОСЛЕ
/ru/ru/contact            404  →  301 → /ru/pages/contacts
/ru/ru/terms              404  →  301 → /ru/pages/offer
/ru/ru/privacy            404  →  301 → /ru/pages/privacy
/ru/ru/about              404  →  301 → /ru/pages/about
/ru/en/about              404  →  301 → /en/pages/about
/ru/ru/delivery           404  →  301 → /ru/pages/delivery   (после того как страница заведена)
/ru/ru/faq                404  →  404   страницы нет
/ru/ru/returns            404  →  404   страницы нет
/ru/ru/consent            404  →  404   страницы нет
/ru/ru/wholesale          404  →  404   страницы нет
/ru/ru/pages/asd-istoriya 404  →  404   адрес чужого домена asd2-3.com, редиректу неоткуда взяться
/ru/ru/pages/otzyvy       404  →  404   то же
/ru/ru/pages/kupit-asd    404  →  404   то же
# каталог b02, контроль — не трогали
/ru/ru/products/svechi-asd-s-chesnokom-10-sht → 301 → /ru/products/svechi-asd-s-chesnokom-10-sht-cherkashino
/ru/ru/categories/dobavki                     → 301 → /ru/categories/dobavki-cherkashino
```

Девять адресов остаются 404, потому что страниц `faq`, `returns`, `consent`, `consent-marketing`,
`return-memo`, `wholesale` у магазина нет. Их заведение — задача `b14-pages-legal-content`
(«delivery/faq/returns дают 404»), и как только она их заведёт, деплой сам допишет девять 301.
Каждый такой адрес деплой пишет в лог отдельной строкой, а не молчит:

```
backfill-tenant-redirects: cherkashino — unmapped: page /ru/ru/faq: the shop has no published page
"faq" in "ru" — no redirect written (it appears by itself once the page exists)
```

---

## 4. Чужой домен `olavka.ru` в разметке витрины

### Что было

Импортёр ставит на каждый товар, вариант и категорию `metadata.migrated_from`, `source_handle`,
`source_url`, `source_sku`, `source_variant_id`. Витрина просит `+metadata`, потому что там лежат
SEO-переопределения товара (`util/tenant-seo.ts`) и картинка категории (`util/category-image.ts`),
а React сериализует ВЕСЬ объект в RSC-payload внутри HTML.

Замер до фикса (стенд, dev-сборка):

```
карточка товара   olavka.ru: 52 вхождения  (grep -c даёт 2 — это строки, не вхождения)
главная           olavka.ru: 37
каталог /ru/store olavka.ru: 48
```

### Где резать — и почему именно там

**Не в базе.** Таблица редиректов ВЫВОДИТСЯ ровно из этих полей: `migrated-redirects.ts` читает
`metadata.source_url` на каждом старте контейнера. Миграция, которая не может сказать, откуда строка,
не переигрывается и не проверяется. Происхождение остаётся в данных.

**В одной точке витрины, а не в каждом загрузчике.** Первая версия чистила загрузчик товаров — и
`olavka.ru` осталась на главной, потому что запрос категорий просит `*products` и получает товары
целиком; потом та же история повторилась на странице коллекции с тем же `*products`. Правило 20:
починка одного места — не починка класса. Итог: `redactMigrationMetadata` стоит в `lib/config.ts`,
через который проходят ОБА читателя Store API (`sdk.client.fetch` и `fetchWithoutLocale`), и обходит
ответ вглубь. Ответ, в котором ничего не нашлось, возвращается тем же объектом — магазин без импорта
не платит ничего.

### Замер после фикса

Обход ВСЕХ 88 адресов из sitemap магазина плюс поиск и корзина, прод-сборка витрины
(`next build` + `next start`), `raw/leak-sweep-after.txt`:

```
страниц пройдено: 90, вхождений olavka.ru суммарно: 0
```

Поштучно, в форме критерия приёмки:

```
curl -s http://cherkashino.localhost:8208/ru/products/asd-2-fraktsiya-armavir-dorogova-cherkashino | grep -c olavka.ru
ДО: 2 (52 вхождения)   ПОСЛЕ: 0 (0 вхождений)
главная / каталог: 37 / 48 → 0 / 0
migrated_from, source_handle в HTML карточки: 67 / 65 → 0 / 0
```

Оговорка про dev-сервер: при `next dev` первый (холодный) рендер маршрута иногда ещё отдавал 2
вхождения, повтор того же адреса — 0; на прод-сборке 0 на всех 90 адресах с первого запроса. Замеры
в отчёте сняты на прод-сборке.

---

## Проверки

| Проверка | Результат |
|---|---|
| `apps/storefront` `npx tsc --noEmit` | rc=0 |
| `apps/storefront` `npx next build` (тянет tsc + next lint) | rc=0, 1 предупреждение — предсуществующее `no-img-element` в `yandex-metrica` |
| `apps/storefront` `pnpm test:unit` (vitest) | `Test Files 26 passed (26)`, `Tests 241 passed (241)` |
| из них три новых файла отдельно | `Test Files 3 passed (3)`, `Tests 16 passed (16)` |
| `apps/backend` `npx tsc --noEmit` | rc=0 |
| `apps/backend` `npx medusa lint` | `0 errors, 70 warnings` — все предсуществующие (`use-medusa-error-not-generic-error`) |
| `apps/backend` `pnpm test:unit` | `Tests: 1 failed, 361 passed, 362 total` — падает `migration-scripts/__tests__/profile-data.unit.spec.ts` |
| то же падение на `dev` | **предсуществующее**: файлов `migration-scripts/**` эта ветка не касается, и приёмка `t11` (раунд 3) зафиксировала ровно это падение на `dev` 2026-09-15. Чинит `b15-quality-debt` |
| `apps/backend` `npx jest --testPathPattern tenant-redirects` | `Test Suites: 4 passed`, `Tests: 35 passed, 35 total` |
| `apps/backend` seam `tenants-collections.spec.ts` (`TEST_TYPE=integration:http`, `DB_HOST=localhost DB_PORT=5433 PORT=9308`) | `Tests: 4 passed, 4 total` |
| `apps/backend` `pnpm check:backend-build` | rc=0 |
| `apps/backend` `pnpm check:backend-fixtures` | rc=0 |

---

## Как приёмщику проверить за 10 минут

```bash
# 1. стенд
createdb -h localhost -p 5433 -U ivanprotsko -T upready_store_cherkashina upready_store_accb08
# apps/backend/.env: DATABASE_URL=…/upready_store_accb08, PORT=92NN; apps/storefront/.env: :82NN
cd apps/backend && npx medusa db:migrate && npx medusa develop
cd apps/storefront && npx next build && npx next start -p 82NN

# 2. локали и редиректы (оба скрипта идемпотентны)
cd apps/backend
npx medusa exec ./src/scripts/backfill-tenant-locale-settings.ts
npx medusa exec ./src/scripts/backfill-tenant-redirects.ts     # ждём «5 written (0 catalogue, 5 pages)»

# 3. sitemap: языки и пересечение
curl -s http://cherkashino.localhost:82NN/sitemap.xml | grep -c '<loc>'
curl -s http://cherkashino.localhost:82NN/sitemap.xml | grep -o '<loc>[^<]*' | sed -E 's|.*//[^/]+/([a-z-]+).*|\1|' | sort -u   # en ru
# пересечение путей двух магазинов — только /ru /en /ru/store /en/store

# 4. чужой домен
curl -s http://cherkashino.localhost:82NN/ru/products/asd-2-fraktsiya-armavir-dorogova-cherkashino | grep -c olavka.ru   # 0

# 5. старые адреса
curl -sI http://cherkashino.localhost:82NN/ru/ru/contact | head -1     # 301
curl -sI http://cherkashino.localhost:82NN/ru/ru/pages/asd-istoriya | head -1   # 404 — и это правильный ответ, см. §3
```

## Что НЕ сделано и почему

1. **39 `legacy_page` без 301** — их единственный адрес принадлежит `asd2-3.com`, чужому сайту;
   у старой витрины магазина маршрута для этих слагов не было. Замер в §3, закреплён тестом.
2. **Девять адресов `page` остаются 404** — страниц `faq`, `returns`, `consent`, `consent-marketing`,
   `return-memo`, `wholesale` у магазина нет. Заводит их `b14-pages-legal-content`; механизм готов и
   подхватит их сам.
3. **На живом магазине sitemap останется 36-язычным**, пока тенанту не поставят `enabled_locales`
   (одна команда, §1). Подключать этот скрипт к каждому старту контейнера я не стал: это меняет
   переключатель языков у всех магазинов платформы, и это решение деплоя или Ивана.
4. **Замеров на живом магазине нет вовсе** — вся платформа отвечала 502 (см. шапку).
5. **`return-memo`** оставлен в таблице адресов, хотя маршрута для него на старой витрине не было:
   строка в реестре есть, вреда от неё нет (без страницы редирект не пишется), а выкидывать её значило
   бы разойтись с реестром, который сверяет тест.
