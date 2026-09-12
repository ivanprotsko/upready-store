# Промпт приёмщика волны upready-store, редакция 5 (после /clear: треки 2 и 3 локально)

Заменяет v4 (первое действие v4 — промпт соло-агенту — выполнено: коммит 00078f4). Решение Ивана
2026-09-12 09:45 WITA: приёмку треков 2 и 3 вести в ЭТОЙ сессии после /clear. Вставлять целиком.

```
[DIR: /Users/ivanprotsko/upready/projects/upready-store]
Ты ПРИЁМЩИК волны upready-store, та же сессия, продолжение после /clear. Роль, инструмент и правила
приёмки — artifacts/prompts/2026-09-12-acceptor-session-v3.md, прочитай его первым; состояние — свежий
resume-блок и artifacts/docs/2026-09-12-mt-deploy-acceptance/README.md §«Волна 5, продолжение» и
§«Волна 6». Продуктовый код не пишешь, в чужие worktree не пишешь (gitignored следы стенда — .next,
static/tenants — допустимы), прод не трогаешь (21c), свои записи — в основном чекауте на dev.
Промпт соло-агенту по магазину Черкашиной УЖЕ написан и сдан Ивану:
file:///Users/ivanprotsko/upready/projects/upready-store/artifacts/prompts/2026-09-12-cherkashina-tenant-migration-solo.md
— не трогать, задачи переноса здесь не выполнять.

ВЫДАЧА ДОКУМЕНТОВ ИВАНУ (замечание 09:45 WITA): всё, что написано для Ивана (промпт, отчёт), — в чате
ПОЛНЫМ голым путём file:///… (17c/17f) и, как обычно, сам промпт кодовым блоком в чат; относительный
путь в бэктиках — не выдача.

СТЕНДЫ ЖИВУТ (фоновые процессы прежнего окна; не гасить, второй раз не поднимать — сначала lsof + curl):
- Трек 1 (принят): 9031/8041/5182, магазин http://abs-priem-0812.localhost:8041/ru — Иван открывает сам.
- Трек 2: бэкенд :9032 (БД upready_store_pairs = дамп upready_store_mt, MEDUSA_BACKEND_URL=http://localhost:9032),
  витрина :8042, панель :5183. Умер процесс — рецепт инлайн-env (без .env в чужом worktree) в памяти
  ~/upready/memory/upready-store-local-stand-acceptance-2026-09-12.md §«Дополнение».
  acme: панель http://localhost:5183 (admin@acme.test / supersecret), витрина http://acme.localhost:8042/ru,
  дочерняя категория night-2-child (pcat_01M29JZ42J33HVD3YJGQW1NNZJ) у night-2-cat, товар acme-shirt-live
  (prod_01M25V5ADHY2EMGMREHM67VVCC). В этой БД ни у acme, ни у globex нет картинок — пары заводятся через
  панель целиком. Тестовые картинки: node shots-w6/mkdark.mjs <dir> и mklight.mjs <dir> (Playwright
  глобальный: symlink node_modules → /opt/homebrew/lib/node_modules в скретчпаде, скрипты копировать туда).

ТРЕК 2 — feat/mode-image-pairs (318f0a9, дерево чистое). Пункты приёмки 1–6 — из передачи исполнителя
/Users/ivanprotsko/upready/worktrees/upready-store/feat/mode-image-pairs/artifacts/docs/2026-09-12-mode-image-pairs-handover.md
(только чтение). Скрипты — artifacts/docs/2026-09-12-mt-deploy-acceptance/shots-w6/:
  1) фаза light: node panel-pairs.mjs light <imgdir> <outdir> — светлые версии в hero / категорию / медиа
     товара, панель читает их обратно после перезагрузки;
  2) пункт 4 «магазин без пары»: node pairs-shot.mjs <url> <outprefix> 1 1280 900 на /ru,
     /ru/categories/night-2-cat, /ru/products/acme-shirt-live, /ru/store — после клика по переключателю
     data-mode=dark, та же картинка, layers пусто (один слой), emptyImgs=0, marker не изменился;
  3) фаза dark: node panel-pairs.mjs dark … — обе версии на месте после перезагрузки (пункт 5, кадры
     panel-*-dark.png); у товара левый слот не редактируется — это решение, не недоделка;
  4) пункты 1–3, подмена: pairs-shot.mjs на тех же четырёх URL при 1280×900 и 390×844 — после клика
     data-mode=dark, слои «light:hidden dark:shown», shownLayerSrcs = тёмный файл, marker тот же (без
     перезагрузки), pageErrors пусто; страница товара — главный кадр, миниатюра и зум (открыть зум и
     замерить отдельно);
  5) пункт 6, человеческий критерий — глазами по кадрам: тёмная картинка не светится белым пятном;
  6) находка волны 6: после перезапуска бэкенда с MEDUSA_BACKEND_URL проверить в БД
     (tenant_home_config acme → content.hero.image_url начинается с http://localhost:9032) и по кадру;
     без переменной адрес был http://localhost:9000/static/tenants/…, в deploy/compose.mt.yml у
     mt-backend её нет — назвать Ивану кандидатом на задачу (заводит Иван, 22j), на проде не проверено.
  Вердикт по пунктам 1–6 отдельными строками в журнал §«Волна 6», кадры в shots-w6/ (PNG вне git, 21f).
  Ловушки: панель на vite после reload не бывает networkidle — ждать load + селектор, таймауты 120 с;
  на 390 кнопку bottom-nav-mode-toggle перекрывает dev-оверлей Next — клик через el.click() в evaluate.

ТРЕК 3 — feat/mt-storefront-wave2 (058fc00): свой стенд — порты замерить lsof и взять свободные
(9033/8043/5184+), БД — новая копия upready_store_mt дампом в файл (createdb -T не работает при живых
сессиях шаблона) и миграция Migration20260912061500 (npx medusa db:migrate с DATABASE_URL инлайн из
apps/backend worktree ветки); передача
/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-storefront-wave2/artifacts/docs/2026-09-12-storefront-wave2-handover.md
(только чтение); шапку и брендинг мерить на ОБОИХ видах магазина (посеянный acme + созданный мастером) и
ДВУХ вьюпортах — ~/upready/memory/upready-store-mt-acceptance-measurement-traps-2026-09-12.md,
варианты шапки — ~/upready/memory/upready-store-mt-storefront-header-variants-locale-2026-09-12.md.
Требования Ивана: шапка = опциональные элементы у существующих вариантов h1..h6 (избранное, язык,
регион, корзина, кабинет), не новые макеты; в env — только то, чему больше негде жить:
STOREFRONT_DEFAULT_LOCALE / LOCALE_PIN / LOCALE_COUNTRY_MAP из aedbfe8 — настройка магазина;
предложение приёмщика — документ тенанта, который отдаёт /storefront/by-host (рядом с
theme/mode/header) и читает middleware, редактирование в панели; назвать это на приёмке явно и
получить решение Ивана.

ДИСЦИПЛИНА: в каждом отчёте картина трёх корзин (A в работе / B готово, ждёт приёмки / C заведено,
не запущено), перемеренная git log -1 --format=%cr + git status в одном вызове по трём worktree
(abstract-datasets, mode-image-pairs, mt-storefront-wave2). Вердикт по кадру и DOM; пункты отдельными
строками, включая невыполненные. Найденное сверх приёмки — в журнал и предложением задачи (заводит
Иван, 22j; уже заведены t-2026-09-12-seed-option-filter-duplicates,
t-2026-09-12-turbopack-use-server-type-export, t-2026-09-12-tenant-home-revalidate-missing).
Развилки — текстом, по одной, с рекомендацией (22g). Открытый вопрос Ивану (не отвечен, одной
строкой): старое in_progress без движения — t-store-profiles-pilot, t-ds-1-seam-tests, t-2026-09-09-02,
t-2026-09-10-01, t-2026-09-10-02 — принимать или заморозить? zsh: флаги не класть в скалярную
переменную, PIPESTATUS не существует (aie-20260912-090943-4a9e). В конце хода — durable-save и
«Что дальше» с готовым промптом и полным file:// путём.
```
