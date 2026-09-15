# Приёмка PR #45 · f06-shipping-method-names · раунд 2 — MERGED

Приёмщик: headless `claude -p`. Замеры собственные (правило 18f), тексту PR не доверял.
Мердж-коммит `e9ceb9b270b27cc8a5fd8159d3edc89afd1cd0f1`, `mergedAt` 2026-09-15T06:53:29Z (UTC).

## Блокер раунда 1 снят
`mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`. Конфликт `HANDOFF.json` разрешён мерджем
`87f249f` (origin/dev в ветку). Дерево worktree чистое, HEAD = origin/fix/day16-shipping-names = `4ba9bad`.
Новое после раунда 1: мердж dev, `7c1035f` (короткая подсказка самовывоза + разовый скрипт),
`4ba9bad` (handoff). Скоуп не расширился: 26 файлов, все по задаче.

## Критерии
1. **API** ✓ `GET /store/shipping-options?cart_id=…` для живой корзины cherkashino (HTTP 200, регион rub,
   товар «Свечи АСД с чесноком»), полный JSON — `shipping-options-cherkashino.json`:
   `Самовывоз` amount 0, описание «Заберите заказ у продавца.», подсказка «Адрес пришлём после заказа»;
   `Курьером` amount 300, описание «До двери. Стоимость подтвердит магазин.», `tariff_source: provisioned-default`.
   `type.label` совпадает с именем. Имени магазина и английских слов в видимых строках нет
   (`type.code` pickup/courier — машинный код, на экран не попадает, проверено в п.2).
2. **Экран** ✓ мои скриншоты `accept-checkout-1280x900.png`, `accept-checkout-390x844.png`
   (`https://cherkashino.shipshift.dev/ru/checkout`, настоящая корзина, Playwright).
   Поиск по body: `Оксана Черкашина pickup`=false, `/courier/i`=false, `/pickup/i`=false,
   `Самовывоз`=true, `Курьером`=true. Глазами: блок «Способ доставки», две карточки, у каждой
   цена и пояснение; «Бесплатно» больше не прижато подсказкой (нит раунда 1 снят).
3. **Повторный прогон** — по коду, собственного прогона нет: переименование это запись в прод-БД,
   приёмщику запрещена. `isMachineMadeDefaultName` — точное равенство `${tenantName} pickup/courier`,
   у переименованных `null`; ветка `typeOnly` пишет только при расхождении label/description, а
   замеренное живое состояние уже равно целевому. Согласуется с «все нули» автора, но не подтверждено замером.
4. **Сосед** ✓ `zolotaya-nit-1057.shipshift.dev` HTTP 200, `shipping-options-zolotaya-nit.json`
   побайтово совпадает с замером раунда 1: `Золотая нить pickup` 0 / `Золотая нить courier` 10, `data: null`.

## Проверки репозитория (worktree)
```
apps/backend$ npx tsc --noEmit                              rc=0, без вывода
apps/backend$ TEST_TYPE=unit npx jest src/shipping-tariffs  2 suites / 15 tests passed, rc=0
```
Секретов, миграций, удалений, правок защищённой инфраструктуры в диффе нет.
`docker-entrypoint.sh` шаг 5 — косметический, под `set +e`, с предупреждением в лог при ненулевом коде.

## Мелочи (в PR-комментарий, не блокеры)
1. Локаль шага 5 энтрипойнта одна на весь бэкенд (`STOREFRONT_DEFAULT_LOCALE`).
2. Бейдж «Стоимость по умолчанию — укажите свою» в панели `/shipping` глазами не проверен (нужен пароль владелицы).
3. Остальные живые тенанты остаются с машинными именами до следующего деплоя.
