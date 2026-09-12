# Промпт приёмщика волны upready-store, редакция 6 (продолжение приёмки треков 2 и 3 после /clear)

Заменяет `2026-09-12-acceptor-session-v5.md`. Роль, дисциплина и правила приёмки — в `…-v3.md`,
читать первым. Вставлять в новое окно ЦЕЛИКОМ.
Что изменилось против v5: фаза light трека 2 ПРОЙДЕНА целиком (главная, категория, товар), адреса
загрузок на стенде переписаны на живой порт бэкенда, механизм находки про `localhost:9000`
перемерен и назван неверно в v5, Иван попросил проверить находку по живому проду.

```
[DIR: /Users/ivanprotsko/upready/projects/upready-store]
Ты ПРИЁМЩИК волны upready-store, та же сессия, продолжение после /clear. Роль, инструмент и правила
приёмки — artifacts/prompts/2026-09-12-acceptor-session-v3.md, прочитай его первым; состояние —
свежий resume-блок и artifacts/docs/2026-09-12-mt-deploy-acceptance/README.md §«Волна 5,
продолжение» и §«Волна 6». Продуктовый код не пишешь, в чужие worktree не пишешь (gitignored следы
стенда — .next, static/tenants — допустимы), прод НЕ ДЕПЛОИШЬ и не меняешь (21c); читать прод
можно. Свои записи — в основном чекауте на dev.

ВЫДАЧА ДОКУМЕНТОВ ИВАНУ: всё, что написано для Ивана (промпт, отчёт), — в чате ПОЛНЫМ голым путём
file:///… (17c/17f) и сам промпт кодовым блоком; относительный путь в бэктиках — не выдача.

СТЕНДЫ ЖИВЫ (фоновые процессы прежних окон; не гасить, второй раз не поднимать — сначала lsof + curl):
- Трек 1 (принят): 9031/8041/5182. Магазин http://abs-priem-0812.localhost:8041/ru; мастер
  http://localhost:8041/start и http://localhost:8041/start/onboarding (прогрет 10:0x, 200) — эту
  ссылку Иван просил 10:06, он открывает её сам.
- Трек 2: бэкенд :9032 (БД upready_store_pairs, MEDUSA_BACKEND_URL=http://localhost:9032), витрина
  :8042, панель :5183. Умер процесс — рецепт инлайн-env в
  ~/upready/memory/upready-store-local-stand-acceptance-2026-09-12.md §«Дополнение».
  acme: панель http://localhost:5183 (admin@acme.test / supersecret), витрина
  http://acme.localhost:8042/ru, дочерняя категория night-2-child
  (pcat_01M29JZ42J33HVD3YJGQW1NNZJ), товар acme-shirt-live (prod_01M25V5ADHY2EMGMREHM67VVCC).

ЧТО УЖЕ СДЕЛАНО ПО ТРЕКУ 2 (feat/mode-image-pairs, 318f0a9, дерево чистое)
- Фаза light ПРОЙДЕНА и проверена в БД: hero acme (tenant_home_config.config.content.hero.image_url),
  плитка категории night-2-child (metadata.image_url), картинка товара acme-shirt-live (1 строка в
  image; thumbnail пуст — витрине это не мешает, светлая версия товара = thumbnail, иначе images[0],
  lib/util/mode-image.ts:14). Тёмных версий пока НЕТ нигде (image_url_dark = null) — это ровно то
  состояние, в котором меряется пункт 4 «магазин без пары».
- Адреса загрузок на стенде переписаны SQL-ом с http://localhost:9000 на http://localhost:9032
  (три таблицы: tenant_home_config, product_category.metadata, image.url; проверено — файл
  отдаётся, 200, 235294 байта). Без этого кадры приёмки были бы битыми: локальный файловый
  провайдер Medusa зашивает localhost:9000. Это ЛЕЧЕНИЕ СТЕНДА, а не исправление дефекта.

ПОРЯДОК РАБОТЫ — пункты приёмки 1–6 из передачи исполнителя (только чтение)
/Users/ivanprotsko/upready/worktrees/upready-store/feat/mode-image-pairs/artifacts/docs/2026-09-12-mode-image-pairs-handover.md
Скрипты — artifacts/docs/2026-09-12-mt-deploy-acceptance/shots-w6/ (PNG вне git, 21f):
 1) ПУНКТ 4 «магазин без пары», СНАЧАЛА, пока тёмных версий нет:
    node pairs-shot.mjs <url> <outprefix> 1 1280 900 на http://acme.localhost:8042/ru,
    /ru/categories/night-2-cat, /ru/products/acme-shirt-live, /ru/store — после клика по
    переключателю data-mode=dark, та же картинка, layers пусто (один слой), emptyImgs=0,
    marker не изменился.
 2) Фаза dark: node panel-pairs.mjs dark <imgdir> <outdir> — обе версии на месте после
    перезагрузки (пункт 5, кадры panel-*-dark.png); у товара левый слот не редактируется — это
    решение, не недоделка. ПОСЛЕ загрузки СРАЗУ переписать адреса тем же SQL-ом (см. ниже).
 3) Пункты 1–3, подмена: pairs-shot.mjs на тех же четырёх URL при 1280×900 и 390×844 — после
    клика data-mode=dark, слои «light:hidden dark:shown», shownLayerSrcs = тёмный файл, marker
    тот же (без перезагрузки), pageErrors пусто; страница товара — главный кадр, миниатюра и зум
    (открыть зум и замерить отдельно).
 4) Пункт 6, человеческий критерий — глазами по кадрам: тёмная картинка не светится белым пятном.
 5) Вердикт по пунктам 1–6 отдельными строками в журнал §«Волна 6», кадры в shots-w6/.

SQL лечения стенда (после каждой загрузки через панель), psql = /opt/homebrew/opt/postgresql@16/bin/psql,
БД postgres://$(whoami)@127.0.0.1:5433/upready_store_pairs:
  update tenant_home_config set config = replace(config::text,'http://localhost:9000','http://localhost:9032')::jsonb where config::text like '%localhost:9000%';
  update product_category set metadata = replace(metadata::text,'http://localhost:9000','http://localhost:9032')::jsonb where metadata::text like '%localhost:9000%';
  update image set url = replace(url,'http://localhost:9000','http://localhost:9032') where url like 'http://localhost:9000%';

ЗАДАНИЕ ИВАНА 09:58 — ПРОВЕРИТЬ НАХОДКУ ПО ЖИВОМУ ПРОДУ
Формулировка v5 («без MEDUSA_BACKEND_URL адреса = localhost:9000») ОШИБОЧНА и уже занесена в журнал
ошибок (aie-20260912-101432-e99a): переменная стоит в живом бэкенде стенда (ps -Ewww), а адреса всё
равно localhost:9000. Настоящая причина — выбор модуля файлов: apps/backend/medusa-config.ts:12
`useS3 = isProd && Boolean(S3_BUCKET)`, модуль S3 подключается только при этом (:121), иначе
дефолтный локальный провайдер Medusa с зашитым localhost:9000. Проверка прода = два вопроса К ХОСТУ,
не к файлу (в deploy/compose.mt.yml ветки fix/mt-storefront-head-footer S3_-переменных нет, NODE_ENV:
production есть): (1) docker inspect mt-backend — есть ли S3_BUCKET/S3_ENDPOINT в окружении
контейнера; (2) прод-БД mt-postgres, чтение: есть ли адреса localhost:9000 в tenant_home_config,
product_category.metadata, image.url. Доступ к хосту — deploy/README.md (CONTABO_SERVER_IP из
~/upready/.env.keys, ключ ~/.ssh/id_ed25519_contabo, BatchMode=yes). Подтвердится — назвать Ивану
кандидатом в задачу НОВОЙ ВОЛНЫ (заводит Иван, 22j), с формулировкой «картинки, загруженные
владельцем через панель, битые на проде» и предложением чинить настройкой файлового модуля.

ТРЕК 3 — feat/mt-storefront-wave2 (058fc00): свой стенд — порты замерить lsof и взять свободные
(9033/8043/5184+), БД — новая копия upready_store_mt дампом в файл (createdb -T не работает при живых
сессиях шаблона) и миграция Migration20260912061500 (npx medusa db:migrate с DATABASE_URL инлайн из
apps/backend worktree ветки); передача
/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-storefront-wave2/artifacts/docs/2026-09-12-storefront-wave2-handover.md
(только чтение); шапку и брендинг мерить на ОБОИХ видах магазина (посеянный acme + созданный
мастером) и ДВУХ вьюпортах — ~/upready/memory/upready-store-mt-acceptance-measurement-traps-2026-09-12.md,
варианты шапки — ~/upready/memory/upready-store-mt-storefront-header-variants-locale-2026-09-12.md.
Требования Ивана: шапка = опциональные элементы у существующих вариантов h1..h6 (избранное, язык,
регион, корзина, кабинет), не новые макеты; в env — только то, чему больше негде жить:
STOREFRONT_DEFAULT_LOCALE / LOCALE_PIN / LOCALE_COUNTRY_MAP из aedbfe8 — настройка магазина;
предложение приёмщика — документ тенанта, который отдаёт /storefront/by-host (рядом с
theme/mode/header) и читает middleware, редактирование в панели; назвать это на приёмке явно и
получить решение Ивана.

ИНСТРУМЕНТ И ЛОВУШКИ (проверены замером, не повторяй их заново)
- Playwright глобальный: в скретчпаде симлинк node_modules → /opt/homebrew/lib/node_modules, скрипты
  копировать туда. Тестовые картинки для пар: node mkdark.mjs <dir> и node mklight.mjs <dir>
  (скретчпад НОВОЙ сессии пуст — сгенерировать заново, светлые уже загружены, нужны тёмные).
- Панель: экран медиа товара живёт за ?view=edit; в форме ДВА input[type=file] — галерея (без
  data-testid) и тёмный слот product-image-dark-upload. После setInputFiles ждать ≥4 с (при 2.5 с
  сохранение уходит впустую: POST /tenants/uploads не успевает). Кнопка Save на маршрутах категории
  и товара стоит ВНЕ вьюпорта — клик только через el.click() в evaluate. Vite после reload не бывает
  networkidle — ждать load + селектор, таймауты 120 с.
- Витрина на 390: кнопку bottom-nav-mode-toggle перекрывает dev-оверлей Next — клик через el.click().
- zsh: флаги не класть в скалярную переменную, PIPESTATUS не существует; вывод ps/docker сужать
  (cut -c1-200), иначе жирный результат съедает окно.

ДИСЦИПЛИНА: в каждом отчёте картина трёх корзин (A в работе / B готово, ждёт приёмки / C заведено,
не запущено), перемеренная git log -1 --format=%cr + git status в одном вызове по трём worktree
(abstract-datasets, mode-image-pairs, mt-storefront-wave2). Вердикт по кадру и DOM; пункты
отдельными строками, включая невыполненные. Найденное сверх приёмки — в журнал и предложением задачи
(заводит Иван, 22j; уже заведены t-2026-09-12-seed-option-filter-duplicates,
t-2026-09-12-turbopack-use-server-type-export, t-2026-09-12-tenant-home-revalidate-missing).
Развилки — текстом, по одной, с рекомендацией (22g). Открытый вопрос Ивану (не отвечен, одной
строкой): старое in_progress без движения — t-store-profiles-pilot, t-ds-1-seam-tests,
t-2026-09-09-02, t-2026-09-10-01, t-2026-09-10-02 — принимать или заморозить? В конце хода —
durable-save и «Что дальше» с готовым промптом и полным file:// путём.
```
