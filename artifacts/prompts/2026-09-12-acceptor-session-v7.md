[DIR: /Users/ivanprotsko/upready/projects/upready-store]
Ты ПРИЁМЩИК волны upready-store, продолжение той же работы после /clear. Модель сменена на Fable
по решению Ивана — переоценивать выбор и перемерять его не надо, замер уже сделан и лежит в памяти
(model-latency-and-session-time-by-model-2026-09-12.md): на вызов Fable медленнее Opus в 1.6x, но
приёмочная работа состоит из инструментов, так что цена почти не видна.

ПРОЧТИ ПЕРВЫМ, в этом порядке:
1. artifacts/prompts/2026-09-12-acceptor-session-v3.md — роль, инструмент, правила приёмки.
2. artifacts/prompts/2026-09-12-acceptor-session-v6.md — порядок пунктов 1-6, SQL лечения стенда,
   замеренные ловушки панели, скрипты. Он остаётся действующим: v7 его НЕ заменяет, а дополняет.
3. artifacts/docs/2026-09-12-mt-deploy-acceptance/README.md, разделы «Волна 5, продолжение» и
   «Волна 6» — состояние приёмки.
Свежий resume-блок поднимет context-restore-guard сам; если его нет —
/Users/ivanprotsko/upready/.ai/resume/upready-store/latest.md.

ГРАНИЦЫ: продуктовый код не пишешь, в чужие worktree не пишешь (gitignored следы стенда — .next,
static/tenants — допустимы), прод НЕ ДЕПЛОИШЬ и не меняешь (21c); читать прод можно. Свои записи —
в основном чекауте на dev. Выдача документов Ивану — полным голым путём file:///… в чате, промпт
кодовым блоком (17c/17f); относительный путь в бэктиках выдачей не считается.

ПЕРВОЕ ДЕЛО — задание Ивана 09:58, не выполнено двумя окнами. Проверить по ЖИВОМУ ПРОДУ находку про
битые адреса загрузок. Механизм уже поправлен замером (aie-20260912-101432-e99a): дело НЕ в
MEDUSA_BACKEND_URL, а в apps/backend/medusa-config.ts:12 `useS3 = isProd && Boolean(S3_BUCKET)` —
модуль S3 подключается только при этом условии (:121), иначе дефолтный локальный провайдер Medusa с
зашитым http://localhost:9000. Проверка = два вопроса К ХОСТУ, не к файлу:
  (1) docker inspect mt-backend — есть ли S3_BUCKET / S3_ENDPOINT в окружении контейнера;
  (2) прод-БД mt-postgres, ТОЛЬКО ЧТЕНИЕ — есть ли вхождения localhost:9000 в tenant_home_config,
      product_category.metadata, image.url.
Доступ к хосту — deploy/README.md (CONTABO_SERVER_IP из ~/upready/.env.keys, ключ
~/.ssh/id_ed25519_contabo, BatchMode=yes). Вывод docker/ps сужать (cut -c1-200), иначе жирный
результат съедает окно. Подтвердится — назвать Ивану кандидатом в задачу НОВОЙ ВОЛНЫ (заводит Иван,
22j) с формулировкой «картинки, загруженные владельцем через панель, битые на проде» и предложением
чинить настройкой файлового модуля.

ДАЛЬШЕ — пункты приёмки трека 2 (feat/mode-image-pairs, 318f0a9) в порядке v6:
  • пункт 4 «магазин без пары» ПЕРВЫМ, пока тёмных версий нет нигде (image_url_dark = null);
  • фаза dark через panel-pairs.mjs, СРАЗУ после каждой загрузки — SQL лечения стенда из v6;
  • пункты 1-3 подменой на 1280x900 и 390x844, страница товара = главный кадр, миниатюра и зум;
  • пункт 6 — человеческий критерий глазами по кадрам;
  • вердикт по пунктам 1-6 ОТДЕЛЬНЫМИ строками в журнал §«Волна 6», включая невыполненные; кадры в
    artifacts/docs/2026-09-12-mt-deploy-acceptance/shots-w6/ (PNG вне git, 21f).
Фаза light уже пройдена и проверена в БД — не перепроверять: hero acme в
tenant_home_config.config.content.hero.image_url, плитка категории night-2-child в
product_category.metadata.image_url, товар acme-shirt-live — 1 строка в image (thumbnail пуст,
витрине это не мешает: светлая версия = thumbnail, иначе images[0], lib/util/mode-image.ts:14).

ПОТОМ ТРЕК 3 — feat/mt-storefront-wave2 (058fc00), не начат. Свой стенд: порты замерить lsof и взять
свободные (9033/8043/5184+), БД — новая копия upready_store_mt дампом в файл (createdb -T не работает
при живых сессиях шаблона) и миграция Migration20260912061500 (npx medusa db:migrate с DATABASE_URL
инлайн из apps/backend того worktree). Передача (только чтение):
/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-storefront-wave2/artifacts/docs/2026-09-12-storefront-wave2-handover.md
Шапку и брендинг мерить на ОБОИХ видах магазина (посеянный acme и созданный мастером) и ДВУХ
вьюпортах — ловушки в ~/upready/memory/upready-store-mt-acceptance-measurement-traps-2026-09-12.md,
варианты шапки — ~/upready/memory/upready-store-mt-storefront-header-variants-locale-2026-09-12.md.

СТЕНДЫ ЖИВЫ (фоновые процессы прежних окон; не гасить, второй раз не поднимать — сначала lsof + curl):
  • Трек 1, принят: 9031/8041/5182. Мастер http://localhost:8041/start и /start/onboarding.
  • Трек 2: бэкенд :9032 (БД upready_store_pairs), витрина :8042, панель :5183. acme —
    admin@acme.test / supersecret, http://acme.localhost:8042/ru, категория night-2-child
    pcat_01M29JZ42J33HVD3YJGQW1NNZJ, товар acme-shirt-live prod_01M25V5ADHY2EMGMREHM67VVCC.
  • Умер процесс — рецепт инлайн-env в
    ~/upready/memory/upready-store-local-stand-acceptance-2026-09-12.md §«Дополнение».

ДИСЦИПЛИНА: в каждом отчёте картина трёх корзин (A в работе / B готово, ждёт приёмки / C заведено,
не запущено), перемеренная одним вызовом `git log -1 --format=%cr` + `git status` по трём worktree
(abstract-datasets, mode-image-pairs, mt-storefront-wave2). Вердикт по кадру И DOM, пункты
отдельными строками. Найденное сверх приёмки — в журнал и предложением задачи (заводит Иван, 22j;
уже заведены t-2026-09-12-seed-option-filter-duplicates, t-2026-09-12-turbopack-use-server-type-export,
t-2026-09-12-tenant-home-revalidate-missing). Развилки — текстом, по одной, с рекомендацией (22g).
В zsh нет PIPESTATUS и нет расщепления слов: пачка флагов в скаляре ломается молча (19d).
В конце хода — durable-save и «Что дальше» с готовым промптом и полным file:// путём.

ОТКРЫТЫЙ ВОПРОС ИВАНУ (задан трижды, ответа нет, зарегистрирован как q-starye-zadachi-v-in-progress):
пять задач в in_progress без движения — t-store-profiles-pilot, t-ds-1-seam-tests, t-2026-09-09-02,
t-2026-09-10-01, t-2026-09-10-02 — принимать или заморозить? Рекомендация: заморозить в backlog.
