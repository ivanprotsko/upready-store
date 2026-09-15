# d03-deploy-mt-3 — финальный деплой dev на mt-платформу, волна 3 (attempt 1, чекпойнт 2)

Время чекпойнта: 2026-09-15 11:19 WITA. Статус: деплой В ПРОЦЕССЕ — сборка образов на хосте ещё не завершена
на момент этого чекпойнта.

## Находка: первый rsync ушёл со stale чекаутом (исправлено в этом же прогоне)

Локальный чекаут `dev` в этом каталоге отставал от `origin/dev` (на HEAD стоял старый коммит с чужими
незакоммиченными правками `package.json`, добавляющими `playwright` без обновления `pnpm-lock.yaml`), хотя
`git fetch` уже показывал актуальный `origin/dev`. Шаг 1 рецепта (`git fetch && git status`) НЕ обновляет
рабочее дерево — я по рецепту пропустил синхронизацию воркдира с `origin/dev` перед rsync. Из-за этого:
- первый `rsync` (05:08 WITA) отправил на хост старый код + грязный `package.json`;
- первая сборка (`mt-build-20260915-050851.log`) упала: `ERR_PNPM_OUTDATED_LOCKFILE` — `playwright` в
  `package.json`, которого нет в `pnpm-lock.yaml` (сам playwright — не из этой волны, чужая незакоммиченная
  правка воркдира, попавшая в rsync).

Исправление: `git checkout origin/dev -- .` привёл рабочее дерево к точному состоянию `origin/dev`
(`9269555`, совпадает с `git rev-parse origin/dev`), проверено `git diff --stat HEAD -- . ':(exclude)handoff'`
= пусто. Заодно найдены и удалены 4 файла-сироты (`opengraph-image.png/.alt.txt`,
`twitter-image.png/.alt.txt` от 3 сентября), оставшиеся от старой статической OG-картинки и конфликтующие
с новыми динамическими `opengraph-image.tsx`/`twitter-image.tsx` (внесены сегодняшними задачами) — убраны
и локально, и на хосте (`rm`, вне git, не отслеживались). Второй `rsync` (11:15 WITA) ушёл с чистым
деревом, вторая сборка запущена в лог `mt-build-<ts>-v2.log`.

## Что сделано до чекпойнта

1. **Sha волны 2** (из `artifacts/d02-deploy-mt-2/report.md`): `2508708`.
2. **Sha этой волны:** `origin/dev` на момент запуска — `9269555` (`git rev-parse --short origin/dev`).
   Локальный `HEAD` перед стартом — `f053e42` (отставал от `origin/dev` на служебные коммиты приёмки).
3. **Изменения с волны 2** (`git log --oneline 2508708..origin/dev`): 34 коммита, из них 10 задачных PR —
   #29 (t11-seo-redirects), #30 (t09-reviews), #31 (t10-blog), #33 (t13-customers-screen),
   #34 (t14-product-import), #35 (t15-product-attributes), #36 (t16-owner-branding), #37 (t17-analytics),
   #38 (f01-thankyou-brand), #39 (f02-order-email-not-sent), остальные — служебные handoff/приёмочные коммиты.
4. **Полный список PR, смёрженных сегодня** (`gh pr list --repo ivanprotsko/upready-store --state merged
   --search "merged:>=2026-09-15" --json number,title,mergedAt,headRefName --limit 100`, UTC-граница даты —
   поэтому список короче списка волны 2, который использовал более широкое окно):

   | # | PR | Заголовок |
   |---|---|---|
   | 1 | #39 | fix(orders): Письмо о заказе не уходит, а магазин пишет «подтверждение отправлено» (f02-order-email-not-sent) |
   | 2 | #38 | fix(storefront): Страница «Спасибо» после оплаты показывает бренд UPREADY и чужую плашку (f01-thankyou-brand) |
   | 3 | #37 | feat(analytics): Счётчики магазина и сводка продаж в панели (t17-analytics) |
   | 4 | #36 | feat(branding): Бренд владельца: логотип, цвета, фавикон, картинка для соцсетей (t16-owner-branding) |
   | 5 | #35 | feat(catalog): Произвольные характеристики товара и фильтры по ним (t15-product-attributes) |
   | 6 | #34 | feat(products): Импорт и выгрузка каталога таблицей CSV или XLSX (t14-product-import) |
   | 7 | #29 | feat(seo): SEO магазина: мета-поля, sitemap тенанта, 301 со старых адресов (t11-seo-redirects) |

5. **Здоровье магазина клиента до деплоя:** `https://cherkashino.shipshift.dev/ru` → 200.
6. **Env:** забран с хоста (`scp -i ~/.ssh/id_ed25519_contabo`), md5 `b788f1886315a512485e0515aeb8fb53` —
   совпадает с волной 2, секреты не менялись.
7. **Дамп ДО деплоя:** `/opt/upready-store/backups/medusa_mt-pre-d03-20260915-050744.dump`, 5 552 957 байт
   (роль в контейнере — `medusa`, не `postgres`; рецепт в промпте называл `postgres`, реальная роль другая —
   исправлено на месте).
8. **rsync кода** → хост без `--delete`: rc=0.
9. **Сборка образов запущена в фоне** на хосте: `setsid nohup docker compose -p mt -f deploy/compose.mt.yml
   --env-file deploy/mt/shipshift.env build backend storefront panel > /opt/upready-store/mt-build-20260915-050851.log`.
   На момент чекпойнта финальный статус (успех/провал, длительность) ещё не подтверждён этой сессией.
10. **Новые миграции с волны 2** (ещё НЕ применены на момент чекпойнта): модуль `product-review`
    (`Migration20260914211626`), модуль `tenant` (`Migration20260914235154`, `Migration20260915000453`,
    `Migration20260915053700`, `Migration20260916050000`, `Migration20260916050500`).
11. **Новые переменные окружения** с волны 2 (`deploy/mt/shipshift.env.example`): `STORE_PHONE`,
    `STORE_ADDRESS` — опциональные, по коду и комментарию в example-файле пустое значение рендерит пустую
    строку в футере письма, а не падение. На хосте не заданы (**отсутствуют**) — это ожидаемо, не находка.
12. **Медиа** (`/opt/upready-store/media-tenants`): общий размер 117M, 3 тенант-директории; директория
    клиента `ten_01M2GQVGEN1204CN90C510DNRG` (handle `cherkashino`) — тоже 117M, 338 файлов (две другие
    тенант-директории — демо, почти пустые). Риск (см. research §3 «Бэкапы»): этот каталог живёт на одном
    хосте без S3 и без автоматического бэкапа — при потере диска картинки товаров клиента восстановить
    неоткуда. Не чинил, только фиксирую.
13. **5 товарных страниц клиента, замерено ДО деплоя** (случайный выбор из `GET /store/products?limit=10`):
    - svechi-asd-s-chesnokom-10-sht-cherkashino → 200
    - troychatka-plyus-60-kapsul-cherkashino → 200
    - steviya-v-tabletkah-saharozamenitel-100-sht-cherkashino → 200
    - zubnaya-pasta-tayskaya-travyanaya-cherkashino → 200
    - mumie-altayskoe-ochischennoe-naturalnoe-100-cherkashino → 200

## Не сделано на момент чекпойнта

- Подтверждение завершения сборки (`docker compose build`) и `docker compose up -d`.
- Прогон миграций (`medusa db:migrate`) и бэкфиллов (`backfill-hero-copy`, `backfill-option-translations`).
- Финальный health-sweep (5 платформенных URL + 5 карточек) ПОСЛЕ деплоя.
- Дамп ПОСЛЕ деплоя.
- Проверка `docker images … CreatedAt` внутри окна этого прогона.

Продолжение — та же сессия/повторный запуск того же промпта: код уже на хосте (rsync сделан), бэкап ДО
деплоя есть, откатывать/повторять rsync не требуется — проверить состояние сборки
(`ssh -n contabo 'tail -80 /opt/upready-store/mt-build-20260915-050851.log; pgrep -fl "docker compose -p mt"'`)
и продолжить с `up -d`.
