# Hotfix T-6 на живую платформу: план, проверки, откат

Написано лидом проекта upready-store 2026-09-21. Слово Ивана, переданное HQ около 18:30 WITA: «нужно устранить утечку». Объём: только исправление утечки (PR 109 вместе с `09442c4a`). Витрина PR 105, панель PR 106/108/110, движок PR 107, контент, DNS и ключи СДЭК в этот релиз НЕ входят.

## Что измерено до деплоя

- Утечка на живой платформе воспроизводится (лид, 2026-09-21 18:26 WITA, только анонимные GET на `https://shipshift.dev`, значения не сохранялись): `*tenant.admins` отдаёт одну запись администратора с полем `email`; `*tenant.notification_settings` отдаёт `link_code` и `telegram_chat_id`; `*shipping_profile.shipping_options` отдаёт 515 способов доставки. Лог: `/private/tmp/claude-502/-Users-ivanprotsko-upready-projects-upready-store/c9f1f7c6-e09d-43f8-8d8b-963322ee5848/scratchpad/live-t6/live-before.log`.
- Что стоит на живой (проба хоста только на чтение, 2026-09-21 18:29 WITA): `mt-backend:latest` = образ `a0015a163680` от 2026-09-16 15:32 CEST, контейнер работает 4 дня, healthy; `mt-panel:latest` = `eb33f734473a`; `mt-storefront:latest` = `9d3629f5ca35`. Это деплой d09, коммит `3859e6b8` (`/Users/ivanprotsko/upready/projects/upready-store/artifacts/docs/d09-deploy-integrations/report.md`). Файла `field-guard` в работающем backend нет. Дерево кода на хосте: `/opt/upready-store/mt`. Диск: свободно 94 ГБ. Старых откатных тегов (`:d08b-new`, `:d09-new`) на хосте нет.
- Исправление отделяется: все продуктовые файлы PR 109 не менялись между `3859e6b8` и `dev` до PR 109. Миграций в PR 109 нет, миграций backend между `3859e6b8` и `origin/dev` тоже нет. Живая витрина уже умеет жить без `products` у коллекции (`3859e6b8:apps/storefront/src/modules/collections/templates/index.tsx:92`), поэтому релиз состоит из ОДНОГО образа: `mt-backend`. Витрина и панель не пересобираются и не перезапускаются.

## Релиз

Ветка `hotfix/o21-tenant-field-leaks-live` = `3859e6b8` + backend-часть squash-коммита `954c860d` одним коммитом. Sha, `git diff --stat` и результаты проверок вписываются в раздел «Проверки ветки» ниже после отчёта воркера и приёмки лида.

## Порядок деплоя (по образцу d09, каждая команда с хоста выполняется лидом)

1. Проба хоста: `ssh -n -o BatchMode=yes -i ~/.ssh/id_ed25519_contabo root@$CONTABO_SERVER_IP 'echo ok'`.
2. Дамп базы ПЕРВЫМ действием: `docker exec mt-postgres pg_dump -U medusa -d medusa_mt | gzip > /opt/upready-store/backups/mt-medusa_mt-<дата>-pre-t6.sql.gz`, проверить размер (последний дамп d09: 24 МБ) и `gzip -t`.
3. Точка отката: `docker tag mt-backend:latest mt-backend:pre-t6-hotfix` и проверить, что тег указывает на `a0015a163680`.
4. md5 файла `/opt/upready-store/mt/deploy/mt/shipshift.env` ДО.
5. Сухой прогон из чистого экспорта ветки (не из рабочего дерева): `rsync -anv` дерева hotfix в `/opt/upready-store/mt/` с исключениями из рецепта d09 и `deploy/mt/shipshift.env`. Ожидается ровно список backend-файлов релиза. Любой другой файл в списке означает, что дерево хоста не равно `3859e6b8`: СТОП, без деплоя.
6. rsync БЕЗ `--delete` (релиз только добавляет и меняет файлы, ничего не переименовывает). md5 `shipshift.env` ПОСЛЕ равен md5 ДО.
7. Сборка одного образа отсоединённо: `setsid nohup docker compose -p mt -f deploy/compose.mt.yml --env-file deploy/mt/shipshift.env build backend > /opt/upready-store/mt-build-t6-<дата>.log 2>&1 < /dev/null &`. Следить за логом, не за `pgrep`. В логе: `Built`, ноль `failed to solve`, ноль `error TS`, строка гварда `verify-runtime-modules`.
8. До подъёма: в новом образе есть `field-guard.js` и `tenant-files/static-headers.js` (`docker run --rm --entrypoint sh mt-backend:latest -c 'find /app -name "field-guard*"'`), `sharp` загружается.
9. `docker compose -p mt -f deploy/compose.mt.yml --env-file deploy/mt/shipshift.env up -d --no-build backend`. Ждать `healthy`. Панель и витрина не пересоздаются.
10. Проверка ПОСЛЕ, в этом порядке:
    - маркер сборки: `field-guard.js` в РАБОТАЮЩЕМ контейнере есть, в образе `mt-backend:pre-t6-hotfix` нет;
    - те же анонимные GET, что до деплоя, плюс верхний регистр пути, завершающий слэш, повторённый `fields`: в ответе только `id`, способов доставки 0;
    - живые витрины `https://cherkashino.shipshift.dev/ru`, `/ru/store`, категория, коллекция, товар, корзина: 200 и глазами на 1440 и 390; добавление в корзину;
    - один вход владельца в `https://panel.shipshift.dev`, список заказов, заказ, товар. Нужен логин владельца: у лида его нет, если HQ или Иван его не дадут, этот пункт будет записан как НЕ выполненный;
    - лог backend за первые минуты: строки `[field-guard] … dropped` от собственного трафика витрины и панели, каждая разобрана.

## Откат

Откат не требует пересборки и не трогает базу: релиз не содержит миграций и не меняет данные.

1. `docker tag mt-backend:pre-t6-hotfix mt-backend:latest`
2. `docker compose -p mt -f deploy/compose.mt.yml --env-file deploy/mt/shipshift.env up -d --no-build backend`, ждать `healthy`.
3. Проверить `docker inspect mt-backend --format '{{.Image}}'` = `a0015a163680…` и 200 на витрине.
4. Дерево на хосте вернуть rsync-ом чистого экспорта `3859e6b8` (иначе следующая сборка снова соберёт hotfix). Новые файлы релиза при этом удалить по списку из шага 5 деплоя, не через `--delete`.

Условия отката: backend не стал `healthy` за 5 минут; любая страница живой витрины отвечает не 200 или корзина не работает; вход владельца в панель не проходит; в логе `[field-guard] dropped` для поля, без которого сломан экран покупателя на витрине.

Цена отката: утечка снова открыта. База цела в обоих направлениях; дамп из шага 2 нужен только на случай непредвиденного.

## Что релиз НЕ делает

- Не отзывает уже раскрытое: e-mail владельцев считать раскрытыми; у кода привязки Telegram есть срок жизни.
- Не удаляет уже загруженные не-картинки из папки медиа.
- Экран покупателя в панели перестанет показывать адресную книгу покупателя (она одна на все магазины).

## Проверки ветки

Ветка `origin/hotfix/o21-tenant-field-leaks-live`, один коммит `3d8a004851995efc8dcfdf1b7be882140b490c97` поверх `3859e6b8`. Черновой PR 111 (https://github.com/ivanprotsko/upready-store/pull/111) существует только как носитель отчёта: НЕ МЕРЖИТЬ, это ветка релиза, не ветка разработки.

`git diff --stat 3859e6b8 origin/hotfix/o21-tenant-field-leaks-live`: 13 файлов, +1284 −32, все в `apps/backend`: `medusa-config.ts`, `src/api/field-guard.ts`, `src/api/middlewares.ts`, `src/api/__tests__/field-guard.unit.spec.ts`, `src/api/tenants/{branding/upload,shipping-options,uploads}/route.ts`, `src/tenant-files/{static-headers,upload-policy}.ts`, четыре integration-спека. Продуктовые файлы побайтно равны тем же файлам в `origin/dev` (`git diff --stat origin/dev` по ним пуст). Миграций нет, витрина и панель не тронуты.

Проверки воркера 03 на ветке (отчёт 2026-09-21 19:16 WITA, логи в `/private/tmp/claude-502/-Users-ivanprotsko-upready-worktrees-upready-store-refactor-o21-architecture-review/a599f988-df72-4c8d-8d6d-bfcc23f84ab6/scratchpad/hotfix/out/`):

- `check:backend-build` exit 0; `check:backend-fixtures` exit 0; `tsc --noEmit` exit 0; `medusa lint` 0 ошибок, 102 предупреждения; unit 1172 из 1172.
- Integration: 34 спека из 35 зелёные, по одному спеку на процесс. КРАСНЫЙ один: `auth-yandex.spec.ts`, 3 теста из 11. Он так же красный на чистом `3859e6b8` (лог `int-auth-yandex-on-3859e6b8.log`): на этой машине нет `YANDEX_CLIENT_ID`. Релиз этот спек не меняет и не задевает. Это единственное красное; по букве условия «a check is red» лид выносит его Ивану явно, а не решает сам.
- `next build` витрины `3859e6b8`: exit 0. Проходы по стенду (hotfix backend + витрина и панель `3859e6b8`): воронка покупки 7 PASS, кабинет покупателя 8 PASS, панель 11 PASS.
- Аудит 140 строк `fields` витрины и панели на `3859e6b8`: гвард срезает три, ни одна не нужна экрану: `*products` на `/store/collections` (шаблон берёт товары отдельным запросом), `*orders` на `/store/customers/me` (это утечка D-1: заказы покупателя из всех магазинов; страница заказов ходит в `/store/orders`), `*addresses` на экране покупателя в панели (адресная книга исчезает, это известная цена).

Приёмка лида на том же стенде (2026-09-21 19:17–19:21 WITA, backend `http://localhost:9341`, витрина `http://acme.localhost:8341`, панель `http://localhost:5341`):

- Свой зонд `/private/tmp/claude-502/-Users-ivanprotsko-upready-projects-upready-store/c9f1f7c6-e09d-43f8-8d8b-963322ee5848/scratchpad/accept109/probe.sh`, лог `…/scratchpad/accept111/probe-hotfix.log`: T-6, K1, K3, K4, K5 закрыты (в ответе только `id`, способов доставки 0, товаров чужого магазина 0, адресов 0), T-5: свои 2 способа, по складу чужого магазина 0, загрузка `.html` отклонена 400.
- Варианты обхода: завершающий слэш, `/STORE/PRODUCTS`, `/Store/Products/` с `%2A`, повторённый `fields=…&fields=…`, `fields[]=…`: во всех только `id`. `/store//products` и `/store/%70roducts`: 404 (маршрута нет), гвард при этом всё равно срезал поле.
- Старая витрина глазами на 1440 и 390: каталог, общая коллекция (виден только товар своего магазина), товар, добавление в корзину, корзина с 1 строкой; 0 ошибок страницы, 0 ответов 5xx.
- Вход владельца в старую панель через форму: заказы, заказ (адрес доставки самого заказа на месте), товары, товар, клиенты, клиент; 0 ответов 4xx/5xx от backend.
- Чего ждать в логе живой: `[field-guard] GET /store/customers/me dropped fields=*orders` на каждом заходе вошедшего покупателя, `GET /store/collections… dropped fields=*products`, `GET /tenants/customers/<id> dropped fields=*addresses`. Это штатные строки, не повод для отката.

Сухой прогон против живого хоста (лид, 2026-09-21 19:22 WITA, только чтение): `rsync -rlcnv` чистого экспорта `3d8a0048` (`git archive`, 7009 файлов) в `/opt/upready-store/mt/` с исключениями рецепта и `deploy/mt/shipshift.env`, сравнение по контрольным суммам, rc=0. В списке ровно 13 файлов релиза и ни одного другого: дерево на хосте побайтно равно `3859e6b8`. Лог: `/private/tmp/claude-502/-Users-ivanprotsko-upready-projects-upready-store/c9f1f7c6-e09d-43f8-8d8b-963322ee5848/scratchpad/live-t6/rsync-dry.log`. Шаги 5 и 6 деплоя выполняются с теми же флагами `-rlc` (без `-t`: у экспорта свежие времена файлов, без `-c` rsync перечислил бы всё дерево).
