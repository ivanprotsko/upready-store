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

(заполняется после отчёта воркера и приёмки лида)
