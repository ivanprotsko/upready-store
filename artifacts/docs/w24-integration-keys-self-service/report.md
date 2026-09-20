# w24-integration-keys-self-service — владелец магазина вводит ключи интеграций сам

Ветка `feat/day16-integration-keys-self-service`, отчёт написан 2026-09-16 12:36 WITA.

Приказ Ивана 11:37 WITA: «в админке должна быть возможность указать ключ через поле… мы делаем
SaaS-продукт, пользователи должны иметь возможность указать свои ключи для всех сервисов.
Wildberries, Ozon, Robokassa, ApiShip и тд».

До задачи ключ Wildberries или Ozon попадал в магазин ТОЛЬКО сид-скриптом, который запускаем мы,
а панель печатала владелице команду `pnpm --filter backend wb:seed-key`. Теперь ключ вводится
в поле на карточке площадки, а команд в строках панели не осталось ни одной.

## Что сделано

### Бэкенд — один писатель слотов и поля от адаптера

- `apps/backend/src/tenant-secrets/slot.ts` — **единственный писатель** `tenant_integration_secret`:
  `writeTenantSecretSlot` (шифрует, ОЖИВЛЯЕТ мягко удалённую строку вместо второй живой) и
  `deleteTenantSecretSlot`. `provider` типизирован перечислением модели — у колонки CHECK-констрейнт,
  и слот вне списка падал бы на INSERT при зелёном тайпчеке.
- `apps/backend/src/api/tenants/payment-settings/route.ts` — Robokassa переведена на того же
  писателя (правило 20: шифрование и оживление решаются в одном месте).
- `apps/backend/src/modules/marketplace/contract.ts` — у адаптера появились `credentialSlot`
  (в какой слот пишем) и `credentialFields` (что владелица вводит: имя поля = ключ payload,
  подпись, секретность, подсказка «где это взять», ссылка на документацию площадки).
  `ADAPTER_KEYS` обновлён, `guards.ts` отбивает адаптер с write-слотом, с пустым списком полей,
  без секретного поля и с полем без подсказки/ссылки.
- `apps/backend/src/modules/wb/adapter.ts` — одно поле `api_key` («Токен Wildberries»);
  `apps/backend/src/modules/ozon/adapter.ts` — пара `client_id` + `api_key`. Строки
  `credentialHowTo` переписаны с команды на экран.
- `apps/backend/src/api/tenants/marketplace-keys.ts` — ОДИН обработчик на все площадки:
  `PUT`/`DELETE`/`GET`. Маршруты `/tenants/marketplaces/:marketplace/key` (общий),
  `/tenants/wb/key` и `/tenants/ozon/key` (имена из задачи) зовут его же — одна реализация.
  Ответ = перечитанное состояние: `{ set, last4 }`, поля формы и что ключ сам о себе говорит
  (права, срок, области). Значение ключа не возвращается никогда, в тексте ошибки называется
  ПОЛЕ, а не содержимое. Вызов `inspectCredentials` журналируется в `mp_api_call` (на Ozon это
  реальный запрос).
- Инвариант «только чтение» (приказ Ивана 02:46): форма пишет `adapter.credentialSlot`, а write-слот
  не член ни одного адаптера и запрещён гвардом, поэтому `wildberries_write` формой не заполняется
  структурно. Ключ с правами записи ПРИНИМАЕТСЯ и честно подписывается на экране.

### Панель — форма генерируется из адаптера

- `apps/tenant-panel/src/routes/settings/marketplaces/components/mp-key-form.tsx` — карточка
  «Ключ API»: состояние (`не сохранён` / `сохранён ••••last4`), поля из `connection.fields`
  (секретные — `type=password`), «Сохранить», «Удалить» с диалогом подтверждения. Пустое секретное
  поле = «не менять». Ничего в этом файле не знает слова «Wildberries».
- `mp-card.tsx` — форма стоит первой на карточке и заменила строку «Ключ», которая говорила то же
  самое, но менять ничего не давала.
- `mp-other-integrations.tsx` + `marketplaces.tsx` — хаб перечисляет и НЕ-площадки: Robokassa
  (состояние по `GET /tenants/payment-settings`, ссылка на «Приём оплат») и Доставка (ApiShip/СДЭК)
  со статусом «скоро» и БЕЗ ссылки: экран i02 в `dev` ещё не влит, а ссылка на 404 хуже честной метки.
- `/settings/ozon` заведён и стоит в боковой навигации рядом с Wildberries; оба адреса ведут на
  свою карточку хаба (`#wb`, `#ozon`). Отдельной страницы на площадку нет намеренно: с w12 экран
  площадки генерируется из реестра, и страница-копия перестала бы обновляться (правило 20).
- Строк с командами в панели не осталось: переписаны `credentialHowTo` обоих адаптеров и
  `wildberries.fbs.sync.howTo` в ru/en.
- `docs/tenant-panel/integrations-for-the-owner.md` — памятка владелице, по шагам, без командной строки.

## Как это измерено (живой стенд, правило 18f)

Стенд: база `upready_store_w24` (копия `upready_store_cherkashina` + миграции), бэкенд
`medusa develop` на `:9124`, панель `vite` на `:5196`, тенант `cherkashino`, владелец
`owner-cherkashino@example.test`. Ключ Wildberries — настоящий, из `WB_API_KEY`
(secretRef: `/Users/ivanprotsko/upready/projects/upready-store/.env.cherkashino`), в отчёт,
логи и скриншоты не попадает.

### Сценарий приёмки в браузере — 18 из 18 проверок

```
$ SHOT_DIR=<worktree>/artifacts/docs/w24-integration-keys-self-service \
    node e2e/w24-integration-keys.e2e.mjs
PASS  владелица вошла в панель  — http://localhost:5196/
PASS  /settings/wildberries ведёт на карточку Wildberries  — .../settings/marketplaces#wb
PASS  на карточке Wildberries есть поле для ключа
PASS  поле ключа — пароль, значение не читается с экрана
PASS  карточка показывает «сохранён ••••XXXX»  — сохранён ••••c6Sg
PASS  права ключа обновились без перезагрузки: «только чтение»
PASS  срок действия ключа показан
PASS  таблицы карточки отрисованы (раздел «Уже у нас»)
PASS  /settings/ozon ведёт на карточку Ozon  — .../settings/marketplaces#ozon
PASS  на карточке Ozon есть поля Client-Id и Api-Key
PASS  ключ Ozon сохранён, показаны последние 4 знака
PASS  по выдуманному ключу Ozon показана честная ошибка проверки
      — Права ключа: «не удалось определить», «Не определено: ключ не ответил на
        https://docs.ozon.ru/api/seller/#operation/AccessAPI_RolesByToken»
PASS  хаб перечисляет Robokassa
PASS  хаб перечисляет доставку
PASS  панель открывается на телефоне 390×844
PASS  после удаления карточка показывает «не сохранён»
PASS  ключ не встречается ни в одном ответе /tenants/*  — тел проверено: 39
PASS  слот записи wildberries_write формой не заполнен  — {"set":false,"last4":null}
rc=0, all checks passed
```

Скриншоты (1280×900 и 390×844, вне git):

- `<worktree>/artifacts/docs/w24-integration-keys-self-service/01-wb-key-empty-1280x900.png`
- `<worktree>/artifacts/docs/w24-integration-keys-self-service/02-wb-key-saved-1280x900.png`
- `<worktree>/artifacts/docs/w24-integration-keys-self-service/03-ozon-key-invalid-1280x900.png`
- `<worktree>/artifacts/docs/w24-integration-keys-self-service/04-hub-all-integrations-1280x900.png`
- `<worktree>/artifacts/docs/w24-integration-keys-self-service/05-hub-390x844.png`
- `<worktree>/artifacts/docs/w24-integration-keys-self-service/06-wb-key-removed-1280x900.png`

(`<worktree>` = `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-integration-keys-self-service`.)

Глазами: на 02 — «Ключ API», бейдж «сохранён ••••c6Sg», поле-пароль с глазком, «Права ключа —
только чтение», «Действует до 17.03.2027, 13:20:02», список областей токена. На 390×844 карточка
складывается в одну колонку, бейдж состояния один (после правки: до неё их было два и верхний
наезжал на абзац — видно в первой версии 05).

### Тесты

```
$ pnpm test:unit                      # весь бэкенд
Test Suites: 78 passed, 78 total
Tests:       1065 passed, 1065 total

$ DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9136 \
    pnpm test:integration:http -- integration-tests/http/tenants-marketplace-keys.spec.ts
Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total

$ STORE_PROFILES_MEDIA_BASE_URL=… DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9135 \
    pnpm test:integration:http -- integration-tests/http/tenants-payment-settings.spec.ts
Test Suites: 1 passed, 1 total          # регрессия Robokassa после переезда на общего писателя
Tests:       8 passed, 8 total

$ pnpm check:backend-build              # шаг образа
Backend build completed successfully (9.82s) / Frontend build completed successfully (20.52s), rc=0

$ cd apps/tenant-panel && pnpm build    # tsc --noEmit && vite build
✓ built in 6.80s, rc=0

$ cd apps/backend && npx medusa lint
✖ 95 problems (0 errors, 95 warnings)   # предупреждения были и до задачи
$ cd apps/tenant-panel && npx eslint src
✖ 24 problems (0 errors, 24 warnings)   # то же самое

$ node scripts/check-locale-catalogs.mjs
check-locale-catalogs: OK — 3 catalogs, 36 codes each, all agree.
```

Что доказывает HTTP-спека `integration-tests/http/tenants-marketplace-keys.spec.ts`: сохранение
и маска, шифрование на диске (литерала нет ни в одной колонке `tenant_integration_secret`),
незаполняемый `wildberries_write` даже для ключа С правами записи, пара Ozon и сохранение
секрета, оставленного пустым, отказ на пустое значение и на неизвестное поле, 404 на
незарегистрированную площадку, 401 без токена владельца, изоляция тенантов, DELETE и оживление
строки (одна живая, не две).

### Ключ не утёк в репозиторий

```
$ git grep -n -f <файл с полным ключом> -- .     # значение НЕ печатается
rc=1, строк 0
$ git grep -n -f <файл со знаками 41–64 ключа> -- .
rc=1, строк 0
$ git grep -n "pnpm --filter" -- apps/tenant-panel/src apps/backend/src/modules
rc=1 (ни одного совпадения)
```

Оговорка к формулировке приёмки: `git grep "<первые 12 символов ключа>"` даёт 6 совпадений и
НЕ является проверкой утечки — первые 12 знаков ключа WB это `eyJhbGciOiJF`, константный заголовок
любого JWT (`{"alg":"ES256"…`), и он стоит в фикстурах тестов wb/wb-write. Мерил по всему ключу
(402 знака) и по различающему куску середины — ноль совпадений в обоих случаях.

## Чего НЕ сделано и почему

- **Отдельной страницы `/settings/ozon` нет** — адрес есть и ведёт на карточку Ozon в хабе.
  С w12 экран площадки генерируется из реестра адаптеров; страница на площадку была бы копией
  карточки (подключение, права, загрузки, зеркала), которую перестанут обновлять (правило 20).
  Если Иван хочет именно отдельную страницу — это решение к нему, код к нему готов.
- **Доставка (ApiShip/СДЭК) помечена «скоро» без ссылки**: экран задачи i02 в `dev` на момент
  отчёта не влит (`git grep settings/delivery` в `origin/dev` — пусто). Когда i02 вольётся,
  в `mp-other-integrations.tsx` меняется одна строка `to: "/settings/delivery"`.
- **Ключа Ozon у магазина нет** — форма проверена выдуманной парой, ответ площадки честный
  («ключ не ответил»). Настоящий ключ Иван передаст позже; код его примет без изменений.
- **Живой хост не трогался**, деплой в задачу не входит.
- **Переключателя «выключить интеграцию, не удаляя ключ» нет**: сохранение включает интеграцию,
  удаление забывает ключ. Отдельный тумблер — при необходимости отдельная задача.

## Как приёмщику проверить за 10 минут

```bash
cd /Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-integration-keys-self-service

# 1. Свой стенд
/opt/homebrew/bin/createdb-17 -h 127.0.0.1 -p 5433 -U ivanprotsko upready_store_acc24 -T upready_store_cherkashina
sed -E 's#^DATABASE_URL=.*#DATABASE_URL=postgres://ivanprotsko@127.0.0.1:5433/upready_store_acc24#;
        s#^DB_NAME=.*#DB_NAME=upready_store_acc24#; s#^PORT=.*#PORT=9124#' \
  /Users/ivanprotsko/upready/projects/upready-store/apps/backend/.env > apps/backend/.env
printf 'VITE_MEDUSA_BACKEND_URL=http://localhost:9124\n' > apps/tenant-panel/.env
(cd apps/backend && ./node_modules/.bin/medusa db:migrate)

# 2. Пароль владелице стенда
(cd apps/backend && W14_OWNER_EMAIL=owner-cherkashino@example.test W14_OWNER_PASSWORD=<свой> \
   ./node_modules/.bin/medusa exec ./scripts/fixtures/w14-stand-owner-password.ts)

# 3. Поднять
(cd apps/backend && ./node_modules/.bin/medusa develop &)                 # :9124
(cd apps/tenant-panel && ./node_modules/.bin/vite --port 5196 --strictPort &)

# 4. Весь сценарий одной командой (сам возьмёт ключ из .env.cherkashino и сделает скриншоты)
(cd apps/tenant-panel && OWNER_PASSWORD=<свой> node e2e/w24-integration-keys.e2e.mjs)

# 5. Руками: http://localhost:5196 → войти → «Маркетплейсы» → «Подключение площадок»
#    → вставить ключ в «Токен Wildberries» → «Сохранить» → права и срок появляются без F5
#    → «Удалить» → подтвердить → «не сохранён». Внизу хаба — Robokassa и Доставка.

# 6. Остановить свои серверы по порту
/usr/sbin/lsof -t -nP -iTCP:9124 -sTCP:LISTEN | xargs -r kill
/usr/sbin/lsof -t -nP -iTCP:5196 -sTCP:LISTEN | xargs -r kill
```

## Экономия

- **Скрипт вместо раунда ревью.** Приёмка целиком в `apps/tenant-panel/e2e/w24-integration-keys.e2e.mjs`:
  один запуск ~50 с, 18 проверок, 6 скриншотов, и он же ловит то, что глазами не видно —
  что ключ не пришёл ни в один ответ `/tenants/*` (39 тел проверено) и что write-слот пуст.
  Повторная приёмка после правки стоит одну команду, а не проход по чек-листу.
- **Гвард вместо договорённости.** Три инварианта — «слот не write», «поля не пусты», «у поля есть
  подсказка и ссылка» — стоят в `guards.ts`, то есть проверяются при загрузке адаптера, а не
  человеком на ревью третьей площадки.
- **Тест поймал то, что тайпчек пропускает.** Конформанс-тест сверяет `credentialSlot` с
  `TENANT_INTEGRATION_PROVIDERS`: у колонки CHECK-констрейнт, и слот вне списка падал бы только
  на INSERT в проде (ровно этим уже обожглись на `wildberries_write`, см. комментарий модели).
- **Сабагентов не звал (0 вызовов).** Задача целиком в одном контексте; фан-аут стоил бы дороже
  чтения четырёх файлов.
- **Что автоматизировал бы дальше:** проверку «в строках панели нет команд» — сейчас это
  `git grep "pnpm --filter"` в приёмке, а должен быть юнит-тест по ru/en.json и по строкам
  адаптеров: подсказка владельцу, содержащая `pnpm`/`npx`/`docker`, — это дефект, который
  возвращается каждый раз, когда кто-то пишет hint «как есть сегодня».
- **Стоимость измерений:** самое дорогое — не токены, а перезапуски суиты: HTTP-спека поднимает
  движок ~12 с на прогон, поэтому чистые части (`buildCredentials`, конформанс) вынесены в юнит,
  где прогон 2 с, а в HTTP осталась только проводка.
