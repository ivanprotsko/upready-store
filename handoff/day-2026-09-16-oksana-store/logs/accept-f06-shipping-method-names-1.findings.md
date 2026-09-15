# Приёмка PR #45 · f06-shipping-method-names · round 1 — REJECTED

Приёмщик: headless `claude -p`, 2026-09-15 14:38 WITA. Замеры сделаны самостоятельно (правило 18f),
тексту PR не доверял.

## Вердикт

**REJECTED — единственная причина: PR не сливается.** Содержательно задача сделана, все
четыре критерия приёмки я подтвердил своими замерами (ниже). Нужен только ребейз.

---

## 1. БЛОКЕР — `mergeable: CONFLICTING`, `mergeStateStatus: DIRTY`

```
$ gh pr view 45 --json mergeable,mergeStateStatus
{"mergeStateStatus":"DIRTY","mergeable":"CONFLICTING"}
```

Конфликтует РОВНО ОДИН файл — `HANDOFF.json` (замер без слияния в рабочем дереве:
`git merge-tree $(git merge-base origin/dev origin/fix/day16-shipping-names) origin/dev origin/fix/day16-shipping-names`;
`changed in both` — только `HANDOFF.json`, все остальные 23 файла идут как `our`/`their` без
пересечения). Конфликт — поля `updated` и `status`:

* `origin/dev` (2286d43): `2026-09-15 13:43 WITA: f17-backend-image-sharp …`
* ветка (bd578da): `2026-09-15 14:28 WITA: f06-shipping-method-names — PR #45 открыт …`

**Что сделать:**

```bash
cd /Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-shipping-names
git fetch origin dev && git merge origin/dev
# разрешить HANDOFF.json (взять более свежий по ts статус, поля updated/status),
# остальное конфликтов не даёт
git push
```

Больше ничего в этом раунде чинить не надо.

---

## Что я замерил и что прошло

### Дерево и ветка

```
worktree /Users/.../fix/day16-shipping-names
git status --short  → пусто
HEAD = origin/fix/day16-shipping-names = bd578da
headRefName = fix/day16-shipping-names, baseRefName = dev  ✓
```

### Критерий 1 — `GET /store/shipping-options?cart_id=…` магазина Оксаны ✓

Мой собственный зонд (`/tmp/f06-accept-probe.mjs`, ключ из `/storefront/by-host`, живая
корзина с товаром «Свечи АСД с чесноком», регион rub), HTTP 200, полный JSON —
`artifacts/accept-f06-shipping-method-names-1/shipping-options-cherkashino.json`:

```
{"name":"Самовывоз","amount":0,"desc":"Заберите заказ у продавца.",
 "hint":"Адрес и время пришлём после заказа","tariff":{"kind":"flat","amount":0},
 "type_label":"Самовывоз","type_code":"pickup"}
{"name":"Курьером","amount":300,"desc":"До двери. Стоимость подтвердит магазин.",
 "tariff":{"kind":"flat","amount":300},"tariff_source":"provisioned-default",
 "type_label":"Курьером","type_code":"courier"}
```

Ни имени магазина, ни английских слов в `name`/`type.label`/`type.description`.
`type.code` (`pickup`/`courier`) — машинный код, на экран не попадает (проверено, см. критерий 2).

### Критерий 2 — экран чекаута ✓

Мои скриншоты (не из PR), `https://cherkashino.shipshift.dev/ru/checkout` с настоящей корзиной,
Playwright из основного чекаута:

* `accept-checkout-1280x900.png`
* `accept-checkout-390x844.png`

Текст карточек, снятый со страницы, оба размера одинаково:

```
Самовывоз / Заберите заказ у продавца. / Адрес и время пришлём после заказа / Бесплатно
Курьером  / До двери. Стоимость подтвердит магазин. / 300,00 ₽
```

Поиск по всему `body`: `Оксана Черкашина pickup` — нет, `/courier/i` — нет,
`Самовывоз` — есть, `Курьером` — есть. Глазами (1280×900): блок «Способ доставки» с двумя
карточками, у каждой цена и пояснение.

### Критерий 3 — повторный прогон ничего не меняет — принято по коду, без прогона на проде

Повторный прогон переименования — это операция записи в прод-БД, приёмщику она запрещена.
Судил по коду `apps/backend/src/scripts/rename-default-shipping-methods.ts` +
`isMachineMadeDefaultName` (`default-method-names.ts`): guard сравнивает имя на точное
равенство `${tenantName} pickup`/`${tenantName} courier`, уже переименованный способ
возвращает `null` и в `updates` не попадает; переоценка курьера дополнительно требует
`!existing` (нет tenant-`data`) и все цены равными `LEGACY_COURIER_AMOUNT`=10 — после первого
прогона оба условия ложны. `typeOnly`-ветка пишет `type` только при фактическом расхождении
label/description. Текущее живое состояние (критерий 1) совпадает с целевым, то есть третий
прогон в отчёте автора («все нули») согласуется с замером.

### Критерий 4 — соседний тенант не тронут ✓

```
node /tmp/f06-accept-probe.mjs zolotaya-nit-1057.shipshift.dev   → HTTP 200
{"name":"Золотая нить pickup","amount":0,"desc":null,"type_label":"Pickup"}
{"name":"Золотая нить courier","amount":10,"desc":null,"type_label":"Courier"}
```

Полный JSON — `artifacts/accept-f06-shipping-method-names-1/shipping-options-zolotaya-nit.json`.
Витрины обоих тенантов: `https://cherkashino.shipshift.dev/ru/` и
`https://zolotaya-nit-1057.shipshift.dev/ru/` → `308`, `ssl_verify_result=0` (редирект на
`/ru`, нормально).

### Проверки репозитория

```
apps/backend$ npx tsc --noEmit                        rc=0, без вывода
apps/backend$ TEST_TYPE=unit npx jest src/shipping-tariffs
                Test Suites: 2 passed, Tests: 15 passed, rc=0
```

### Ревью диффа — блокирующих замечаний нет

* Секретов, миграций, удалений, правок защищённой инфраструктуры в диффе нет.
* `docker-entrypoint.sh` шаг 5 — косметический, под `set +e`, с логом при ненулевом коде;
  по форме и комментарию совпадает с соседними шагами 2–4. Возражений нет.
* Скоуп-крипа не вижу: `option-type.ts` / `sync-option-type.ts` появились потому, что
  `updateShippingOptionsWorkflow` не пишет вложенный `type` — без этого имя способа
  расходилось бы с его type-строкой; это часть той же задачи.
* Решение «300 ₽ + пометка `tariff_source: provisioned-default` вместо скрытия способа»
  задача разрешала прямо («state the choice and its reason»), обоснование в PR приведено.

## Мелочи (не причина отклонения, чинить по желанию вместе с ребейзом)

1. Карточка «Самовывоз»: подсказка «Адрес и время пришлём после заказа» переносится на две
   строки и прижимает «Бесплатно» вплотную (видно на `accept-checkout-1280x900.png`). Автор
   сам это называет; лечится одной строкой в `default-method-names.ts`.
2. Локаль в шаге 5 энтрипойнта одна на весь бэкенд (`STOREFRONT_DEFAULT_LOCALE`), поэтому все
   тенанты стенда сойдутся на имена ОДНОЙ локали независимо от языка магазина. Для текущего
   стенда (все магазины ru) это верно; когда появится тенант на другом языке — понадобится
   локаль на тенанта. Отдельной задачей, не здесь.
3. Панель `/shipping` с бейджем «Стоимость по умолчанию — укажите свою» глазами не проверена
   ни автором, ни мной (нужен пароль владелицы). Остаётся непокрытым замером.
